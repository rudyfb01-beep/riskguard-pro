import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { getPool } from './db';

/**
 * Ingreso con aplicación autenticadora (Google Authenticator, Microsoft Authenticator…):
 * códigos TOTP de 6 dígitos cada 30 segundos (RFC 6238, HMAC-SHA1), sin correo ni internet.
 *
 * - El secreto de cada persona se guarda cifrado (AES-256-GCM, clave derivada de AUTH_SECRET).
 * - Un código sirve una sola vez (se guarda el último paso usado) y se acepta ±30 s de desfase.
 * - 5 códigos incorrectos seguidos bloquean el ingreso de esa persona por 15 minutos.
 */

export const totpEnabled = () => process.env['AUTH_TOTP'] === 'true';

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;               // pasos aceptados antes y después del actual
export const TOTP_MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

// --- Base32 (RFC 4648), el formato que leen las aplicaciones -----------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Código TOTP de un paso (contador de 30 s). */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}
export const currentStep = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

/** Paso al que corresponde el código dentro de la ventana, o null. */
export function matchStep(secret: Buffer, code: string, ms = Date.now()): number | null {
  const now = currentStep(ms);
  const given = Buffer.from(code);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const expected = Buffer.from(hotp(secret, now + d));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return now + d;
  }
  return null;
}

// --- Cifrado del secreto ------------------------------------------------------------------------
function key(): Buffer {
  const s = process.env['AUTH_SECRET'];
  if (!s) throw new Error('AUTH_SECRET es obligatorio para el autenticador (cifra los secretos).');
  return Buffer.from(hkdfSync('sha256', s, 'riskguard-totp', 'totp-secret-v1', 32));
}
function encrypt(secret: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(secret), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
function decrypt(stored: string): Buffer {
  const [v, iv, tag, enc] = stored.split(':');
  if (v !== 'v1') throw new Error('Formato de secreto desconocido.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]);
}

// --- Registro por persona -----------------------------------------------------------------------
export interface TotpEnrollment { secret: string; uri: string; qrDataUrl: string; qrTerminal: string }

const isoIn = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

export async function hasTotp(userId: string): Promise<boolean> {
  const r = await getPool()!.query('SELECT 1 FROM auth_totp WHERE user_id = $1', [userId]);
  return (r.rowCount ?? r.rows.length) > 0;
}

export async function enrolledUserIds(): Promise<string[]> {
  const r = await getPool()!.query('SELECT user_id FROM auth_totp');
  return r.rows.map((x: { user_id: string }) => x.user_id);
}

/** Crea (o reemplaza) el secreto de una persona y devuelve lo necesario para escanearlo. */
export async function enrollTotp(user: { id: string; email: string }, by: string): Promise<TotpEnrollment> {
  const raw = randomBytes(20);
  const secret = base32Encode(raw);
  const issuer = process.env['APP_NAME'] || 'RiskGuard Pro';
  const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${user.email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  await getPool()!.query('DELETE FROM auth_totp WHERE user_id = $1', [user.id]);
  await getPool()!.query(
    'INSERT INTO auth_totp (user_id, secret_enc, created_at, created_by, last_step, failures, locked_until) VALUES ($1, $2, $3, $4, 0, 0, NULL)',
    [user.id, encrypt(raw), isoIn(0), by.slice(0, 200)]
  );
  const [qrDataUrl, qrTerminal] = await Promise.all([
    QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 }),
    QRCode.toString(uri, { type: 'terminal', small: true, errorCorrectionLevel: 'M' }),
  ]);
  return { secret, uri, qrDataUrl, qrTerminal };
}

export async function removeTotp(userId: string): Promise<boolean> {
  const r = await getPool()!.query('DELETE FROM auth_totp WHERE user_id = $1', [userId]);
  return (r.rowCount ?? 0) > 0;
}

export type TotpResult = { ok: true } | { ok: false; reason: 'invalid' | 'locked' | 'reused'; remaining?: number };

/** Verifica un código: rechaza reusos, cuenta fallos y bloquea tras TOTP_MAX_FAILURES. */
export async function verifyTotp(userId: string, code: string): Promise<TotpResult> {
  const r = await getPool()!.query('SELECT secret_enc, last_step, failures, locked_until FROM auth_totp WHERE user_id = $1', [userId]);
  const row = r.rows[0];
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) return { ok: false, reason: 'locked' };
  const step = matchStep(decrypt(row.secret_enc), code);
  if (step !== null && step > Number(row.last_step)) {
    // Compara y actualiza en una sola sentencia: dos solicitudes simultáneas con el mismo código no pasan ambas.
    const u = await getPool()!.query(
      'UPDATE auth_totp SET last_step = $2, failures = 0, locked_until = NULL WHERE user_id = $1 AND last_step < $2',
      [userId, step]
    );
    if ((u.rowCount ?? 0) > 0) return { ok: true };
    return { ok: false, reason: 'reused' };
  }
  if (step !== null) return { ok: false, reason: 'reused' };
  const failures = Number(row.failures) + 1;
  const locked = failures >= TOTP_MAX_FAILURES;
  await getPool()!.query('UPDATE auth_totp SET failures = $2, locked_until = $3 WHERE user_id = $1',
    [userId, locked ? 0 : failures, locked ? isoIn(LOCK_MINUTES) : null]);
  return locked ? { ok: false, reason: 'locked' } : { ok: false, reason: 'invalid', remaining: TOTP_MAX_FAILURES - failures };
}
