import { getPool } from './db';
import { isMailConfigured, sendMail } from './mailer';
import {
  getNotificationPreferences, getSetting, insertNotifications, loadAll, notificationsByEmailStatus, setEmailStatus, setInternalSetting, userFromRow,
} from './repository';
import { AppNotification, DEFAULT_NOTIFICATION_PREFERENCE, NotificationDraft } from '../app/models/notification.model';
import { KriNotificationPreferences } from '../app/models/risk.model';
import { SurveyCampaign } from '../app/models/survey.model';
import {
  changeNotifications, digestEmail, normalizeNotificationSettings, notificationEmail, NotifyUser, scheduledNotifications,
} from '../app/utils/notifications';

export { normalizeNotificationSettings };

/**
 * Notificaciones del servidor:
 * - Al guardar ciertos registros se generan avisos (asignaciones, envíos, aprobaciones, incidentes críticos).
 * - Cada cierto tiempo se revisan los plazos (planes, autoevaluaciones, aprobaciones, continuidad, etc.).
 * - Los correos salen de inmediato o en un resumen diario, según la preferencia de cada persona.
 * Las claves de deduplicación evitan repetir un aviso aunque la revisión corra muchas veces.
 */

const appName = () => process.env['APP_NAME'] || 'RiskGuard Pro';
const appUrl = () => (process.env['APP_URL'] || '').trim();
const devLog = () => process.env['NOTIFY_DEV_LOG'] === 'true' || process.env['AUTH_DEV_LOG_CODES'] === 'true';

async function activeUsers(): Promise<NotifyUser[]> {
  const r = await getPool()!.query('SELECT * FROM user_profiles');
  return r.rows.map(userFromRow);
}

/** Fecha local YYYY-MM-DD y hora (zona del servidor, configurable con TZ). */
function localNow(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour: d.getHours() };
}

/** Avisos por un cambio guardado. Nunca interrumpe el guardado: los errores solo se registran. */
export async function notifyChange(
  entity: string, prev: unknown, next: unknown, actorName: string, extra: { campaign?: SurveyCampaign | null } = {},
): Promise<AppNotification[]> {
  try {
    if (!getPool()) return [];
    const kriPreferences = entity === 'alerts' ? ((await getSetting('global_notification_preferences')) as KriNotificationPreferences | undefined) ?? null : null;
    const drafts = changeNotifications(entity, prev, next, {
      actorName, users: await activeUsers(), campaign: extra.campaign, kriPreferences, now: new Date().toISOString(),
    });
    const created = await insertNotifications(drafts);
    if (created.length) void deliverPending();
    return created;
  } catch (err) {
    console.error('[Notificaciones] Error al generar avisos:', (err as Error).message);
    return [];
  }
}

/** Revisa los plazos y crea los avisos que correspondan (idempotente). */
export async function runSchedule(today = localNow().day): Promise<number> {
  const data = await loadAll();
  const settings = normalizeNotificationSettings(data.settings['notification_settings']);
  const drafts: NotificationDraft[] = scheduledNotifications({
    users: data.users, actionPlans: data.actionPlans, surveyCampaigns: data.surveyCampaigns, surveyResponses: data.surveyResponses,
    approvals: data.approvals, continuityPlans: data.plans, vulnerabilities: data.vulnerabilities, risks: data.risks, providers: data.providers,
  }, settings, today);
  const created = await insertNotifications(drafts);
  return created.length;
}

let delivering: Promise<void> | null = null;

/** Envía (o deja para el resumen) los correos pendientes según la preferencia de cada persona. */
export function deliverPending(): Promise<void> {
  if (delivering) return delivering;
  delivering = (async () => {
    try {
      const pending = await notificationsByEmailStatus('pendiente');
      if (!pending.length) return;
      const settings = normalizeNotificationSettings(await getSetting('notification_settings'));
      const prefs = await getNotificationPreferences();
      for (const n of pending) {
        const pref = prefs.get(n.recipient) ?? DEFAULT_NOTIFICATION_PREFERENCE;
        if (!settings.emailEnabled) { await setEmailStatus([n.id], 'omitido', 'Correo de avisos desactivado'); continue; }
        if (pref.emailMode === 'ninguno' || pref.muted.includes(n.category)) { await setEmailStatus([n.id], 'omitido', 'Preferencia de la persona'); continue; }
        if (pref.emailMode === 'resumen') { await setEmailStatus([n.id], 'resumen'); continue; }
        await sendOne(n);
      }
    } catch (err) {
      console.error('[Notificaciones] Error al enviar correos:', (err as Error).message);
    } finally {
      delivering = null;
    }
  })();
  return delivering;
}

async function sendOne(n: AppNotification) {
  const mail = notificationEmail(n, appName(), appUrl());
  if (!isMailConfigured()) {
    if (devLog()) console.warn(`[Notificaciones] SMTP no configurado. Correo para ${n.recipient}: ${mail.subject}`);
    await setEmailStatus([n.id], 'omitido', 'SMTP no configurado');
    return;
  }
  try {
    await sendMail(n.recipient, mail);
    await setEmailStatus([n.id], 'enviado');
  } catch (err) {
    await setEmailStatus([n.id], 'error', (err as Error).message);
  }
}

/** Resumen diario: una vez al día, desde la hora configurada, un correo por persona. */
export async function runDigest(now = new Date(), force = false): Promise<number> {
  const settings = normalizeNotificationSettings(await getSetting('notification_settings'));
  const { day, hour } = localNow(now);
  if (!force) {
    if (hour < settings.digestHour) return 0;
    if ((await getSetting('notification_digest_last')) === day) return 0;
  }
  const queued = await notificationsByEmailStatus('resumen', 5000);
  const byRecipient = new Map<string, AppNotification[]>();
  for (const n of queued) byRecipient.set(n.recipient, [...(byRecipient.get(n.recipient) ?? []), n]);
  let sent = 0;
  for (const [to, list] of byRecipient) {
    const mail = digestEmail(list[0].recipientName || to, list, appName(), appUrl());
    const ids = list.map(n => n.id);
    if (!isMailConfigured()) {
      if (devLog()) console.warn(`[Notificaciones] SMTP no configurado. Resumen para ${to}: ${mail.subject}`);
      await setEmailStatus(ids, 'omitido', 'SMTP no configurado');
      continue;
    }
    try {
      await sendMail(to, mail);
      await setEmailStatus(ids, 'enviado');
      sent++;
    } catch (err) {
      await setEmailStatus(ids, 'error', (err as Error).message);
    }
  }
  await setInternalSetting('notification_digest_last', day);
  return sent;
}

/** Una vuelta completa: plazos, correos inmediatos y resumen diario. */
export async function runNotifierCycle(): Promise<{ created: number }> {
  const created = await runSchedule();
  await deliverPending();
  await runDigest();
  return { created };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Inicia la revisión periódica (NOTIFY_INTERVAL_MINUTES, 15 por defecto; 0 la desactiva). */
export function startNotifier(ready: () => Promise<unknown>): void {
  const minutes = Number(process.env['NOTIFY_INTERVAL_MINUTES'] ?? 15);
  if (!getPool() || timer || !(minutes > 0)) return;
  const cycle = async () => {
    try {
      await ready();
      const { created } = await runNotifierCycle();
      if (created) console.log(`[Notificaciones] ${created} aviso(s) nuevo(s) por plazos.`);
    } catch (err) {
      console.error('[Notificaciones] Error en la revisión periódica:', (err as Error).message);
    }
  };
  setTimeout(cycle, 20_000).unref();
  timer = setInterval(cycle, minutes * 60_000);
  timer.unref();
}
