import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import {GoogleGenAI} from '@google/genai';
import {
  checkDbHealth,
  getDbStats,
  getPool,
  dialect,
  getSqlitePath,
} from './server/db';
import { dataApi, getDbReady } from './server/api';
import { startNotifier } from './server/notifier';
import { startBackupScheduler } from './server/backup';
import { currentUser, hasAny, requireAuth, requireCsrfHeader } from './server/auth';
import { apiRateLimit, checkOrigin, errorHandler, requestId, securityHeaders, serverError } from './server/security';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
// Hosts aceptados para el renderizado en el servidor (protección SSRF de Angular): equipo local y APP_URL.
// NG_ALLOWED_HOSTS (lista separada por comas) reemplaza esta lista, p. ej. para incluir la IP del equipo en la red.
const allowedHosts = ['localhost', '127.0.0.1', '[::1]'];
try {
  if (process.env['APP_URL']) allowedHosts.push(new URL(process.env['APP_URL']).hostname);
} catch { /* APP_URL inválida: se ignora */ }
const angularApp = new AngularNodeAppEngine({ allowedHosts });

// Límite amplio: las evidencias de controles pueden incluir archivos adjuntos.
// Detrás de un proxy inverso (HTTPS), TRUST_PROXY permite conocer la IP real y si la conexión es segura.
if (process.env['TRUST_PROXY']) {
  const v = process.env['TRUST_PROXY'];
  app.set('trust proxy', v === 'true' ? true : /^\d+$/.test(v) ? Number(v) : v);
}
app.disable('x-powered-by');

// Identificador por solicitud, cabeceras de seguridad (CSP, HSTS…), origen de las escrituras y
// límite de solicitudes a la API (ver src/server/security.ts y SECURITY.md).
app.use(requestId, securityHeaders);
app.use('/api', checkOrigin, apiRateLimit);

// Límite amplio: las evidencias de controles pueden incluir archivos adjuntos.
app.use(express.json({ limit: process.env['JSON_LIMIT'] || '15mb' }));

// Las funciones de IA y el diagnóstico de la base requieren sesión.
app.use('/api/ai', requireCsrfHeader, requireAuth);
app.use(['/api/db/stats', '/api/db/init'], requireCsrfHeader, requireAuth);

/** Modelo de Gemini (GEMINI_MODEL). */
const geminiModel = () => process.env['GEMINI_MODEL'] || 'gemini-3.8-flash';

// Initialize Gemini Client on demand
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (aiClient) return aiClient;
  const apiKey = process.env['GEMINI_API_KEY'];
  if (apiKey) {
    try {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (err) {
      console.warn('Could not initialize GoogleGenAI client:', err);
    }
  }
  return aiClient;
}

// AI Endpoint: Analizar incidencia/evento de pérdida o falla de control y transformarla en riesgo operacional evaluado con controles
const handleAnalyzeIncidencia = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { falencia, incidencia, processHint, incidentType } = req.body;
    const currency = req.body?.currency === 'CLP' ? 'pesos chilenos (CLP)' : 'dólares (USD)';
    const desc = incidencia || falencia;
    if (!desc || typeof desc !== 'string') {
      res.status(400).json({ error: 'La descripción de la incidencia o evento es requerida.' });
      return;
    }

    const ai = getAiClient();
    if (ai) {
      const prompt = `Actúa como Oficial Senior de Gestión de Riesgo Operacional (Chief Risk Officer) bajo estándares Basilea III e ISO 31000.
Analiza la siguiente incidencia, evento de pérdida o falla de control detectada en la operación interna:
"${desc}"
${processHint ? `Proceso involucrado: ${processHint}` : ''}
${incidentType ? `Tipo de evento: ${incidentType}` : ''}

Devuelve un JSON estrictamente válido con la siguiente estructura:
{
  "title": "Título conciso y profesional del riesgo",
  "category": "Una de: Fraude Interno | Fraude Externo | Fallas Tecnológicas | Ejecución y Procesos | Prácticas Laborales | Daño a Activos Físicos | Cumplimiento Normativo",
  "inherentLikelihood": número entero del 1 al 4 (1: Improbable, 2: Posible, 3: Probable, 4: Frecuente),
  "inherentImpact": número entero del 1 al 4 (1: Menor, 2: Moderado, 3: Mayor, 4: Catastrófico),
  "financialExposureEstUSD": estimación numérica en ${currency} de pérdida potencial (solo el número),
  "technicalDescription": "Descripción ejecutiva del mecanismo de falla",
  "suggestedControls": [
    {
      "name": "Nombre del control",
      "type": "Preventivo" o "Detectivo" o "Correctivo",
      "automation": "Automático" o "Semiautomático" o "Manual",
      "effectivenessPct": número entre 40 y 95,
      "description": "Explicación del control"
    }
  ],
  "mitigationPlan": {
    "title": "Plan de Mitigación Proactivo",
    "recommendedActions": ["Paso 1", "Paso 2", "Paso 3"],
    "targetDays": días sugeridos para completarlo (número),
    "priority": "Crítica" o "Alta" o "Media"
  }
}`;

      try {
        const response = await ai.models.generateContent({
          model: geminiModel(),
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });
        const responseText = response.text;
        if (responseText) {
          res.json({ success: true, data: JSON.parse(responseText) });
          return;
        }
      } catch (err) {
        // Si el servicio de IA falla, se usa el análisis heurístico de abajo.
        console.warn('[IA] Análisis no disponible, se usa el heurístico:', (err as Error).message);
      }
    }

    // Heuristic intelligent fallback if AI key not configured or temporarily unavailable
    const fallbackCategory = desc.toLowerCase().includes('clave') || desc.toLowerCase().includes('contraseña') || desc.toLowerCase().includes('sistema') || desc.toLowerCase().includes('servidor')
      ? 'Fallas Tecnológicas'
      : desc.toLowerCase().includes('dinero') || desc.toLowerCase().includes('robo') || desc.toLowerCase().includes('fraude') || desc.toLowerCase().includes('autoriza')
      ? 'Fraude Interno'
      : desc.toLowerCase().includes('norma') || desc.toLowerCase().includes('ley') || desc.toLowerCase().includes('regula')
      ? 'Cumplimiento Normativo'
      : 'Ejecución y Procesos';

    res.json({
      success: true,
      data: {
        title: `Riesgo detectado: ${desc.slice(0, 50)}...`,
        category: fallbackCategory,
        process: processHint || 'Operaciones Centrales',
        inherentLikelihood: 4,
        inherentImpact: 4,
        financialExposureEstUSD: req.body?.currency === 'CLP' ? 120_000_000 : 125000,
        technicalDescription: `Vulnerabilidad identificada a partir de deficiencia o evento reportado: ${desc}`,
        suggestedControls: [
          {
            name: 'Segregación estricta de funciones y doble factor de aprobación',
            type: 'Preventivo',
            automation: 'Automático',
            effectivenessPct: 80,
            description: 'Implementar flujo automatizado donde ninguna operación crítica pueda completarse sin doble autorización independiente.'
          },
          {
            name: 'Monitoreo continuo de excepciones y registros de auditoría',
            type: 'Detectivo',
            automation: 'Semiautomático',
            effectivenessPct: 75,
            description: 'Generar alarmas automáticas al sobrepasar umbrales de actividad o ante modificaciones fuera de horario laboral.'
          }
        ],
        mitigationPlan: {
          title: 'Plan de Contención y Mitigación Operativa',
          recommendedActions: [
            'Revocar accesos no conformes y auditar autorizaciones previas',
            'Desplegar política de control de cuatro ojos obligatoria',
            'Realizar prueba de eficacia de control a los 30 días'
          ],
          targetDays: 15,
          priority: 'Alta'
        }
      }
    });
  } catch (error: unknown) {
    serverError(res, error, req);
  }
};

app.post('/api/ai/analyze-incidencia', handleAnalyzeIncidencia);
app.post('/api/ai/analyze-falencia', handleAnalyzeIncidencia);

// AI Endpoint: Dictamen de Comité de Riesgo
app.post('/api/ai/generate-executive-summary', async (req, res): Promise<void> => {
  try {
    const { metrics, topRisks } = req.body;
    const currency = req.body?.currency === 'CLP' ? 'pesos chilenos (CLP)' : 'dólares (USD)';
    const ai = getAiClient();
    if (ai) {
      const prompt = `Genera un dictamen ejecutivo formal para el Comité de Auditoría y Riesgos basado en estos datos de gestión operacional:
Métricas: ${JSON.stringify(metrics)}
Top Riesgos: ${JSON.stringify(topRisks)}
Los montos están expresados en ${currency}.

Escribe un resumen en español de 2 párrafos concisos y de alto nivel gerencial destacando el apetito de riesgo, la efectividad global de los controles y 3 recomendaciones clave.`;

      try {
        const response = await ai.models.generateContent({ model: geminiModel(), contents: prompt });
        if (response.text) {
          res.json({ success: true, summary: response.text });
          return;
        }
      } catch (err) {
        console.warn('[IA] Resumen no disponible, se usa el calculado:', (err as Error).message);
      }
    }

    res.json({
      success: true,
      summary: (() => {
        const m = (metrics ?? {}) as { mitigationEfficiencyPct?: number; activeAlertsCount?: number; avgControlEffectiveness?: number };
        const top = Array.isArray(topRisks) ? (topRisks as { code: string; title: string; residualLevel: string }[]).slice(0, 3) : [];
        return `Durante el periodo, la mitigación de la exposición alcanza ${m.mitigationEfficiencyPct ?? '—'}% y la efectividad promedio de los controles ${m.avgControlEffectiveness ?? '—'}%. `
          + `Hay ${m.activeAlertsCount ?? 0} alerta(s) de KRI activa(s) o en investigación.`
          + (top.length ? ` Se recomienda priorizar los riesgos ${top.map(r => `${r.code} (${r.residualLevel})`).join(', ')} y verificar que se mantengan dentro del apetito aprobado por el Consejo de Administración.` : '')
          + ' (Resumen generado sin IA: configure GEMINI_API_KEY para un análisis redactado.)';
      })()
    });
  } catch {
    res.status(500).json({ error: 'Error generando resumen ejecutivo' });
  }
});

// Database Health & Diagnostic Endpoints
app.get('/api/db/health', async (req, res): Promise<void> => {
  // Público (lo usa el healthcheck de Docker): solo informa si hay conexión.
  try {
    const health = await checkDbHealth();
    res.status(health.connected || !getPool() ? 200 : 503).json({ connected: health.connected });
  } catch {
    res.status(503).json({ connected: false });
  }
});

app.get('/api/db/stats', async (req, res): Promise<void> => {
  try {
    const stats = await getDbStats();
    res.json({ success: true, stats });
  } catch (err) {
    serverError(res, err, req);
  }
});

app.post('/api/db/init', async (req, res): Promise<void> => {
  if (getPool() && !hasAny(currentUser(res), ['canManageRoles'])) {
    res.status(403).json({ error: 'Requiere permiso para administrar cargos.' });
    return;
  }
  try {
    const result = await getDbReady(true);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// API de datos: carga inicial, guardado por entidad, bitácora y ajustes.
app.use('/api', dataApi);
// Rutas de la API inexistentes: 404 en JSON (no se renderiza la aplicación).
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Recurso no encontrado.' }); });

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

// Errores no controlados, sin detalles internos.
app.use(errorHandler);

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
    if (getPool()) {
      const engine = dialect() === 'sqlite' ? `SQLite (${getSqlitePath()})` : 'PostgreSQL';
      getDbReady()
        .then(r => console.log(`[Base de datos] ${engine}: esquema al día${r.baseSeeded ? ' · datos base cargados' : ''}${r.demoSeeded ? ' · datos de ejemplo cargados' : ''}.`))
        .catch(err => console.error(`[Base de datos] ${engine}: no se pudo preparar la base de datos:`, (err as Error).message));
    } else {
      console.log('[Base de datos] DB_CLIENT=none: la aplicación funciona en modo demostración (sin guardar).');
    }
    // Avisos por plazos y envío de correos (cada NOTIFY_INTERVAL_MINUTES).
    startNotifier(() => getDbReady());
    startBackupScheduler(() => getDbReady());
    if (getPool() && !process.env['SMTP_HOST']) {
      console.warn(process.env['AUTH_DEV_LOG_CODES'] === 'true'
        ? '[Auth] ATENCIÓN: SMTP no configurado; los códigos de acceso se escriben en este log. Usar solo para evaluación.'
        : '[Auth] SMTP no configurado (SMTP_HOST): nadie podrá recibir el código para iniciar sesión.');
    }
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
