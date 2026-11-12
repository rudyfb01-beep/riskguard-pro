import { createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { getPool } from './db';
import { appendLedger, userFromRow } from './repository';
import { AUTH_SECRET, AuthError, createSession, findActiveUserByEmail, isoIn, normalizeEmail, rateLimit } from './auth';
import { checkPassword, PASSWORD_MAX } from '../app/utils/password';
import { UserProfile } from '../app/models/risk.model';

/**
 * Ingreso con correo y contraseña (AUTH_PASSWORD=true), para servidores sin correo saliente.
 *
 * - Solo se guarda el hash scrypt (sal propia por persona).
 * - La primera contraseña es temporal: la genera el administrador (o la consola del servidor), vence
 *   en 24 horas y debe cambiarse al entrar. No hay recuperación por correo: el administrador la restablece.
 * - 5 intentos fallidos bloquean la cuenta 15 minutos; las respuestas no revelan si el correo existe.
 */

export const passwordEnabled = () => (process.env['AUTH_PASSWORD'] ?? '').trim().toLowerCase() === 'true';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const TEMP_HOURS = 24;
const TICKET_MINUTES = 10;
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32 };

const bool = (v: unknown) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';
const time = (v: unknown) => (v ? new Date(v as string).getTime() : 0);

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFC'), salt, keylen, { N, r, p, maxmem: 256 * N * r }, (err, key) => (err ? reject(err) : resolve(key))));
}

/** Formato: scrypt$N$r$p$sal$hash (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = (stored ?? '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Hash de relleno: se verifica contra él cuando el correo no existe, para que la demora sea la misma.
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= hashPassword(randomBytes(12).toString('hex')));

/** Contraseña temporal fácil de dictar: tres grupos de 4 sin caracteres ambiguos (≈ 70 bits). */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  for (;;) {
    const groups = [0, 1, 2].map(() => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(''));
    const pw = groups.join('-');
    if (/\d/.test(pw) && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && checkPassword(pw).ok) return pw;
  }
}

// Ticket para el cambio obligatorio: firmado y atado al hash vigente, así sirve una sola vez.
function makeTicket(userId: string, passwordHash: string): string {
  const exp = Date.now() + TICKET_MINUTES * 60_000;
  const mac = createHmac('sha256', AUTH_SECRET).update(`pwchange:${userId}:${exp}:${passwordHash}`).digest('base64url');
  return `${Buffer.from(userId).toString('base64url')}.${exp}.${mac}`;
}

function readTicket(ticket: unknown): { userId: string; exp: number; mac: string } | null {
  if (typeof ticket !== 'string' || ticket.length > 400) return null;
  const [u, e, mac] = ticket.split('.');
  const exp = Number(e);
  if (!u || !mac || !Number.isFinite(exp) || exp < Date.now()) return null;
  return { userId: Buffer.from(u, 'base64url').toString('utf8'), exp, mac };
}

async function passwordRow(userId: string) {
  const r = await getPool()!.query('SELECT * FROM auth_passwords WHERE user_id = $1', [userId]);
  return r.rows[0];
}

const genericError = () => new AuthError(401, 'Correo o contraseña incorrectos.');

async function ledger(user: { id: string; name: string; email: string }, by: { name: string; role: string }, details: string, ip: string) {
  await appendLedger({
    id: `log-pw-${Date.now()}-${randomInt(100000, 999999)}`, userName: by.name, userRole: by.role, action: 'GESTIÓN_USUARIO',
    entityType: 'Usuario', entityCode: user.id, details,
  }, ip);
}

export type PasswordLoginResult =
  | { kind: 'session'; token: string; user: UserProfile; maxAgeSeconds: number }
  | { kind: 'change'; ticket: string; email: string; name: string };

/** Paso único de ingreso. Si la contraseña es temporal, devuelve un ticket para cambiarla. */
export async function loginWithPassword(rawEmail: unknown, rawPassword: unknown, ip: string, userAgent: string): Promise<PasswordLoginResult> {
  if (!passwordEnabled()) throw new AuthError(403, 'El ingreso con contraseña no está habilitado.');
  rateLimit('pwlogin', ip, 30);
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  if (!email || !password || password.length > PASSWORD_MAX * 4) throw genericError();

  const user = await findActiveUserByEmail(email);
  const row = user ? await passwordRow(user.id) : undefined;
  if (!user || !row) {
    await verifyPasswordHash(password, await dummy());
    throw genericError();
  }
  if (time(row.locked_until) > Date.now()) {
    const min = Math.max(1, Math.ceil((time(row.locked_until) - Date.now()) / 60_000));
    throw new AuthError(429, `Cuenta bloqueada por intentos fallidos. Inténtalo en ${min} minuto${min === 1 ? '' : 's'} o pide al administrador que restablezca tu contraseña.`);
  }
  const ok = await verifyPasswordHash(password, row.password_hash);
  if (!ok) {
    const failures = Number(row.failures || 0) + 1;
    const lock = failures >= MAX_FAILURES;
    await getPool()!.query('UPDATE auth_passwords SET failures = $2, locked_until = $3 WHERE user_id = $1',
      [user.id, lock ? 0 : failures, lock ? isoIn(LOCK_MINUTES) : null]);
    if (lock) {
      await ledger(user, { name: 'Sistema', role: 'Seguridad' }, `Cuenta de ${user.email} bloqueada ${LOCK_MINUTES} minutos tras ${MAX_FAILURES} contraseñas incorrectas (IP ${ip}).`, ip);
      throw new AuthError(429, `Demasiados intentos fallidos: la cuenta queda bloqueada ${LOCK_MINUTES} minutos.`);
    }
    throw genericError();
  }
  if (Number(row.failures || 0) || row.locked_until) {
    await getPool()!.query('UPDATE auth_passwords SET failures = 0, locked_until = NULL WHERE user_id = $1', [user.id]);
  }
  if (bool(row.must_change)) {
    if (row.temp_expires_at && time(row.temp_expires_at) < Date.now()) {
      throw new AuthError(401, 'La contraseña temporal venció. Pide al administrador una nueva.');
    }
    return { kind: 'change', ticket: makeTicket(user.id, row.password_hash), email: user.email, name: user.name };
  }
  const s = await createSession(user, ip, userAgent, `Inicio de sesión con contraseña (${user.email}).`);
  return { kind: 'session', ...s };
}

/** Cambio obligatorio de la contraseña temporal; al terminar abre la sesión. */
export async function changeWithTicket(rawTicket: unknown, rawNew: unknown, ip: string, userAgent: string) {
  if (!passwordEnabled()) throw new AuthError(403, 'El ingreso con contraseña no está habilitado.');
  rateLimit('pwchange', ip, 30);
  const t = readTicket(rawTicket);
  const expired = new AuthError(401, 'El tiempo para cambiar la contraseña terminó. Vuelve a ingresar con la contraseña temporal.');
  if (!t) throw expired;
  const user = (await getPool()!.query('SELECT * FROM user_profiles WHERE id = $1 AND active = TRUE', [t.userId])).rows[0];
  const row = user ? await passwordRow(user.id) : undefined;
  if (!user || !row || !bool(row.must_change)) throw expired;
  const expectedMac = createHmac('sha256', AUTH_SECRET).update(`pwchange:${user.id}:${t.exp}:${row.password_hash}`).digest();
  const givenMac = Buffer.from(t.mac, 'base64url');
  if (givenMac.length !== expectedMac.length || !timingSafeEqual(givenMac, expectedMac)) throw expired;

  const newPassword = typeof rawNew === 'string' ? rawNew : '';
  if (await verifyPasswordHash(newPassword, row.password_hash)) throw new AuthError(400, 'Debe ser distinta de la contraseña temporal.');
  const check = checkPassword(newPassword, { email: user.email, name: user.name });
  if (!check.ok) throw new AuthError(400, check.problems.join(' '));

  await getPool()!.query(
    `UPDATE auth_passwords SET password_hash = $2, must_change = FALSE, temp_expires_at = NULL, failures = 0, locked_until = NULL,
            updated_at = $3, updated_by = $4 WHERE user_id = $1 AND password_hash = $5`,
    [user.id, await hashPassword(newPassword), isoIn(0), user.email, row.password_hash]);
  await ledger(user, { name: user.name, role: userFromRow(user).role }, 'Cambió su contraseña temporal por una propia.', ip);
  return createSession(user, ip, userAgent, `Inicio de sesión con contraseña nueva (${user.email}).`);
}

/** Cambio voluntario desde la sesión: exige la contraseña actual y cierra las demás sesiones. */
export async function changeOwnPassword(user: UserProfile, rawCurrent: unknown, rawNew: unknown, currentTokenHash: string, ip: string): Promise<void> {
  if (!passwordEnabled()) throw new AuthError(403, 'El ingreso con contraseña no está habilitado.');
  rateLimit('pwself', ip, 20);
  const row = await passwordRow(user.id);
  if (!row) throw new AuthError(400, 'No tienes contraseña asignada; pide al administrador una temporal.');
  const current = typeof rawCurrent === 'string' ? rawCurrent : '';
  if (!(await verifyPasswordHash(current, row.password_hash))) {
    const failures = Number(row.failures || 0) + 1;
    const lock = failures >= MAX_FAILURES;
    await getPool()!.query('UPDATE auth_passwords SET failures = $2, locked_until = $3 WHERE user_id = $1',
      [user.id, lock ? 0 : failures, lock ? isoIn(LOCK_MINUTES) : null]);
    if (lock) await getPool()!.query('DELETE FROM auth_sessions WHERE user_id = $1', [user.id]);
    throw new AuthError(lock ? 429 : 400, lock ? 'Demasiados intentos: se cerró la sesión y la cuenta queda bloqueada 15 minutos.' : 'La contraseña actual no es correcta.');
  }
  const newPassword = typeof rawNew === 'string' ? rawNew : '';
  const check = checkPassword(newPassword, { email: user.email, name: user.name, previous: current });
  if (!check.ok) throw new AuthError(400, check.problems.join(' '));
  await getPool()!.query(
    `UPDATE auth_passwords SET password_hash = $2, must_change = FALSE, temp_expires_at = NULL, failures = 0, locked_until = NULL,
            updated_at = $3, updated_by = $4 WHERE user_id = $1`,
    [user.id, await hashPassword(newPassword), isoIn(0), user.email]);
  await getPool()!.query('DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, currentTokenHash]);
  await ledger(user, user, 'Cambió su contraseña (se cerraron sus otras sesiones).', ip);
}

/**
 * Asigna una contraseña temporal (primer ingreso u olvido). Se muestra una sola vez a quien la
 * genera, vence en 24 horas, obliga a cambiarla y cierra las sesiones abiertas de esa persona.
 */
export async function setTemporaryPassword(
  target: { id: string; name: string; email: string }, by: { name: string; role: string; email?: string }, ip: string
): Promise<{ password: string; expiresAt: string }> {
  const password = generateTemporaryPassword();
  const hash = await hashPassword(password);
  const expiresAt = isoIn(TEMP_HOURS * 60);
  const pool = getPool()!;
  const updated = await pool.query(
    `UPDATE auth_passwords SET password_hash = $2, must_change = TRUE, temp_expires_at = $3, failures = 0, locked_until = NULL,
            updated_at = $4, updated_by = $5 WHERE user_id = $1`,
    [target.id, hash, expiresAt, isoIn(0), by.email ?? by.name]);
  if (!updated.rowCount) {
    await pool.query(
      `INSERT INTO auth_passwords (user_id, password_hash, must_change, temp_expires_at, failures, updated_at, updated_by)
       VALUES ($1, $2, TRUE, $3, 0, $4, $5)`,
      [target.id, hash, expiresAt, isoIn(0), by.email ?? by.name]);
  }
  await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [target.id]);
  await ledger(target, by, `Contraseña temporal asignada a ${target.name} (${target.email}); vence en ${TEMP_HOURS} horas y debe cambiarse al ingresar.`, ip);
  return { password, expiresAt };
}

/** Estado de contraseña por persona (para las insignias de la administración; nunca el hash). */
export async function passwordStatus(): Promise<Record<string, { mustChange: boolean; tempExpiresAt: string | null; locked: boolean; updatedAt: string | null }>> {
  const r = await getPool()!.query('SELECT user_id, must_change, temp_expires_at, locked_until, updated_at FROM auth_passwords');
  const out: Record<string, { mustChange: boolean; tempExpiresAt: string | null; locked: boolean; updatedAt: string | null }> = {};
  for (const x of r.rows) {
    out[x.user_id] = {
      mustChange: bool(x.must_change),
      tempExpiresAt: x.temp_expires_at ? new Date(x.temp_expires_at).toISOString() : null,
      locked: time(x.locked_until) > Date.now(),
      updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : null,
    };
  }
  return out;
}
