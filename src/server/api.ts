import express from 'express';
import { getPool } from './db';
import { ensureDatabase } from './bootstrap-db';
import {
  appendLedger, convertCurrency, countReferences, deleteEntity, EntityName, entityExists, getActionPlan, getApproval, getNotificationPreferences, getSetting,
  getSurveyResponse, getDocument, getCrisisEvent, isEntity, saveBulk, saveEntityChecked, VersionConflictError, BootstrapData, listNotifications, loadAll, markNotificationsRead, notificationOutbox, saveApprovalWithEffect, getVersion,
  saveNotificationPreference, saveSetting, SETTING_KEYS, SettingKey, getEvidence, getEvidenceContent, insertEvidence, markEvidenceDeleted,
} from './repository';
import { DEFAULT_EVIDENCE_MAX_MB, EVIDENCE_ENTITY_LABELS, EvidenceEntity, EvidenceFile } from '../app/models/evidence.model';
import { canAttachEvidence, canRemoveEvidence, checkEvidenceFile, formatBytes, isPreviewable, safeFileName } from '../app/utils/evidence';
import { createHash, randomUUID } from 'node:crypto';
import { ControlledDocument } from '../app/models/document.model';
import { checkDocumentChange } from '../app/utils/documents';
import { CrisisEvent } from '../app/models/crisis.model';
import { checkCrisisChange, normalizeCommittee } from '../app/utils/crisis';
import { ApprovalRequest } from '../app/models/approval.model';
import { applyApprovalEffect, checkApprovalChange, normalizeMatrix, targetPrecondition } from '../app/utils/approvals';
import { appetiteStatus, normalizeRiskAppetite } from '../app/models/catalog.model';
import { DEFAULT_NOTIFICATION_PREFERENCE, EmailMode, NOTIFICATION_CATEGORIES, NotificationCategory } from '../app/models/notification.model';
import { deliverPending, normalizeNotificationSettings, notifyChange, runDigest, runNotifierCycle } from './notifier';
import { isMailConfigured, sendMail } from './mailer';
import { syncUf } from './uf-sync';
import { opsRouter } from './ops';
import { notificationEmail } from '../app/utils/notifications';
import { ActionPlan } from '../app/models/action-plan.model';
import { checkPlanChange } from '../app/utils/action-plans';
import { SurveyResponse } from '../app/models/survey.model';
import { checkResponseChange } from '../app/utils/surveys';
import {
  AuthError, clearSessionCookie, clientIp, currentUser, destroySession, getSessionUser, hasAny, readSessionCookie,
  requestLoginCode, requireAuth, requireCsrfHeader, setSessionCookie, verifyLoginCode, createSession,
} from './auth';
import {
  authorizationUrl, decodeFlow, encodeFlow, exchangeCode, FLOW_COOKIE, googleConfig, newFlow, userForGoogle, verifyIdToken,
} from './google-sso';
import { UserPermissions, UserProfile } from '../app/models/risk.model';
import { bulkLedgerDetails, bulkSpec, canBulkImport, MAX_BULK_ROWS, validateBulkRecord } from '../app/utils/bulk-import';
import { serverError } from './security';
import { channelStatus, testChannel } from './kri-channels';

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
  'crisis-scenarios': ['canManageContinuity'],
  // Guardar: checkCrisisChange (quien administra continuidad o integra el Comité de Crisis). Eliminar: administración.
  'crisis-events': ['canManageContinuity'],
  'info-assets': ['canManageInfoSecurity'],
  vulnerabilities: ['canManageInfoSecurity'],
  'security-assessment': ['canManageInfoSecurity'],
  norms: ['canManageCompliance', 'canManageRegulatoryReports'],
  compliance: ['canManageCompliance', 'canManageRegulatoryReports'],
  'security-tests': ['canManageInfoSecurity'],
  // Guardar: se valida con checkPlanChange (responsable, módulo de origen o administrador). Eliminar: administrador.
  'action-plans': ['canManageActionPlans'],
  'survey-campaigns': ['canManageSurveys'],
  // Guardar: quien administra autoevaluaciones o la persona asignada (checkResponseChange). Eliminar: administrador.
  'survey-responses': ['canManageSurveys'],
  // Guardar: se valida con checkApprovalChange (solicitante, aprobador del nivel vigente). Eliminar: administrador de cargos.
  approvals: ['canManageRoles'],
  // Guardar: checkDocumentChange (quien administra documentos o la propia confirmación de lectura).
  documents: ['canManageDocuments'],
};

/** Entidades cuyos cambios generan avisos (se lee el estado previo antes de guardar). */
const NOTIFY_ENTITIES = new Set<EntityName>(['action-plans', 'survey-responses', 'flaws', 'alerts', 'crisis-events']);

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
  approval_matrix: ['canManageCatalogs'],
  notification_settings: ['canManageCatalogs'],
  uf_values: ['canManageCatalogs', 'canManageRegulatoryReports'],
  crisis_committee: ['canManageContinuity'],
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
    console.error('[Auth] /auth/me:', (err as Error).message);
    res.status(503).json({ error: 'Base de datos no disponible.' });
  }
});

dataApi.post('/auth/request-code', async (req, res) => {
  if (!getPool()) {
    res.status(503).json({ error: 'Base de datos no configurada.' });
    return;
  }
  try {
    await getDbReady();
    await requestLoginCode(req.body?.email, clientIp(req), googleConfig().emailCode);
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
    const { token, user, maxAgeSeconds } = await verifyLoginCode(req.body?.email, req.body?.code, clientIp(req), req.get('user-agent') ?? '', googleConfig().emailCode);
    setSessionCookie(req, res, token, maxAgeSeconds);
    res.json({ user });
  } catch (err) {
    sendAuthError(res, err);
  }
});

/** Formas de ingreso disponibles (pública: la usa la pantalla de acceso). */
dataApi.get('/auth/config', (_req, res) => {
  const cfg = googleConfig();
  res.json({ google: cfg.enabled && !!getPool(), emailCode: cfg.emailCode, domains: cfg.domains });
});

const flowCookieOptions = (req: express.Request) => ({
  // Lax: el navegador la envía al volver desde Google (navegación de primer nivel).
  httpOnly: true, sameSite: 'lax' as const, secure: process.env['COOKIE_SECURE'] === 'true' || (process.env['COOKIE_SECURE'] !== 'false' && req.secure),
  path: '/api/auth/google', maxAge: 10 * 60_000,
});

/** Paso 1: redirige a Google con state, nonce y PKCE. */
dataApi.get('/auth/google/start', (req, res) => {
  const cfg = googleConfig();
  if (!cfg.enabled || !getPool()) {
    res.redirect(302, `/?login_error=${encodeURIComponent('El ingreso con Google no está configurado.')}`);
    return;
  }
  const { flow, challenge } = newFlow(req.query['return'], req.query['popup'] === '1');
  res.cookie(FLOW_COOKIE, encodeFlow(flow), flowCookieOptions(req));
  res.redirect(302, authorizationUrl(cfg, req, flow, challenge, typeof req.query['hint'] === 'string' ? req.query['hint'] : undefined));
});

/** Paso 2: Google vuelve con el código; se verifica todo y se crea la sesión. */
dataApi.get('/auth/google/callback', async (req, res) => {
  const cfg = googleConfig();
  const flow = decodeFlow(readCookie(req, FLOW_COOKIE));
  res.clearCookie(FLOW_COOKIE, { ...flowCookieOptions(req), maxAge: undefined });
  const fail = (msg: string) => {
    // Se vuelve a la página pedida (p. ej. el enlace de un correo) con el motivo visible.
    const target = flow?.popup ? '/?popup_login=error' : flow?.returnTo ?? '/';
    res.redirect(302, `${target}${target.includes('?') ? '&' : '?'}login_error=${encodeURIComponent(msg.slice(0, 200))}`);
  };
  try {
    if (!cfg.enabled || !getPool()) return fail('El ingreso con Google no está configurado.');
    if (req.query['error']) return fail(req.query['error'] === 'access_denied' ? 'Cancelaste el ingreso con Google.' : 'Google no completó el ingreso.');
    const state = String(req.query['state'] ?? '');
    const code = String(req.query['code'] ?? '');
    if (!flow || !state || state !== flow.state || !code) return fail('El ingreso venció o no corresponde a esta ventana. Vuelve a intentarlo.');
    await getDbReady();
    const idToken = await exchangeCode(cfg, req, code, flow.verifier);
    const identity = await verifyIdToken(cfg, idToken, flow.nonce);
    const user = await userForGoogle(identity);
    const { token, maxAgeSeconds } = await createSession(user, clientIp(req), req.get('user-agent') ?? '', `Inicio de sesión con Google (${identity.email}).`);
    setSessionCookie(req, res, token, maxAgeSeconds);
    res.redirect(302, flow.popup ? '/?popup_login=ok' : flow.returnTo);
  } catch (err) {
    if (!(err instanceof AuthError)) console.error('[Auth] Error en el ingreso con Google:', err);
    else console.warn(`[Auth] Ingreso con Google rechazado: ${err.message}`);
    fail(err instanceof AuthError ? err.message : 'Error interno al ingresar con Google.');
  }
});

function readCookie(req: express.Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

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
dataApi.use(['/data', '/ledger', '/settings', '/admin', '/notifications', '/evidence', '/import'], async (req, res, next) => {
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
    console.error('[Auth] /auth/me:', (err as Error).message);
    res.status(503).json({ error: 'Base de datos no disponible.' });
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
    serverError(res, err);
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
  if (entity === 'approvals') {
    await saveApproval(res, body as ApprovalRequest, baseVersion(req));
    return;
  }
  // Estado previo: para validar reglas y para generar avisos.
  let prev: unknown = null;
  let campaign: Awaited<ReturnType<typeof getSurveyResponse>> = null;
  if (entity === 'action-plans') {
    const user = currentUser(res)!;
    prev = await getActionPlan(id);
    const err = checkPlanChange(prev as ActionPlan | null, body as ActionPlan, user);
    if (err) {
      res.status(403).json({ error: err });
      return;
    }
  } else if (entity === 'documents') {
    const err = checkDocumentChange(await getDocument(id), body as ControlledDocument, currentUser(res)!);
    if (err) {
      res.status(403).json({ error: err });
      return;
    }
  } else if (entity === 'crisis-events') {
    prev = await getCrisisEvent(id);
    const committee = normalizeCommittee(await getSetting('crisis_committee'));
    const err = checkCrisisChange(prev as CrisisEvent | null, body as CrisisEvent, currentUser(res)!, committee);
    if (err) {
      res.status(403).json({ error: err });
      return;
    }
  } else if (entity === 'survey-responses') {
    campaign = await getSurveyResponse(id);
    prev = campaign?.response ?? null;
    const err = checkResponseChange(campaign?.response ?? null, body as SurveyResponse, currentUser(res)!, campaign?.campaign);
    if (err) {
      res.status(403).json({ error: err });
      return;
    }
  } else if (!authorize(res, WRITE_PERMISSIONS[entity], entity)) return;
  else if (NOTIFY_ENTITIES.has(entity)) prev = (await entityExists(entity, id)) ? {} : null;
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
    const version = await saveEntityChecked(entity, body as { id: string }, baseVersion(req), currentUser(res)!.name);
    res.json({ ok: true, version });
    if (NOTIFY_ENTITIES.has(entity)) {
      // Para incidentes y alertas solo importa si son nuevos (prev = {} indica que ya existían).
      const before = entity === 'flaws' || entity === 'alerts' ? (prev ? body : null) : prev;
      let camp = campaign?.campaign ?? null;
      if (entity === 'survey-responses' && !camp) camp = (await getSurveyResponse(id))?.campaign ?? null;
      void notifyChange(entity, before, body, currentUser(res)!.name, { campaign: camp });
    }
  } catch (err) {
    if (err instanceof VersionConflictError) {
      await sendConflict(res, entity, id, err);
      return;
    }
    res.status(422).json({ error: friendlyDbError(err) });
  }
});

/** Versión sobre la que se editó (cabecera X-Base-Version); sin cabecera no se compara. */
function baseVersion(req: express.Request): number | null {
  const h = req.get('x-base-version');
  if (h === undefined || h === '') return null;
  const n = Number(h);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Colección de /api/data donde está cada entidad (para devolver la versión guardada). */
const DATA_KEY: Record<EntityName, keyof BootstrapData> = {
  areas: 'areas', processes: 'processes', roles: 'roles', users: 'users', controls: 'controls', risks: 'risks', providers: 'providers',
  'regulatory-milestones': 'regulatoryMilestones', flaws: 'flaws', alerts: 'alerts', audits: 'audits', kris: 'kris', bia: 'bia', plans: 'plans',
  'continuity-tests': 'continuityTests', 'info-assets': 'infoAssets', vulnerabilities: 'vulnerabilities', 'security-assessment': 'securityAssessment',
  norms: 'norms', compliance: 'compliance', 'security-tests': 'securityTests', 'action-plans': 'actionPlans', 'survey-campaigns': 'surveyCampaigns',
  'survey-responses': 'surveyResponses', documents: 'documents', approvals: 'approvals',
  'crisis-scenarios': 'crisisScenarios', 'crisis-events': 'crisisEvents',
};

/** 409 con la versión guardada, para que el cliente la muestre y decida. */
async function sendConflict(res: express.Response, entity: EntityName, id: string, err: VersionConflictError) {
  const all = await loadAll().catch(() => null);
  const list = (all?.[DATA_KEY[entity]] ?? []) as { id: string }[];
  const current = list.find(x => x.id === id) ?? null;
  const who = err.updatedBy ? ` (${err.updatedBy})` : '';
  res.status(409).json({
    error: current
      ? `Otra persona${who} guardó este registro mientras lo editabas.`
      : `Otra persona${who} eliminó este registro mientras lo editabas.`,
    conflict: { version: err.current, updatedBy: err.updatedBy, updatedAt: err.updatedAt, current },
  });
}

// -----------------------------------------------------------------------------
// Carga masiva (Excel / CSV): todos los registros en una sola transacción
// -----------------------------------------------------------------------------

dataApi.post('/import/:entity', async (req, res) => {
  const spec = bulkSpec(req.params.entity);
  if (!spec || !isEntity(spec.entity)) {
    res.status(404).json({ error: `No hay carga masiva para: ${req.params.entity}` });
    return;
  }
  const entity = spec.entity;
  const user = currentUser(res)!;
  if (!canBulkImport(spec, user.permissions) || !hasAny(user, WRITE_PERMISSIONS[entity])) {
    res.status(403).json({ error: `Tu cargo no tiene permiso para la carga masiva de ${spec.label.toLowerCase()}.` });
    return;
  }
  const records = req.body?.records as { id: string }[] | undefined;
  const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : 'archivo';
  if (!Array.isArray(records) || !records.length) {
    res.status(400).json({ error: 'No hay registros para cargar.' });
    return;
  }
  if (records.length > MAX_BULK_ROWS) {
    res.status(413).json({ error: `Máximo ${MAX_BULK_ROWS} registros por carga.` });
    return;
  }
  const ids = new Set<string>();
  for (const [i, r] of records.entries()) {
    const problem = validateBulkRecord(spec.entity, r);
    if (problem) {
      res.status(400).json({ error: `Registro ${i + 1}: ${problem}` });
      return;
    }
    if (ids.has(r.id)) {
      res.status(400).json({ error: `Registro ${i + 1}: identificador repetido.` });
      return;
    }
    ids.add(r.id);
  }
  if (entity === 'users' && (records as UserProfile[]).some(u => u.id === user.id && u.active === false)) {
    res.status(400).json({ error: 'No puedes desactivar tu propio usuario.' });
    return;
  }
  try {
    const result = await saveBulk(entity, records, (created, updated) => ({
      id: `blk-${Date.now()}-${randomUUID().slice(0, 8)}`, userName: user.name, userRole: user.role, action: 'CARGA_MASIVA',
      entityType: 'Carga masiva', entityCode: spec.label, details: bulkLedgerDetails(spec, created, updated, fileName),
    }), clientIp(req), entity === 'users'
      ? async c => {
        const r = await c.query(`SELECT count(*)::int AS n FROM user_profiles WHERE active = TRUE AND (permissions->>'canManageRoles')::boolean = TRUE`);
        return Number(r.rows[0].n) > 0 ? null : 'Debe quedar al menos un usuario activo con permiso para administrar cargos.';
      }
      : undefined);
    res.json({ ok: true, created: result.created, updated: result.updated, ledger: result.entry });
  } catch (err) {
    const status = (err as { status?: number }).status;
    res.status(status ?? 422).json({ error: status ? (err as Error).message : friendlyDbError(err) });
  }
});

// -----------------------------------------------------------------------------
// Evidencias (archivos)
// -----------------------------------------------------------------------------

const EVIDENCE_MAX_BYTES = Math.max(1, Number(process.env['EVIDENCE_MAX_MB'] ?? DEFAULT_EVIDENCE_MAX_MB)) * 1024 * 1024;

/** Registro de origen de una evidencia (para permisos y para nombrarlo en la bitácora). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function evidenceParent(entity: EvidenceEntity, id: string): Promise<any | null> {
  const all = await loadAll();
  const lists: Record<EvidenceEntity, { id: string }[]> = {
    controls: all.controls, risks: all.risks, 'action-plans': all.actionPlans, compliance: all.compliance, audits: all.audits, flaws: all.flaws,
    'continuity-tests': all.continuityTests, plans: all.plans, 'security-tests': all.securityTests, vulnerabilities: all.vulnerabilities,
    'survey-responses': all.surveyResponses, approvals: all.approvals, providers: all.providers, documents: all.documents,
  };
  return (lists[entity] ?? []).find(x => x.id === id) ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parentLabel = (p: any) => String(p?.code ?? p?.title ?? p?.subject ?? p?.name ?? p?.id ?? '').slice(0, 120);

/** Límites para la interfaz. */
dataApi.get('/evidence/config', (_req, res) => {
  res.json({ maxBytes: EVIDENCE_MAX_BYTES });
});

/**
 * Carga de un archivo: el cuerpo es el contenido (application/octet-stream) y los datos van en
 * la consulta (entityType, entityId, context, description) y en X-File-Name (codificado).
 */
const evidenceBody = express.raw({ type: () => true, limit: EVIDENCE_MAX_BYTES + 1024 });
/** Lee el contenido del archivo; si excede el máximo responde con un mensaje claro (JSON). */
const readEvidenceBody: express.RequestHandler = (req, res, next) => evidenceBody(req, res, err => {
  if (!err) { next(); return; }
  const tooLarge = (err as { type?: string }).type === 'entity.too.large';
  res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? `El archivo supera el máximo de ${formatBytes(EVIDENCE_MAX_BYTES)}.` : 'No se pudo leer el archivo.' });
});

dataApi.post('/evidence', readEvidenceBody, async (req, res) => {
  const user = currentUser(res)!;
  const entity = String(req.query['entityType'] ?? '') as EvidenceEntity;
  const entityId = String(req.query['entityId'] ?? '');
  const context = String(req.query['context'] ?? '').slice(0, 120) || undefined;
  const description = String(req.query['description'] ?? '').slice(0, 500).trim() || undefined;
  let rawName = '';
  try { rawName = decodeURIComponent(String(req.headers['x-file-name'] ?? '')); } catch { rawName = ''; }
  if (!EVIDENCE_ENTITY_LABELS[entity] || !entityId) {
    res.status(400).json({ error: 'Indique a qué registro corresponde la evidencia.' });
    return;
  }
  const content: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const name = safeFileName(rawName || 'archivo');
  const check = checkEvidenceFile(name, new Uint8Array(content.buffer, content.byteOffset, content.byteLength), EVIDENCE_MAX_BYTES);
  if ('error' in check) {
    res.status(415).json({ error: check.error });
    return;
  }
  try {
    const parent = await evidenceParent(entity, entityId);
    if (!parent) {
      res.status(404).json({ error: 'El registro no existe (guárdelo antes de adjuntar archivos).' });
      return;
    }
    if (!canAttachEvidence(entity, user, parent)) {
      res.status(403).json({ error: 'Tu cargo no puede adjuntar evidencia en este registro.' });
      return;
    }
    const sha256 = createHash('sha256').update(content).digest('hex');
    const file: EvidenceFile = {
      id: `evd-${randomUUID()}`, entityType: entity, entityId, context, fileName: name, mimeType: check.mime, sizeBytes: content.length, sha256,
      description, uploadedBy: user.name, uploadedByEmail: user.email, uploadedAt: new Date().toISOString(),
    };
    const ledger = await insertEvidence(file, content, {
      id: `log-evd-${randomUUID()}`, userName: user.name, userRole: user.role, action: 'CARGA_EVIDENCIA', entityType: 'Evidencia',
      entityCode: parentLabel(parent),
      details: `${EVIDENCE_ENTITY_LABELS[entity]} ${parentLabel(parent)}${context ? ` (${context})` : ''}: "${name}" (${formatBytes(content.length)}), SHA-256 ${sha256}.${description ? ` ${description}` : ''}`,
    }, clientIp(req));
    res.status(201).json({ file, ledger });
  } catch (err) {
    res.status(422).json({ error: friendlyDbError(err) });
  }
});

/** Descarga (o vista en el navegador, solo PDF e imágenes, con ?inline=1). */
dataApi.get('/evidence/:id', async (req, res) => {
  try {
    const found = await getEvidenceContent(req.params['id']);
    if (!found || found.file.deletedAt) {
      res.status(404).json({ error: 'Archivo no encontrado.' });
      return;
    }
    const { file, content } = found;
    const inline = req.query['inline'] === '1' && isPreviewable(file.mimeType);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(content.length));
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${file.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-SHA256', file.sha256);
    res.end(content);
  } catch (err) {
    serverError(res, err);
  }
});

/** Recalcula el SHA-256 del contenido guardado y lo compara con el registrado al cargar. */
dataApi.get('/evidence/:id/verify', async (req, res) => {
  try {
    const found = await getEvidenceContent(req.params['id']);
    if (!found) {
      res.status(404).json({ error: 'Archivo no encontrado.' });
      return;
    }
    const actual = createHash('sha256').update(found.content).digest('hex');
    res.json({ ok: actual === found.file.sha256, expected: found.file.sha256, actual, sizeBytes: found.content.length });
  } catch (err) {
    serverError(res, err);
  }
});

/** Baja con motivo: el archivo deja de mostrarse, pero el contenido y su registro se conservan. */
dataApi.delete('/evidence/:id', async (req, res) => {
  const user = currentUser(res)!;
  const reason = String(req.body?.reason ?? req.query['reason'] ?? '').trim().slice(0, 500);
  if (!reason) {
    res.status(400).json({ error: 'Indique el motivo de la baja.' });
    return;
  }
  try {
    const file = await getEvidence(req.params['id']);
    if (!file || file.deletedAt) {
      res.status(404).json({ error: 'Archivo no encontrado.' });
      return;
    }
    const parent = await evidenceParent(file.entityType, file.entityId);
    if (!canRemoveEvidence(file, user, parent)) {
      res.status(403).json({ error: 'Tu cargo no puede dar de baja esta evidencia.' });
      return;
    }
    const at = new Date().toISOString();
    const ledger = await markEvidenceDeleted(file.id, user.name, reason, at, {
      id: `log-evd-${randomUUID()}`, userName: user.name, userRole: user.role, action: 'BAJA_EVIDENCIA', entityType: 'Evidencia',
      entityCode: parentLabel(parent) || file.entityId,
      details: `Baja de "${file.fileName}" (SHA-256 ${file.sha256}) de ${EVIDENCE_ENTITY_LABELS[file.entityType]} ${parentLabel(parent)}. Motivo: ${reason}. El archivo se conserva.`,
    }, clientIp(req));
    res.json({ ok: true, file: { ...file, deletedAt: at, deletedBy: user.name, deleteReason: reason }, ledger });
  } catch (err) {
    res.status(422).json({ error: friendlyDbError(err) });
  }
});

/** Registro de origen de una solicitud (y estado frente al apetito, si es un riesgo). */
async function approvalTarget(r: ApprovalRequest) {
  const all = await loadAll();
  const lists: Record<ApprovalRequest['targetEntity'], { id: string }[]> = {
    risks: all.risks, vulnerabilities: all.vulnerabilities, plans: all.plans, audits: all.audits, 'action-plans': all.actionPlans,
    documents: all.documents,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (lists[r.targetEntity] ?? []).find(x => x.id === r.targetId) as any;
  let appetite: string | undefined;
  if (r.targetEntity === 'risks' && target) {
    const limits = normalizeRiskAppetite(all.settings['risk_appetite']).limits;
    appetite = appetiteStatus(target.residualScore, limits.find(l => l.category === target.category));
  }
  return { all, target, appetite };
}

/**
 * Guarda una solicitud de aprobación: valida quién puede crear, decidir o anular y, cuando se
 * aprueba el último nivel, aplica el cambio al registro de origen en la misma transacción
 * (quien aprueba no necesita permiso de edición en ese módulo).
 */
async function saveApproval(res: express.Response, next: ApprovalRequest, base: number | null) {
  const user = currentUser(res)!;
  try {
    const prev = await getApproval(next.id);
    const { all, target, appetite } = await approvalTarget(next);
    if (!target) {
      res.status(422).json({ error: 'El registro de la solicitud no existe.' });
      return;
    }
    const err = checkApprovalChange(prev, next, user, {
      matrix: normalizeMatrix(all.settings['approval_matrix']),
      targetOwner: next.kind === 'reprogramacion-plan' ? target.owner : undefined,
      isAdmin: !!user.permissions?.canManageRoles,
    });
    if (err) {
      res.status(403).json({ error: err });
      return;
    }
    if (!prev) {
      const pre = targetPrecondition(next.kind, target, next.payload ?? {}, appetite);
      if (pre) {
        res.status(422).json({ error: pre });
        return;
      }
      const dup = all.approvals.find(a => a.status === 'Pendiente' && a.kind === next.kind && a.targetId === next.targetId && a.id !== next.id);
      if (dup) {
        res.status(409).json({ error: `Ya hay una solicitud pendiente para este registro (${dup.code}).` });
        return;
      }
    }
    const approvedNow = prev?.status === 'Pendiente' && next.status === 'Aprobada';
    const updated = approvedNow ? applyApprovalEffect(next, target) : null;
    if (approvedNow && !updated) {
      res.status(422).json({ error: 'El registro de origen ya no admite este cambio (revise su estado actual).' });
      return;
    }
    const v = await saveApprovalWithEffect(next, updated ? { entity: next.targetEntity, obj: updated } : null, base, user.name);
    res.json({ ok: true, version: v.version, applied: updated ? { entity: next.targetEntity, record: updated, version: v.effectVersion } : null });
    void notifyChange('approvals', prev, next, user.name);
    if (updated && (next.targetEntity === 'action-plans' || next.targetEntity === 'documents')) void notifyChange(next.targetEntity, target, updated, user.name);
  } catch (e) {
    if (e instanceof VersionConflictError) {
      await sendConflict(res, 'approvals', next.id, e);
      return;
    }
    res.status(422).json({ error: friendlyDbError(e) });
  }
}

// -----------------------------------------------------------------------------
// Notificaciones
// -----------------------------------------------------------------------------

dataApi.get('/notifications', async (req, res) => {
  try {
    const user = currentUser(res)!;
    res.json(await listNotifications(user.email, Number(req.query['limit'] ?? 100)));
  } catch (err) {
    serverError(res, err);
  }
});

dataApi.post('/notifications/read', async (req, res) => {
  try {
    const user = currentUser(res)!;
    const ids = req.body?.all === true ? 'all' : Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    await markNotificationsRead(user.email, ids);
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

dataApi.get('/notifications/preferences', async (_req, res) => {
  try {
    const user = currentUser(res)!;
    const prefs = await getNotificationPreferences();
    res.json({ preference: prefs.get(user.email.toLowerCase()) ?? DEFAULT_NOTIFICATION_PREFERENCE, mailConfigured: isMailConfigured() });
  } catch (err) {
    serverError(res, err);
  }
});

dataApi.put('/notifications/preferences', async (req, res) => {
  const mode = req.body?.emailMode as EmailMode;
  if (!['inmediato', 'resumen', 'ninguno'].includes(mode)) {
    res.status(400).json({ error: 'Modo de correo no válido.' });
    return;
  }
  const muted = (Array.isArray(req.body?.muted) ? req.body.muted : []).filter((c: unknown): c is NotificationCategory => NOTIFICATION_CATEGORIES.includes(c as NotificationCategory));
  try {
    await saveNotificationPreference(currentUser(res)!.email, { emailMode: mode, muted });
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

/** Envía un correo de prueba a la persona de la sesión (verifica la configuración SMTP). */
dataApi.post('/notifications/test', async (_req, res) => {
  const user = currentUser(res)!;
  if (!isMailConfigured()) {
    res.status(409).json({ error: 'El servidor no tiene SMTP configurado (SMTP_HOST). Los avisos quedan solo en la bandeja.' });
    return;
  }
  try {
    const appName = process.env['APP_NAME'] || 'RiskGuard Pro';
    await sendMail(user.email, notificationEmail({
      id: 'test', recipient: user.email, recipientName: user.name, category: 'Aprobaciones', severity: 'info', title: 'Correo de prueba',
      body: 'Si lees esto, los avisos por correo de RiskGuard Pro están funcionando.', tab: 'mantenedores', createdAt: new Date().toISOString(), dedupeKey: 'test',
    }, appName, (process.env['APP_URL'] || '').trim()));
    res.json({ ok: true, message: `Correo de prueba enviado a ${user.email}.` });
  } catch (err) {
    res.status(502).json({ error: `El servidor de correo rechazó el envío: ${(err as Error).message}` });
  }
});

/** Canales disponibles para los avisos de KRIs (correo, SMS y webhook). */
dataApi.get('/notifications/channels', (_req, res) => {
  res.json(channelStatus());
});

/** Envío de prueba real por un canal de avisos de KRIs. */
dataApi.post('/notifications/kri-test', async (req, res) => {
  if (!authorize(res, ['canConfigureKRIs'], 'los avisos de KRIs')) return;
  const channel = req.body?.channel;
  const to = String(req.body?.to ?? '').trim().slice(0, 500);
  const kriCode = String(req.body?.kriCode ?? '').slice(0, 60);
  if (!['email', 'sms', 'webhook'].includes(channel) || !to) {
    res.status(400).json({ error: 'Indique el canal (email, sms o webhook) y el destinatario.' });
    return;
  }
  const user = currentUser(res)!;
  try {
    const appName = process.env['APP_NAME'] || 'RiskGuard Pro';
    const message = await testChannel(channel, to, kriCode, async email => sendMail(email, notificationEmail({
      id: 'kri-test', recipient: email, recipientName: email, category: 'Alertas KRI', severity: 'info', title: `Prueba de avisos de KRI ${kriCode}`,
      body: `Prueba enviada por ${user.name}. Si recibe este correo, los avisos de alertas de KRI llegarán a esta dirección.`, tab: 'alertas-kri',
      createdAt: new Date().toISOString(), dedupeKey: 'kri-test',
    }, appName, (process.env['APP_URL'] || '').trim())));
    await appendLedger({
      id: `log-kri-test-${Date.now()}`, userName: user.name, userRole: user.role, action: 'CONFIGURACIÓN_NOTIFICACIONES', entityType: 'KRI',
      entityCode: kriCode || 'GLOBAL', details: `Envío de prueba por ${channel.toUpperCase()}: ${message}`,
    }, clientIp(req)).catch(() => undefined);
    res.json({ ok: true, message });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Registro de envíos (administradores de mantenedores). */
dataApi.get('/notifications/outbox', async (_req, res) => {
  if (!authorize(res, ['canManageCatalogs', 'canManageRoles'], 'los avisos')) return;
  try {
    res.json({ items: await notificationOutbox(200), mailConfigured: isMailConfigured(), settings: normalizeNotificationSettings(await getSetting('notification_settings')) });
  } catch (err) {
    serverError(res, err);
  }
});

/** Ejecuta ahora la revisión de plazos y el envío (sin esperar el ciclo periódico). */
dataApi.post('/notifications/run', async (req, res) => {
  if (!authorize(res, ['canManageCatalogs', 'canManageRoles'], 'los avisos')) return;
  try {
    const { created } = await runNotifierCycle();
    const digests = req.body?.digest === true ? await runDigest(new Date(), true) : 0;
    await deliverPending();
    res.json({ ok: true, created, digests });
  } catch (err) {
    serverError(res, err);
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
    const base = baseVersion(req);
    if (base !== null) {
      const cur = await getVersion(entity, id);
      if (cur !== base) {
        await sendConflict(res, entity, id, new VersionConflictError(cur, null, null));
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
    serverError(res, err);
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

/** Descarga los valores de la UF (mindicador.cl) del año indicado o del actual. */
dataApi.post('/admin/uf-sync', async (req, res) => {
  if (!authorize(res, ['canManageCatalogs', 'canManageRegulatoryReports'], 'los valores de la UF')) return;
  const now = new Date().getFullYear();
  const years = Array.isArray(req.body?.years) ? (req.body.years as unknown[]).map(Number).filter(Number.isInteger).slice(0, 5) : [now];
  try {
    const r = await syncUf(years.length ? years : [now]);
    const user = currentUser(res)!;
    if (r.added) {
      await appendLedger({
        id: `log-uf-${Date.now()}`, userName: user.name, userRole: user.role, action: 'CONFIGURACIÓN_PARÁMETROS', entityType: 'Mantenedor',
        entityCode: 'UF', details: `Valores de la UF actualizados desde la fuente oficial (${years.join(', ')}): ${r.added} nuevo(s), último ${r.latest?.date} = ${r.latest?.value}.`,
      }, clientIp(req));
    }
    res.json(r);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Cambia la moneda de registro convirtiendo todos los montos guardados. */
/** Desvincula la cuenta de Google de una persona (cambio de cuenta o correo reasignado). */
dataApi.post('/admin/users/:id/google-unlink', async (req, res) => {
  if (!authorize(res, ['canManageRoles'], 'los usuarios')) return;
  const admin = currentUser(res)!;
  try {
    const r = await getPool()!.query('SELECT name, email, google_sub FROM user_profiles WHERE id = $1', [req.params['id']]);
    const u = r.rows[0];
    if (!u) { res.status(404).json({ error: 'Usuario no encontrado.' }); return; }
    if (!u.google_sub) { res.json({ ok: true }); return; }
    await getPool()!.query('UPDATE user_profiles SET google_sub = NULL WHERE id = $1', [req.params['id']]);
    const ledger = await appendLedger({
      id: `log-gunlink-${randomUUID()}`, userName: admin.name, userRole: admin.role, action: 'GESTIÓN_USUARIO', entityType: 'Usuario',
      entityCode: req.params['id'], details: `Cuenta de Google desvinculada de ${u.name} (${u.email}). En su próximo ingreso con Google se vinculará la cuenta que use.`,
    }, clientIp(req));
    res.json({ ok: true, ledger });
  } catch (err) {
    res.status(422).json({ error: friendlyDbError(err) });
  }
});

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

// Operación: salud, listo, panel de operación y respaldos (rutas /admin protegidas arriba).
dataApi.use(opsRouter);
