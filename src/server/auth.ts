import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { getPool } from './db';
import { appendLedger, userFromRow } from './repository';
import { sendLoginCode } from './mailer';
import { UserPermissions, UserProfile } from '../app/models/risk.model';

/**
 * Inicio de sesión sin contraseña: el usuario ingresa su correo, recibe un
 * código de 6 dígitos de un solo uso y, al verificarlo, obtiene una sesión en
 * una cookie HttpOnly. En la base solo se guardan hashes de códigos y tokens.
 */

export const SESSION_COOKIE = 'rg_session';
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'RiskGuard';

const CODE_TTL_MINUTES = Number(process.env['AUTH_CODE_TTL_MINUTES'] || 10);
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;           // por usuario cada 15 minutos
const SESSION_IDLE_MINUTES = Number(process.env['SESSION_IDLE_MINUTES'] || 60);
const SESSION_MAX_HOURS = Number(process.env['SESSION_MAX_HOURS'] || 10);

// Clave para el HMAC de los códigos. Si no se define, se genera al arrancar
// (los códigos viven 10 minutos, así que un reinicio solo invalida los pendientes).
const AUTH_SECRET = process.env['AUTH_SECRET'] || randomBytes(32).toString('hex');

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// -----------------------------------------------------------------------------
// Límite de solicitudes por IP (en memoria; suficiente para una instancia)
// -----------------------------------------------------------------------------

const hits = new Map<string, number[]>();
function rateLimit(bucket: string, ip: string, max: number, windowMs = 15 * 60_000) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  if (list.length >= max) throw new AuthError(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
  list.push(now);
  hits.set(key, list);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.every(t => now - t > 15 * 60_000)) hits.delete(k);
}, 5 * 60_000).unref();

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const codeHash = (userId: string, code: string) => createHmac('sha256', AUTH_SECRET).update(`${userId}:${code}`).digest('hex');
const normalizeEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export function clientIp(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || 'desconocida';
}

/** Fecha ISO (UTC) desplazada en minutos desde ahora; se usa en vez de now() para que el SQL sea portable. */
const isoIn = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

async function findActiveUserByEmail(email: string) {
  const r = await getPool()!.query('SELECT * FROM user_profiles WHERE lower(email) = $1 AND active = TRUE', [email]);
  return r.rows[0];
}

// -----------------------------------------------------------------------------
// Paso 1: solicitar código
// -----------------------------------------------------------------------------

/**
 * Envía un código al correo si pertenece a un usuario activo. La respuesta es
 * la misma exista o no el usuario, para no revelar qué correos están registrados.
 */
export async function requestLoginCode(rawEmail: unknown, ip: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new AuthError(400, 'Ingresa un correo electrónico válido.');
  }
  rateLimit('request', ip, 20);
  const started = Date.now();

  const user = await findActiveUserByEmail(email);
  if (user) {
    const recent = await getPool()!.query(
      `SELECT count(*) AS n FROM auth_login_codes WHERE user_id = $1 AND created_at > $2`,
      [user.id, isoIn(-15)]
    );
    if (Number(recent.rows[0].n) < MAX_CODES_PER_WINDOW) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await getPool()!.query('UPDATE auth_login_codes SET consumed_at = $2 WHERE user_id = $1 AND consumed_at IS NULL', [user.id, isoIn(0)]);
      await getPool()!.query(
        `INSERT INTO auth_login_codes (user_id, code_hash, created_at, expires_at, request_ip) VALUES ($1, $2, $3, $4, $5)`,
        [user.id, codeHash(user.id, code), isoIn(0), isoIn(CODE_TTL_MINUTES), ip]
      );
      // Se envía en segundo plano: así el tiempo de respuesta no revela si el correo existe.
      sendLoginCode(user.email, user.name, code, CODE_TTL_MINUTES).catch(err =>
        console.error(`[Auth] Error enviando el código a ${user.email}:`, (err as Error).message)
      );
    }
  }
  // Igualar el tiempo de respuesta para que no delate si el correo existe.
  const elapsed = Date.now() - started;
  if (elapsed < 600) await delay(600 - elapsed + randomInt(0, 200));
}

// -----------------------------------------------------------------------------
// Paso 2: verificar código y crear sesión
// -----------------------------------------------------------------------------

export async function verifyLoginCode(
  rawEmail: unknown, rawCode: unknown, ip: string, userAgent: string
): Promise<{ token: string; user: UserProfile; maxAgeSeconds: number }> {
  rateLimit('verify', ip, 30);
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === 'string' ? rawCode.replace(/\D/g, '') : '';
  const invalid = new AuthError(401, 'Código incorrecto o vencido. Solicita uno nuevo si es necesario.');
  if (!email || code.length !== 6) throw invalid;

  const user = await findActiveUserByEmail(email);
  if (!user) {
    await delay(300);
    throw invalid;
  }
  const r = await getPool()!.query(
    `SELECT id, code_hash, attempts FROM auth_login_codes
     WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > $2
     ORDER BY created_at DESC LIMIT 1`,
    [user.id, isoIn(0)]
  );
  const row = r.rows[0];
  if (!row) throw invalid;

  const expected = Buffer.from(row.code_hash, 'hex');
  const given = Buffer.from(codeHash(user.id, code), 'hex');
  if (!timingSafeEqual(expected, given)) {
    const attempts = row.attempts + 1;
    try {
      await getPool()!.query(
        `UPDATE auth_login_codes
            SET attempts = $2, consumed_at = $3
          WHERE id = $1`,
        [row.id, attempts, attempts >= MAX_CODE_ATTEMPTS ? isoIn(0) : null]
      );
    } catch (err) {
      // Si no se puede registrar el intento, se invalida el código (falla cerrada).
      await getPool()!.query('UPDATE auth_login_codes SET consumed_at = $2 WHERE id = $1', [row.id, isoIn(0)]).catch(() => undefined);
      throw err;
    }
    if (attempts >= MAX_CODE_ATTEMPTS) {
      throw new AuthError(401, 'Superaste el número de intentos. Solicita un código nuevo.');
    }
    throw new AuthError(401, `Código incorrecto. Te quedan ${MAX_CODE_ATTEMPTS - attempts} intentos.`);
  }

  await getPool()!.query('UPDATE auth_login_codes SET consumed_at = $2 WHERE id = $1', [row.id, isoIn(0)]);
  const token = randomBytes(32).toString('base64url');
  await getPool()!.query(
    `INSERT INTO auth_sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $3, $4, $5, $6)`,
    [sha256(token), user.id, isoIn(0), isoIn(Math.min(SESSION_IDLE_MINUTES, SESSION_MAX_HOURS * 60)), ip, userAgent.slice(0, 300)]
  );
  await getPool()!.query('UPDATE user_profiles SET last_login_at = $2 WHERE id = $1', [user.id, isoIn(0)]);
  // Limpieza oportunista de registros vencidos.
  await getPool()!.query('DELETE FROM auth_sessions WHERE expires_at < $1', [isoIn(-24 * 60)]);
  await getPool()!.query('DELETE FROM auth_login_codes WHERE created_at < $1', [isoIn(-7 * 24 * 60)]);

  const profile = userFromRow(user);
  await appendLedger({
    id: `log-login-${Date.now()}-${randomInt(1000, 9999)}`, userName: profile.name, userRole: profile.role,
    action: 'INICIO_SESIÓN', entityType: 'Sesión', entityCode: profile.id, details: `Inicio de sesión con código enviado a ${profile.email}.`,
  }, ip);
  return { token, user: profile, maxAgeSeconds: SESSION_MAX_HOURS * 3600 };
}

// -----------------------------------------------------------------------------
// Sesión: lectura, renovación por actividad y cierre
// -----------------------------------------------------------------------------

/** Devuelve el usuario de la sesión y extiende su vigencia (hasta el máximo absoluto). */
export async function getSessionUser(token: string | undefined): Promise<UserProfile | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = sha256(token);
  const r = await getPool()!.query(
    `SELECT s.created_at AS session_created_at, u.* FROM auth_sessions s JOIN user_profiles u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.active = TRUE`,
    [tokenHash, isoIn(0)]
  );
  const row = r.rows[0];
  if (!row) return null;
  // Renovación por actividad, sin superar el máximo absoluto desde el inicio de la sesión.
  const createdAt = new Date(row.session_created_at).getTime();
  const expiresAt = Math.min(Date.now() + SESSION_IDLE_MINUTES * 60_000, createdAt + SESSION_MAX_HOURS * 3_600_000);
  await getPool()!.query('UPDATE auth_sessions SET last_seen_at = $2, expires_at = $3 WHERE token_hash = $1',
    [tokenHash, isoIn(0), new Date(expiresAt).toISOString()]);
  return userFromRow(row);
}

export async function destroySession(token: string | undefined, ip: string): Promise<void> {
  if (!token) return;
  const tokenHash = sha256(token);
  const r = await getPool()!.query(
    'SELECT u.* FROM auth_sessions s JOIN user_profiles u ON u.id = s.user_id WHERE s.token_hash = $1', [tokenHash]);
  await getPool()!.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
  if (r.rows[0]) {
    const u = userFromRow(r.rows[0]);
    await appendLedger({
      id: `log-logout-${Date.now()}-${randomInt(1000, 9999)}`, userName: u.name, userRole: u.role,
      action: 'CIERRE_SESIÓN', entityType: 'Sesión', entityCode: u.id, details: 'Cierre de sesión.',
    }, ip);
  }
}

// -----------------------------------------------------------------------------
// Cookies y middlewares
// -----------------------------------------------------------------------------

export function readSessionCookie(req: express.Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function cookieIsSecure(req: express.Request): boolean {
  if (process.env['COOKIE_SECURE'] === 'true') return true;
  if (process.env['COOKIE_SECURE'] === 'false') return false;
  return req.secure;
}

export function setSessionCookie(req: express.Request, res: express.Response, token: string, maxAgeSeconds: number) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: cookieIsSecure(req), path: '/', maxAge: maxAgeSeconds * 1000,
  });
}

export function clearSessionCookie(req: express.Request, res: express.Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: cookieIsSecure(req), path: '/' });
}

/**
 * Protección CSRF: las escrituras deben llevar la cabecera X-Requested-With.
 * Un formulario de otro sitio no puede agregarla y la cookie es SameSite=Strict.
 */
export const requireCsrfHeader: express.RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get(CSRF_HEADER) !== CSRF_VALUE) {
    res.status(403).json({ error: 'Solicitud rechazada (falta cabecera de seguridad).' });
    return;
  }
  next();
};

/** Exige sesión válida cuando hay base de datos; sin ella (modo demostración) no aplica. */
export const requireAuth: express.RequestHandler = async (req, res, next) => {
  if (!getPool()) return next();
  try {
    const user = await getSessionUser(readSessionCookie(req));
    if (!user) {
      res.status(401).json({ error: 'Sesión no iniciada o vencida.' });
      return;
    }
    res.locals['user'] = user;
    next();
  } catch (err) {
    res.status(503).json({ error: `No se pudo validar la sesión: ${(err as Error).message}` });
  }
};

export function currentUser(res: express.Response): UserProfile | undefined {
  return res.locals['user'] as UserProfile | undefined;
}

export function hasAny(user: UserProfile | undefined, perms: (keyof UserPermissions)[]): boolean {
  return !!user && perms.some(p => !!user.permissions?.[p]);
}
