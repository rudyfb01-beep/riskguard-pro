import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AnomalyAlert, KriNotificationPreferences } from '../app/models/risk.model';
import { isMailConfigured } from './mailer';

/**
 * Canales externos de las alertas de KRI: webhook (POST JSON a una URL de la cooperativa, p. ej.
 * Teams, Slack o el SIEM) y SMS a través de una pasarela HTTP (SMS_GATEWAY_URL). El correo va por
 * la bandeja de avisos (notifier). Los envíos nunca interrumpen el guardado de la alerta.
 */

export interface ChannelStatus { email: boolean; sms: boolean; webhook: boolean }
export interface DispatchResult { channel: 'email' | 'sms' | 'webhook'; to: string; ok: boolean; detail: string }

export const channelStatus = (): ChannelStatus => ({ email: isMailConfigured(), sms: !!process.env['SMS_GATEWAY_URL'], webhook: true });

const TIMEOUT_MS = 8000;

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? privateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Valida la URL de un webhook: https (http solo con WEBHOOK_ALLOW_HTTP=true) y, salvo
 * WEBHOOK_ALLOW_PRIVATE=true, que no apunte a la red interna (evita usar el servidor para SSRF).
 */
export async function checkWebhookUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('La dirección del webhook no es una URL válida.'); }
  const httpOk = process.env['WEBHOOK_ALLOW_HTTP'] === 'true';
  if (url.protocol !== 'https:' && !(httpOk && url.protocol === 'http:')) throw new Error('El webhook debe usar https://.');
  if (url.username || url.password) throw new Error('La dirección del webhook no puede incluir usuario o clave.');
  if (process.env['WEBHOOK_ALLOW_PRIVATE'] !== 'true') {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new Error(`No se pudo resolver ${host}.`); })).map(a => a.address);
    if (addrs.some(privateAddress)) throw new Error('El webhook apunta a una dirección interna (defina WEBHOOK_ALLOW_PRIVATE=true si es intencional).');
  }
  return url;
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'RiskGuard-Pro', ...headers },
    body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status >= 300) throw new Error(`respondió ${res.status}`);
  return `respondió ${res.status}`;
}

export async function sendWebhook(rawUrl: string, payload: unknown): Promise<string> {
  const url = await checkWebhookUrl(rawUrl);
  return post(url.toString(), payload);
}

/** SMS por la pasarela configurada: POST {to, message, from} con Authorization: Bearer SMS_GATEWAY_TOKEN. */
export async function sendSms(to: string, message: string): Promise<string> {
  const gw = process.env['SMS_GATEWAY_URL'];
  if (!gw) throw new Error('No hay pasarela de SMS configurada (SMS_GATEWAY_URL).');
  if (!/^\+?\d[\d\s-]{6,18}$/.test(to)) throw new Error(`Número no válido: ${to}`);
  const headers: Record<string, string> = process.env['SMS_GATEWAY_TOKEN'] ? { authorization: `Bearer ${process.env['SMS_GATEWAY_TOKEN']}` } : {};
  return post(gw, { to: to.replace(/[\s-]/g, ''), message: message.slice(0, 320), from: process.env['SMS_FROM'] || undefined }, headers);
}

export function alertPayload(a: AnomalyAlert, test = false) {
  const base = (process.env['APP_URL'] || '').replace(/\/+$/, '');
  return {
    source: 'RiskGuard Pro', type: test ? 'prueba' : 'alerta-kri', code: a.code, title: a.title, severity: a.severity, process: a.process,
    kri: a.kriMetric, value: a.currentValue, threshold: a.threshold, triggeredAt: a.triggeredAt, status: a.status, description: a.description,
    url: base ? `${base}/?tab=alertas-kri` : undefined,
    text: `${test ? '[PRUEBA] ' : ''}Alerta ${a.severity} ${a.code}: ${a.title}. ${a.kriMetric}: ${a.currentValue} (umbral ${a.threshold}) en ${a.process}.`,
  };
}

export const smsText = (a: AnomalyAlert, test = false) =>
  `${test ? '[PRUEBA] ' : ''}RiskGuard ${a.severity.toUpperCase()} ${a.code}: ${a.kriMetric} ${a.currentValue} (umbral ${a.threshold}) en ${a.process}.`;

/** ¿Corresponde avisar esta alerta según las preferencias (severidad)? Igual criterio que la bandeja. */
export function wantsAlert(prefs: KriNotificationPreferences, a: AnomalyAlert): boolean {
  if (a.severity === 'Crítico') return prefs.notifyOnCritical;
  if (a.severity === 'Alto' || a.severity === 'Medio') return prefs.notifyOnWarning;
  return false;
}

const lastSent = new Map<string, number>();

/** Envía la alerta por webhook y SMS según las preferencias del KRI (o las globales). */
export async function dispatchAlertChannels(a: AnomalyAlert, prefs: KriNotificationPreferences | null): Promise<DispatchResult[]> {
  if (!prefs || !wantsAlert(prefs, a)) return [];
  const key = a.kriMetric;
  const cooldown = Math.max(0, prefs.cooldownMinutes ?? 0) * 60_000;
  const now = Date.now();
  if (cooldown && now - (lastSent.get(key) ?? 0) < cooldown) return [];
  lastSent.set(key, now);
  const jobs: Promise<DispatchResult>[] = [];
  const run = (channel: DispatchResult['channel'], to: string, fn: () => Promise<string>) =>
    jobs.push(fn().then(detail => ({ channel, to, ok: true, detail }), (e: Error) => ({ channel, to, ok: false, detail: e.message })));
  if (prefs.webhookEnabled && prefs.webhookUrl) run('webhook', prefs.webhookUrl, () => sendWebhook(prefs.webhookUrl!, alertPayload(a)));
  if (prefs.smsEnabled && channelStatus().sms) for (const to of prefs.smsRecipients ?? []) run('sms', to, () => sendSms(to, smsText(a)));
  const results = await Promise.all(jobs);
  for (const r of results) {
    if (r.ok) console.log(`[Alertas] ${a.code} enviada por ${r.channel} a ${r.channel === 'webhook' ? new URL(r.to).host : r.to}: ${r.detail}.`);
    else console.error(`[Alertas] ${a.code}: falló el envío por ${r.channel} a ${r.to}: ${r.detail}`);
  }
  return results;
}

/** Envío de prueba por un canal (botón "Probar" de la configuración de avisos de KRIs). */
export async function testChannel(channel: DispatchResult['channel'], to: string, kriCode: string, mail: (to: string) => Promise<void>): Promise<string> {
  const sample: AnomalyAlert = {
    id: 'prueba', code: kriCode || 'KRI', title: 'Prueba de configuración de avisos', description: 'Envío de prueba desde RiskGuard Pro.',
    kriMetric: kriCode || 'KRI', threshold: '—', currentValue: '—', severity: 'Informativo', process: '—',
    triggeredAt: new Date().toISOString().slice(0, 16).replace('T', ' '), status: 'Activa', escalatedTo: '',
  };
  if (channel === 'email') {
    if (!isMailConfigured()) throw new Error('El servidor no tiene SMTP configurado (SMTP_HOST).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error(`Correo no válido: ${to}`);
    await mail(to);
    return `Correo de prueba enviado a ${to}.`;
  }
  if (channel === 'sms') return `SMS de prueba enviado a ${to} (pasarela ${await sendSms(to, smsText(sample, true))}).`;
  const r = await sendWebhook(to, alertPayload(sample, true));
  return `Webhook de prueba enviado a ${new URL(to).host} (${r}).`;
}

