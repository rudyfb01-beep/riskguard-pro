import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature, JsonWebKey } from 'node:crypto';
import express from 'express';
import { getPool } from './db';
import { AuthError } from './auth';

/**
 * Ingreso con Google (OpenID Connect, flujo de código de autorización con PKCE).
 *
 * 1. /api/auth/google/start genera state, nonce y code_verifier, los guarda en una cookie
 *    firmada de 10 minutos y redirige a Google.
 * 2. /api/auth/google/callback comprueba el state, canjea el código por el id_token y lo
 *    verifica: firma RS256 con las claves públicas de Google, emisor, audiencia, vigencia,
 *    nonce, correo verificado y dominio permitido (claim "hd").
 * 3. Solo entran personas ya registradas y activas. La primera vez se vincula la cuenta de
 *    Google (claim "sub") al usuario; después debe coincidir.
 */

const env = (k: string) => (process.env[k] ?? '').trim();

export interface GoogleConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  domains: string[];
  /** Cómo se usa el código por correo: siempre, nunca, o solo para administradores (acceso de emergencia). */
  emailCode: 'true' | 'false' | 'admins';
  authUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  issuers: string[];
}

export function googleConfig(): GoogleConfig {
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  const mode = env('AUTH_EMAIL_CODE').toLowerCase();
  const enabled = !!clientId && !!clientSecret;
  return {
    enabled,
    clientId,
    clientSecret,
    domains: env('GOOGLE_ALLOWED_DOMAINS').split(',').map(d => d.trim().toLowerCase()).filter(Boolean),
    // Con contraseñas no se usa el código por correo; sin Google, el código es la única forma de entrar.
    emailCode: env('AUTH_PASSWORD').toLowerCase() === 'true' ? 'false' : !enabled ? 'true' : mode === 'false' || mode === 'admins' ? mode : 'true',
    // Las URL solo se cambian en pruebas (proveedor simulado).
    authUrl: env('GOOGLE_AUTH_URL') || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: env('GOOGLE_TOKEN_URL') || 'https://oauth2.googleapis.com/token',
    jwksUrl: env('GOOGLE_JWKS_URL') || 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: env('GOOGLE_ISSUER') ? [env('GOOGLE_ISSUER')] : ['https://accounts.google.com', 'accounts.google.com'],
  };
}

/** Dirección de retorno registrada en Google Cloud: APP_URL + /api/auth/google/callback. */
export function redirectUri(req: express.Request): string {
  const base = env('GOOGLE_REDIRECT_URI') || (env('APP_URL') ? `${env('APP_URL').replace(/\/+$/, '')}/api/auth/google/callback` : '');
  return base || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
}

// -----------------------------------------------------------------------------
// Cookie firmada con el estado del flujo
// -----------------------------------------------------------------------------

export const FLOW_COOKIE = 'rg_oidc';
const FLOW_TTL_MS = 10 * 60_000;
const SECRET = env('AUTH_SECRET') || randomBytes(32).toString('hex');

export interface FlowState { state: string; nonce: string; verifier: string; returnTo: string; popup: boolean; exp: number }

const b64 = (b: Buffer) => b.toString('base64url');
const sign = (payload: string) => b64(createHmac('sha256', SECRET).update(payload).digest());

export function encodeFlow(f: FlowState): string {
  const payload = b64(Buffer.from(JSON.stringify(f)));
  return `${payload}.${sign(payload)}`;
}

export function decodeFlow(raw: string | undefined): FlowState | null {
  if (!raw || raw.length > 2000 || !raw.includes('.')) return null;
  const [payload, mac] = raw.split('.');
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac ?? '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const f = JSON.parse(Buffer.from(payload, 'base64url').toString()) as FlowState;
    return f.exp > Date.now() ? f : null;
  } catch {
    return null;
  }
}

/** Solo rutas internas (evita redirecciones abiertas). */
export function safeReturn(v: unknown): string {
  const s = typeof v === 'string' ? v : '/';
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') && s.length < 500 ? s : '/';
}

export function newFlow(returnTo: unknown, popup: boolean): { flow: FlowState; challenge: string } {
  const verifier = b64(randomBytes(32));
  const flow: FlowState = {
    state: b64(randomBytes(24)), nonce: b64(randomBytes(24)), verifier, returnTo: safeReturn(returnTo), popup, exp: Date.now() + FLOW_TTL_MS,
  };
  return { flow, challenge: b64(createHash('sha256').update(verifier).digest()) };
}

export function authorizationUrl(cfg: GoogleConfig, req: express.Request, flow: FlowState, challenge: string, loginHint?: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: redirectUri(req), response_type: 'code', scope: 'openid email profile',
    state: flow.state, nonce: flow.nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  if (cfg.domains.length === 1) q.set('hd', cfg.domains[0]);
  if (loginHint && /^[^\s@]+@[^\s@]+$/.test(loginHint)) q.set('login_hint', loginHint);
  return `${cfg.authUrl}?${q}`;
}

// -----------------------------------------------------------------------------
// Verificación del id_token
// -----------------------------------------------------------------------------

interface Jwk extends JsonWebKey { kid: string; alg?: string }
let jwksCache: { keys: Jwk[]; until: number; url: string } | null = null;

async function jwks(cfg: GoogleConfig, force = false): Promise<Jwk[]> {
  if (!force && jwksCache && jwksCache.url === cfg.jwksUrl && jwksCache.until > Date.now()) return jwksCache.keys;
  const resp = await fetch(cfg.jwksUrl);
  if (!resp.ok) throw new AuthError(502, 'No se pudieron obtener las claves de Google.');
  const data = await resp.json() as { keys: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(resp.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  jwksCache = { keys: data.keys ?? [], until: Date.now() + Math.min(maxAge, 86_400) * 1000, url: cfg.jwksUrl };
  return jwksCache.keys;
}

export interface GoogleIdentity { sub: string; email: string; name?: string; hd?: string }

/** Verifica firma y claims; devuelve la identidad o lanza AuthError con el motivo. */
export async function verifyIdToken(cfg: GoogleConfig, idToken: string, nonce: string, now = Date.now()): Promise<GoogleIdentity> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new AuthError(401, 'Respuesta de Google no válida.');
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    throw new AuthError(401, 'Respuesta de Google no válida.');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new AuthError(401, 'Firma de Google no válida.');
  let key = (await jwks(cfg)).find(k => k.kid === header.kid);
  if (!key) key = (await jwks(cfg, true)).find(k => k.kid === header.kid);   // rotación de claves
  if (!key) throw new AuthError(401, 'Firma de Google no válida.');
  const ok = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new AuthError(401, 'Firma de Google no válida.');

  const skew = 120;
  const t = Math.floor(now / 1000);
  if (!cfg.issuers.includes(String(claims['iss']))) throw new AuthError(401, 'Emisor no válido.');
  const aud = claims['aud'];
  if (!(aud === cfg.clientId || (Array.isArray(aud) && aud.includes(cfg.clientId)))) throw new AuthError(401, 'El token no es para esta aplicación.');
  if (typeof claims['exp'] !== 'number' || claims['exp'] + skew < t) throw new AuthError(401, 'El ingreso con Google venció; inténtalo de nuevo.');
  if (typeof claims['iat'] === 'number' && claims['iat'] - skew > t) throw new AuthError(401, 'Token con fecha inválida.');
  if (claims['nonce'] !== nonce) throw new AuthError(401, 'La respuesta de Google no corresponde a este ingreso.');
  const email = String(claims['email'] ?? '').toLowerCase();
  if (!email || (claims['email_verified'] !== true && claims['email_verified'] !== 'true')) throw new AuthError(403, 'La cuenta de Google no tiene el correo verificado.');
  if (cfg.domains.length) {
    const hd = String(claims['hd'] ?? '').toLowerCase();
    const domain = email.split('@')[1] ?? '';
    if (!cfg.domains.includes(hd) || !cfg.domains.includes(domain)) throw new AuthError(403, `Usa tu cuenta de ${cfg.domains.join(' o ')}.`);
  }
  return { sub: String(claims['sub']), email, name: typeof claims['name'] === 'string' ? claims['name'] : undefined, hd: claims['hd'] as string | undefined };
}

/** Canjea el código por los tokens (PKCE). */
export async function exchangeCode(cfg: GoogleConfig, req: express.Request, code: string, verifier: string): Promise<string> {
  const resp = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri(req), grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  const data = await resp.json().catch(() => ({})) as { id_token?: string; error?: string; error_description?: string };
  if (!resp.ok || !data.id_token) {
    console.warn('[Auth] Google rechazó el canje del código:', data.error, data.error_description);
    throw new AuthError(401, 'Google no confirmó el ingreso. Inténtalo de nuevo.');
  }
  return data.id_token;
}

/**
 * Usuario activo con ese correo; vincula la cuenta de Google la primera vez y exige que
 * coincida después (si el correo se reasigna a otra cuenta, no entra).
 */
export async function userForGoogle(id: GoogleIdentity) {
  const pool = getPool()!;
  const r = await pool.query('SELECT * FROM user_profiles WHERE lower(email) = $1 AND active = TRUE', [id.email]);
  const user = r.rows[0];
  if (!user) throw new AuthError(403, `${id.email} no está registrado en RiskGuard Pro. Pide acceso al administrador.`);
  if (user.google_sub && user.google_sub !== id.sub) {
    throw new AuthError(403, 'Esta cuenta de Google no es la vinculada a tu usuario. Pide al administrador que la desvincule.');
  }
  if (!user.google_sub) await pool.query('UPDATE user_profiles SET google_sub = $2 WHERE id = $1', [user.id, id.sub]);
  return user;
}
