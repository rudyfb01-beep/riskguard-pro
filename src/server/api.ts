import express from 'express';
import { getPool } from './db';
import { ensureDatabase } from './bootstrap-db';
import {
  appendLedger, convertCurrency, countReferences, deleteEntity, EntityName, getActionPlan, isEntity, loadAll, saveEntity, saveSetting, SETTING_KEYS, SettingKey,
} from './repository';
import { ActionPlan } from '../app/models/action-plan.model';
import { checkPlanChange } from '../app/utils/action-plans';
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
  areas: ['canManageCatalogs'],
  processes: ['canManageCatalogs'],
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
  norms: ['canManageCompliance', 'canManageRegulatoryReports'],
  compliance: ['canManageCompliance', 'canManageRegulatoryReports'],
  'security-tests': ['canManageInfoSecurity'],
  // Guardar: se valida con checkPlanChange (responsable, módulo de origen o administrador). Eliminar: administrador.
  'action-plans': ['canManageActionPlans'],
};

const SETTING_PERMISSIONS: Record<SettingKey, (keyof UserPermissions)[]> = {
  current_industry: ['canConfigureKRIs'],
  global_notification_preferences: ['canConfigureKRIs'],
  loss_registration_threshold_usd: ['canManageRegulatoryReports'],
  apr_operational_inputs: ['canManageRegulatoryReports'],
  general_parameters: ['canManageCatalogs'],
  risk_scale: ['canManageCatalogs'],
  risk_appetite: ['canManageCatalogs'],
  accounting_accounts: ['canManageCatalogs'],
  provider_catalogs: ['canManageCatalogs'],
};

/** Mensajes comprensibles para errores frecuentes de PostgreSQL y SQLite. */
function friendlyDbError(err: unknown): string {
  const e = err as { code?: string; errcode?: number; message?: string; constraint?: string };
  if (e.code === 'ERR_SQLITE_ERROR') {
    // "UNIQUE constraint failed: index 'ux_x'" / "CHECK constraint failed: ((col >= 1) ...)" → nombre o columna.
    const raw = (e.message ?? '').replace(/^.*constraint failed:\s*/i, '');
    const detail = raw.match(/index '([^']+)'/)?.[1] ?? (e.errcode === 275 ? raw.match(/[a-z_]{3,}/)?.[0] : raw) ?? raw;
    switch (e.errcode) {
      case 1555: case 2067: return `Ya existe un registro con ese valor único (${detail || 'código o correo'}).`;
      case 787: return 'El registro hace referencia a otro que no existe o fue eliminado.';
      case 275: return `Valor no permitido (${detail || 'regla de validación'}).`;
      default: return e.message ?? 'Error desconocido';
    }
  }
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
dataApi.use(['/data', '/ledger', '/settings', '/admin'], async (req, res, next) => {
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
  if (entity === 'action-plans') {
    const user = currentUser(res)!;
    const err = checkPlanChange(await getActionPlan(id), body as ActionPlan, user);
    if (err) {
      res.status(403).json({ error: err });
      return;
    }
  } else if (!authorize(res, WRITE_PERMISSIONS[entity], entity)) return;
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
    if (entity === 'areas' || entity === 'processes') {
      const n = await countReferences(entity, id);
      if (n > 0) {
        res.status(409).json({ error: `No se puede eliminar: hay ${n} registro(s) que lo usan. Puedes desactivarlo.` });
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

/** Cambia la moneda de registro convirtiendo todos los montos guardados. */
dataApi.post('/admin/convert-currency', async (req, res) => {
  if (!authorize(res, ['canManageCatalogs'], 'la moneda de registro')) return;
  const to = req.body?.to;
  const rate = Number(req.body?.rate);
  if (to !== 'CLP' && to !== 'USD') {
    res.status(400).json({ error: 'Moneda no válida (CLP o USD).' });
    return;
  }
  if (!Number.isFinite(rate) || rate < 100 || rate > 5000) {
    res.status(400).json({ error: 'Ingresa un tipo de cambio en pesos por dólar entre 100 y 5.000.' });
    return;
  }
  try {
    const user = currentUser(res)!;
    res.json(await convertCurrency(to, rate, { name: user.name, role: user.role }, clientIp(req)));
  } catch (err) {
    const status = (err as { status?: number }).status ?? 422;
    res.status(status).json({ error: status === 422 ? friendlyDbError(err) : (err as Error).message });
  }
});
