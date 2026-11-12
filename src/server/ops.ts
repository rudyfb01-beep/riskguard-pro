import express from 'express';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { checkDbHealth, dialect, getPool, getSqlitePath } from './db';
import { appendLedger, getSetting, verifyLedgerChain } from './repository';
import { clientIp, currentUser, hasAny } from './auth';
import { isMailConfigured } from './mailer';
import {
  appVersion, backupDir, backupIntervalHours, backupKeep, backupPath, BackupStatus, listBackups, runBackup, verifyBackup,
} from './backup';
import { googleConfig } from './google-sso';
import { normalizeUfTable } from '../app/utils/uf';
import { serverError } from './security';

/**
 * Operación: salud del servicio, respaldos y revisión de la configuración.
 * /api/health (vivo) y /api/ready (listo) son públicos para el monitoreo; el resto requiere sesión
 * de quien administra cargos o mantenedores.
 */

const startedAt = new Date();

export interface ConfigFinding { level: 'alta' | 'media' | 'baja'; text: string }

/** Revisión de la configuración del servidor (lo que conviene corregir antes de producción). */
export function configFindings(req?: express.Request): ConfigFinding[] {
  const env = process.env;
  const out: ConfigFinding[] = [];
  const prod = env['NODE_ENV'] === 'production';
  if (env['AUTH_DEV_LOG_CODES'] === 'true') out.push({ level: 'alta', text: 'AUTH_DEV_LOG_CODES=true: los códigos de acceso quedan en el log. Solo para evaluar.' });
  if (env['NOTIFY_DEV_LOG'] === 'true') out.push({ level: 'media', text: 'NOTIFY_DEV_LOG=true: el contenido de los avisos queda en el log.' });
  if (!env['AUTH_SECRET']) out.push({ level: 'media', text: 'Sin AUTH_SECRET: los códigos pendientes se invalidan al reiniciar y no sirve con varias instancias.' });
  else if (env['AUTH_SECRET'].length < 32) out.push({ level: 'alta', text: 'AUTH_SECRET es corto: use al menos 32 caracteres aleatorios.' });
  if (!isMailConfigured()) {
    out.push(env['AUTH_TOTP'] === 'true'
      ? { level: 'media', text: 'SMTP no configurado: el ingreso es con aplicación autenticadora y los avisos quedan solo en la campana (sin correo).' }
      : { level: 'alta', text: 'SMTP no configurado: nadie recibe códigos de acceso ni avisos por correo.' });
  }
  if (env['SEED_DEMO_DATA'] === 'true') out.push({ level: 'media', text: 'SEED_DEMO_DATA=true: en una base vacía se cargan datos ficticios. Use false en producción.' });
  const url = env['APP_URL'] ?? '';
  if (!url) out.push({ level: 'media', text: 'Sin APP_URL: los correos no llevan enlace directo.' });
  else if (prod && url.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(url)) out.push({ level: 'alta', text: 'APP_URL usa http: publique la aplicación con HTTPS.' });
  if (url.startsWith('https://') && env['COOKIE_SECURE'] !== 'true' && !env['TRUST_PROXY']) {
    out.push({ level: 'media', text: 'Con HTTPS detrás de un proxy defina TRUST_PROXY (o COOKIE_SECURE=true) para que la cookie de sesión sea Secure.' });
  }
  if (req && !req.secure && prod && !/localhost|127\.0\.0\.1/.test(req.hostname)) out.push({ level: 'alta', text: 'Esta conexión no es HTTPS.' });
  if (/postgrespassword|:postgres@/.test(env['DATABASE_URL'] ?? '') || env['POSTGRES_PASSWORD'] === 'postgres') out.push({ level: 'alta', text: 'La contraseña de PostgreSQL es la de ejemplo: cámbiela.' });
  if (env['DATABASE_URL'] && env['DATABASE_SSL'] !== 'true' && !/@(localhost|127\.0\.0\.1|postgres|db)[:/]/.test(env['DATABASE_URL'])) {
    out.push({ level: 'media', text: 'PostgreSQL remoto sin DATABASE_SSL=true: la conexión no va cifrada.' });
  }
  if (!(backupIntervalHours() > 0)) out.push({ level: 'alta', text: 'Respaldos programados desactivados (BACKUP_INTERVAL_HOURS=0).' });
  if (!env['BACKUP_DIR']) out.push({ level: 'baja', text: `Respaldos en ${backupDir()}: conviene que BACKUP_DIR apunte a un disco o volumen distinto del de la base, y copiarlos fuera del servidor.` });
  if (env['WEBHOOK_ALLOW_PRIVATE'] === 'true') out.push({ level: 'media', text: 'WEBHOOK_ALLOW_PRIVATE=true: los webhooks de alertas pueden apuntar a la red interna. Úselo solo con destinos de confianza.' });
  const g = googleConfig();
  if (g.enabled && !g.domains.length) out.push({ level: 'media', text: 'Ingreso con Google sin GOOGLE_ALLOWED_DOMAINS: se acepta cualquier cuenta de Google registrada como usuario.' });
  return out;
}

/** Sin registro en la base (p. ej. tras restaurar), se informa el respaldo más reciente de la carpeta. */
const lastFromList = (list: ReturnType<typeof listBackups>): BackupStatus | null =>
  list[0] ? { ok: true, at: list[0].createdAt, file: list[0].file, size: list[0].size } : null;

/**
 * Configuración que impide arrancar: sin base de datos nunca; en producción (NODE_ENV=production),
 * además, lo que dejaría la instalación insegura o sin forma de ingresar.
 */
export function startupConfigErrors(): string[] {
  const env = process.env;
  const out: string[] = [];
  const db = (env['DB_CLIENT'] || '').trim().toLowerCase();
  if (db === 'none' || db === 'memory') out.push('DB_CLIENT=none ya no se admite: la aplicación necesita PostgreSQL o SQLite.');
  else if (!getPool()) out.push('No se pudo abrir la base de datos: revise DATABASE_URL (PostgreSQL) o SQLITE_PATH.');
  if (env['NODE_ENV'] !== 'production') return out;
  if (env['AUTH_DEV_LOG_CODES'] === 'true') out.push('AUTH_DEV_LOG_CODES=true: los códigos de acceso quedarían en el log. Use false y configure SMTP.');
  if (env['NOTIFY_DEV_LOG'] === 'true') out.push('NOTIFY_DEV_LOG=true: el contenido de los avisos quedaría en el log.');
  if (env['SEED_DEMO_DATA'] === 'true') out.push('SEED_DEMO_DATA=true: los datos de ejemplo solo se permiten fuera de producción.');
  if (!env['AUTH_SECRET'] || env['AUTH_SECRET'].length < 32) out.push('AUTH_SECRET debe tener al menos 32 caracteres aleatorios (p. ej. openssl rand -hex 32).');
  if (!env['APP_URL']) out.push('Defina APP_URL con la dirección pública (p. ej. https://grc.cooperativa.cl).');
  const g = googleConfig();
  if (!isMailConfigured() && env['AUTH_TOTP'] !== 'true' && (!g.enabled || g.emailCode !== 'false')) {
    out.push('Configure SMTP_HOST (y SMTP_USER/SMTP_PASS/SMTP_FROM) o active AUTH_TOTP=true (aplicación autenticadora): sin correo nadie recibe el código de acceso.');
  }
  if (/:(postgrespassword|postgres|changeme|password)@/i.test(env['DATABASE_URL'] ?? '') || ['postgrespassword', 'postgres'].includes(env['POSTGRES_PASSWORD'] ?? '')) {
    out.push('La contraseña de PostgreSQL es la de ejemplo: use una contraseña propia.');
  }
  return out;
}

const can = (res: express.Response) => hasAny(currentUser(res), ['canManageRoles', 'canManageCatalogs']);
const canBackup = (res: express.Response) => hasAny(currentUser(res), ['canManageRoles']);

async function dbSize(): Promise<number | null> {
  try {
    if (dialect() === 'sqlite') {
      const f = getSqlitePath();
      return ['', '-wal'].reduce((n, s) => n + (existsSync(f + s) ? statSync(f + s).size : 0), 0);
    }
    return Number((await getPool()!.query('SELECT pg_database_size(current_database()) AS n')).rows[0].n);
  } catch {
    return null;
  }
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  try { return Number((await getPool()!.query(sql, params)).rows[0]?.n ?? 0); } catch { return 0; }
}

export const opsRouter = express.Router();

/** Vivo: el proceso responde (para reiniciarlo si deja de hacerlo). */
opsRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: appVersion(), uptimeSeconds: Math.round(process.uptime()) });
});

/** Listo: hay base de datos y responde (para enviarle tráfico). */
opsRouter.get('/ready', async (_req, res) => {
  if (!getPool()) {
    res.status(503).json({ status: 'not-ready', database: 'none' });
    return;
  }
  const h = await checkDbHealth().catch(() => ({ connected: false }));
  res.status(h.connected ? 200 : 503).json({ status: h.connected ? 'ready' : 'not-ready', database: dialect() });
});

opsRouter.get('/admin/ops', async (req, res) => {
  if (!can(res)) {
    res.status(403).json({ error: 'Requiere permiso para administrar cargos o mantenedores.' });
    return;
  }
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [mail, ledger, lastBackup, notifierLast, ufLast, ufValues] = await Promise.all([
      getPool()!.query(`SELECT email_status AS s, count(*) AS n FROM notifications WHERE created_at > $1 GROUP BY email_status`, [since]).then(r => r.rows).catch(() => []),
      verifyLedgerChain(),
      getSetting('backup_last') as Promise<BackupStatus | undefined>,
      getSetting('notifier_last_run'),
      getSetting('uf_sync_last'),
      getSetting('uf_values'),
    ]);
    const ufDays = Object.keys(normalizeUfTable(ufValues)).sort();
    const list = listBackups();
    const mem = process.memoryUsage();
    res.json({
      app: {
        version: appVersion(), node: process.version, env: process.env['NODE_ENV'] ?? 'development', startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(mem.rss / 1048576), tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      database: {
        engine: dialect() === 'sqlite' ? 'SQLite' : 'PostgreSQL', sizeBytes: await dbSize(),
        users: await count('SELECT count(*) AS n FROM user_profiles WHERE active = TRUE'),
        activeSessions: await count('SELECT count(*) AS n FROM auth_sessions WHERE expires_at > $1', [new Date().toISOString()]),
        evidenceFiles: await count('SELECT count(*) AS n FROM evidence_files'),
      },
      ledger,
      backups: {
        dir: backupDir(), intervalHours: backupIntervalHours(), keep: backupKeep(), last: lastBackup ?? lastFromList(list), list: list.slice(0, 30),
        canRun: canBackup(res),
      },
      notifier: { intervalMinutes: Number(process.env['NOTIFY_INTERVAL_MINUTES'] ?? 15), lastRun: notifierLast ?? null },
      mail: { configured: isMailConfigured(), last24h: Object.fromEntries(mail.map((r: { s: string; n: number }) => [r.s, Number(r.n)])) },
      uf: { lastSync: ufLast ?? null, lastValueDate: ufDays[ufDays.length - 1] ?? null, values: ufDays.length },
      config: configFindings(req),
    });
  } catch (err) {
    serverError(res, err);
  }
});

opsRouter.post('/admin/backups', async (req, res) => {
  if (!canBackup(res)) {
    res.status(403).json({ error: 'Requiere permiso para administrar cargos.' });
    return;
  }
  try {
    const u = currentUser(res)!;
    res.json(await runBackup('manual', { name: u.name, role: u.role }, clientIp(req)));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

opsRouter.post('/admin/backups/:file/verify', async (req, res) => {
  if (!canBackup(res)) {
    res.status(403).json({ error: 'Requiere permiso para administrar cargos.' });
    return;
  }
  res.json(await verifyBackup(req.params.file));
});

/** Descarga de un respaldo (contiene todos los datos: solo administración de cargos). */
opsRouter.get('/admin/backups/:file', (req, res) => {
  if (!canBackup(res)) {
    res.status(403).json({ error: 'Requiere permiso para administrar cargos.' });
    return;
  }
  const path = backupPath(req.params.file);
  if (!path || !existsSync(path)) {
    res.status(404).json({ error: 'Respaldo no encontrado.' });
    return;
  }
  const u = currentUser(res)!;
  void appendLedger({
    id: `log-backup-dl-${Date.now()}`, userName: u.name, userRole: u.role, action: 'RESPALDO_BASE', entityType: 'Sistema',
    entityCode: req.params.file, details: `Descarga del respaldo ${req.params.file}.`,
  }, clientIp(req)).catch(() => undefined);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.file}"`);
  res.setHeader('Content-Length', String(statSync(path).size));
  res.setHeader('Cache-Control', 'no-store');
  createReadStream(path).pipe(res);
});
