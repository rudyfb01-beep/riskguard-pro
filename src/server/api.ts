import express from 'express';
import { getPool } from './db';
import { ensureDatabase } from './bootstrap-db';
import {
  appendLedger, deleteEntity, EntityName, isEntity, loadAll, saveEntity, saveSetting, SETTING_KEYS, SettingKey,
} from './repository';
import {
  AuthError, clearSessionCookie, clientIp, currentUser, destroySession, getSessionUser, hasAny, readSessionCookie,
  requestLoginCode, requireAuth, requireCsrfHeader, setSessionCookie, verifyLoginCode,
} from './auth';
import { UserPermissions, UserProfile } from '../app/models/risk.model';

let ready: ReturnType<typeof ensureDatabase> | null = null;

/** Prepara la base una sola vez (migración + datos base). `force` reintenta. */
export function getDbReady(force = false) {
  if (!ready || force) {
    ready = ensureDatabase();
    ready.catch(() => { ready = null; }); // permite reintentar en la próxima petición
  }
  return ready;
}

/** Permisos que autorizan guardar o eliminar cada entidad (basta uno). */
const WRITE_PERMISSIONS: Record<EntityName, (keyof UserPermissions)[]> = {
  roles: ['canManageRoles'],
  users: ['canManageRoles'],
  controls: ['canEvaluateControls', 'canEditRisks'],
  // Evaluar un control o convertir una incidencia recalcula/crea riesgos.
  risks: ['canEditRisks', 'canConvertFlaws', 'canEvaluateControls'],
  providers: ['canManageProviders'],
  'regulatory-milestones': ['canManageRegulatoryReports'],
  flaws: ['canReportFlaws', 'canConvertFlaws', 'canManageRegulatoryReports'],
  alerts: ['canAcknowledgeAlerts', 'canConfigureKRIs', 'canReportFlaws'],
  audits: ['canExecuteAudits'],
  kris: ['canConfigureKRIs'],
  bia: ['canManageContinuity'],
  plans: ['canManageContinuity'],
  'continuity-tests': ['canManageContinuity'],
  'info-assets': ['canManageInfoSecurity'],
  vulnerabilities: ['canManageInfoSecurity'],
  'security-assessment': ['canManageInfoSecurity'],
};

const SETTING_PERMISSIONS: Record<SettingKey, (keyof UserPermissions)[]> = {
  current_industry: ['canConfigureKRIs'],
  global_notification_preferences: ['canConfigureKRIs'],
  loss_registration_threshold_usd: ['canManageRegulatoryReports'],
};

/** Mensajes comprensibles para errores de PostgreSQL frecuentes. */
function friendlyDbError(err: unknown): string {
  const e = err as { code?: string; message?: string; constraint?: string };
  switch (e.code) {
    case '23505': return `Ya existe un registro con ese valor único (${e.constraint ?? 'código o correo'}).`;
    case '23503': return 'El registro hace referencia a otro que no existe o fue eliminado.';
    case '23514': return `Valor no permitido (${e.constraint ?? 'regla de validación'}).`;
    default: return e.message ?? 'Error desconocido';
  }
}

export const dataApi = express.Router();

// Toda escritura en /api debe llevar la cabecera anti-CSRF.
dataApi.use(requireCsrfHeader);

// -----------------------------------------------------------------------------
// Autenticación
// -----------------------------------------------------------------------------

function sendAuthError(res: express.Response, err: unknown) {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error('[Auth]', err);
    res.status(500).json({ error: 'Error interno al procesar el inicio de sesión.' });
  }
}

dataApi.get('/auth/me', async (req, res) => {
  if (!getPool()) {
    res.json({ mode: 'demo' });
    return;
  }
  try {
    await getDbReady();
    const user = await getSessionUser(readSessionCookie(req));
    if (!user) {
      res.status(401).json({ error: 'Sesión no iniciada.' });
      return;
    }
    res.json({ mode: 'database', user });
  } catch (err) {
    res.status(503).json({ error: `Base de datos no disponible: ${(err as Error).message}` });
  }
});

dataApi.post('/auth/request-code', async (req, res) => {
  if (!getPool()) {
    res.status(503).json({ error: 'Base de datos no configurada.' });
    return;
  }
  try {
    await getDbReady();
    await requestLoginCode(req.body?.email, clientIp(req));
    res.json({ ok: true, message: 'Si el correo está registrado, te enviamos un código de acceso.' });
  } catch (err) {
    sendAuthError(res, err);
  }
});

dataApi.post('/auth/verify', async (req, res) => {
  if (!getPool()) {
    res.status(503).json({ error: 'Base de datos no configurada.' });
    return;
  }
  try {
    await getDbReady();
    const { token, user, maxAgeSeconds } = await verifyLoginCode(req.body?.email, req.body?.code, clientIp(req), req.get('user-agent') ?? '');
    setSessionCookie(req, res, token, maxAgeSeconds);
    res.json({ user });
  } catch (err) {
    sendAuthError(res, err);
  }
});

dataApi.post('/auth/logout', async (req, res) => {
  try {
    if (getPool()) await destroySession(readSessionCookie(req), clientIp(req));
  } finally {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  }
});

// -----------------------------------------------------------------------------
// Datos (requieren sesión)
// -----------------------------------------------------------------------------

/** Sin DATABASE_URL la app funciona en modo demostración: no hay API de datos. */
dataApi.use(['/data', '/ledger', '/settings'], async (req, res, next) => {
  if (!getPool()) {
    if (req.method === 'GET' && req.baseUrl.endsWith('/data') && req.path === '/') {
      res.json({ mode: 'demo' });
      return;
    }
    res.status(503).json({ error: 'Base de datos no configurada (modo demostración).' });
    return;
  }
  try {
    await getDbReady();
    next();
  } catch (err) {
    res.status(503).json({ error: `Base de datos no disponible: ${(err as Error).message}` });
  }
}, requireAuth);

function authorize(res: express.Response, perms: (keyof UserPermissions)[], what: string): boolean {
  if (hasAny(currentUser(res), perms)) return true;
  res.status(403).json({ error: `Tu cargo no tiene permiso para modificar ${what}.` });
  return false;
}

/** Evita dejar el sistema sin ningún usuario activo capaz de administrar cargos. */
async function wouldLeaveNoAdmin(changedUserId: string, next: UserProfile | null): Promise<boolean> {
  if (next && next.active !== false && next.permissions?.canManageRoles) return false;
  const r = await getPool()!.query(
    `SELECT count(*)::int AS n FROM user_profiles
      WHERE id <> $1 AND active = TRUE AND (permissions->>'canManageRoles')::boolean = TRUE`,
    [changedUserId]
  );
  return r.rows[0].n === 0;
}

dataApi.get('/data', async (_req, res) => {
  try {
    res.json({ mode: 'database', ...(await loadAll()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

dataApi.put('/data/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  const body = req.body as { id?: string } | undefined;
  if (!isEntity(entity)) {
    res.status(404).json({ error: `Entidad desconocida: ${entity}` });
    return;
  }
  if (!body || typeof body !== 'object' || body.id !== id) {
    res.status(400).json({ error: 'El cuerpo debe ser el objeto completo con el mismo id de la URL.' });
    return;
  }
  if (!authorize(res, WRITE_PERMISSIONS[entity], entity)) return;
  try {
    if (entity === 'users') {
      const u = body as UserProfile;
      if (u.id === currentUser(res)!.id && u.active === false) {
        res.status(400).json({ error: 'No puedes desactivar tu propio usuario.' });
        return;
      }
      if (await wouldLeaveNoAdmin(u.id, u)) {
        res.status(409).json({ error: 'Debe quedar al menos un usuario activo con permiso para administrar cargos.' });
        return;
      }
    }
    await saveEntity(entity, body as { id: string });
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: friendlyDbError(err) });
  }
});

dataApi.delete('/data/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  if (!isEntity(entity)) {
    res.status(404).json({ error: `Entidad desconocida: ${entity}` });
    return;
  }
  if (!authorize(res, WRITE_PERMISSIONS[entity], entity)) return;
  try {
    if (entity === 'users') {
      if (id === currentUser(res)!.id) {
        res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
        return;
      }
      if (await wouldLeaveNoAdmin(id, null)) {
        res.status(409).json({ error: 'Debe quedar al menos un usuario activo con permiso para administrar cargos.' });
        return;
      }
    }
    await deleteEntity(entity, id);
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: friendlyDbError(err) });
  }
});

dataApi.post('/ledger', async (req, res) => {
  const b = req.body ?? {};
  const required = ['id', 'action', 'entityType', 'entityCode', 'details'];
  if (required.some(k => typeof b[k] !== 'string' || !b[k])) {
    res.status(400).json({ error: `Campos requeridos: ${required.join(', ')}` });
    return;
  }
  try {
    // El autor del bloque es siempre el usuario de la sesión, no lo que diga el cliente.
    const user = currentUser(res)!;
    const entry = await appendLedger(
      { id: b.id, userName: user.name, userRole: user.role, action: b.action, entityType: b.entityType, entityCode: b.entityCode, details: b.details },
      clientIp(req)
    );
    res.json(entry);
  } catch (err) {
    res.status(422).json({ error: friendlyDbError(err) });
  }
});

/** Bitácora completa (para resincronizar la cadena cuando otro usuario agregó bloques). */
dataApi.get('/ledger', async (_req, res) => {
  try {
    const all = await loadAll();
    res.json(all.ledger);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

dataApi.put('/settings/:key', async (req, res) => {
  const key = req.params.key;
  if (!(SETTING_KEYS as readonly string[]).includes(key)) {
    res.status(404).json({ error: `Ajuste desconocido: ${key}` });
    return;
  }
  if (!authorize(res, SETTING_PERMISSIONS[key as SettingKey], 'este ajuste')) return;
  try {
    await saveSetting(key as SettingKey, req.body?.value);
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: friendlyDbError(err) });
  }
});
