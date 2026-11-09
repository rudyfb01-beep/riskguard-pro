// Utilidades de las pruebas de API: levantan el servidor compilado (dist/) sobre una base nueva
// y abren sesiones con el código de acceso que el servidor escribe en su log (AUTH_DEV_LOG_CODES).
//
//   SQLite (por defecto): una base temporal por servidor.
//   PostgreSQL:           TEST_DATABASE_URL=postgres://usuario:clave@host:5432/postgres
//                         (se crea y elimina una base riskguard_test_<n> por servidor).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const SERVER = join(ROOT, 'dist/app/server/server.mjs');
export const D = '@demo.riskguard.cl';
export const CSRF = { 'X-Requested-With': 'RiskGuard' };

const freePort = () => new Promise((ok, fail) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }).on('error', fail);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pgAdmin(sql) {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect();
  try { await c.query(sql); } finally { await c.end(); }
}

/** Inicia el servidor y espera a que la base esté lista. Devuelve { base, stop, log, dir }. */
export async function startServer(env = {}) {
  if (!existsSync(SERVER)) throw new Error('Falta dist/: ejecute "npx ng build" antes de las pruebas.');
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'rg-test-'));
  const dbEnv = {};
  let dbName = null;
  if (process.env.TEST_DATABASE_URL) {
    dbName = `riskguard_test_${port}`;
    await pgAdmin(`DROP DATABASE IF EXISTS ${dbName}`);
    await pgAdmin(`CREATE DATABASE ${dbName}`);
    const u = new URL(process.env.TEST_DATABASE_URL);
    u.pathname = `/${dbName}`;
    dbEnv.DATABASE_URL = u.toString();
  } else {
    dbEnv.DB_CLIENT = 'sqlite';
    dbEnv.SQLITE_PATH = join(dir, 'riskguard.db');
  }
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH, TZ: process.env.TZ ?? 'America/Santiago',
      PORT: String(port), APP_URL: `http://localhost:${port}`,
      SEED_DEMO_DATA: 'true', AUTH_DEV_LOG_CODES: 'true', NOTIFY_INTERVAL_MINUTES: '0',
      BACKUP_INTERVAL_HOURS: '0', BACKUP_DIR: join(dir, 'backups'), UF_AUTO_SYNC: 'false',
      ...dbEnv, ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  while (!/esquema al día|no se pudo preparar/.test(log)) {
    if (child.exitCode !== null) throw new Error(`El servidor terminó:\n${log}`);
    if (Date.now() > deadline) { child.kill(); throw new Error(`El servidor no quedó listo:\n${log}`); }
    await sleep(150);
  }
  if (/no se pudo preparar/.test(log)) { child.kill(); throw new Error(log); }
  const server = {
    base, dir, port,
    get log() { return log; },
    async stop() {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise(r => child.once('exit', r));
      }
      if (dbName) await pgAdmin(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      rmSync(dir, { recursive: true, force: true });
    },
    /** Código de acceso más reciente enviado a un correo (lo escribe el servidor en su log). */
    async codeFor(email, after = 0) {
      for (let i = 0; i < 80; i++) {
        const all = [...log.slice(after).matchAll(/Código de acceso para (\S+): (\d{6})/g)].filter(m => m[1] === email);
        if (all.length) return all[all.length - 1][2];
        await sleep(100);
      }
      throw new Error(`Sin código para ${email}`);
    },
    /** Abre una sesión con el flujo real de código por correo. */
    async login(user) {
      const email = user.includes('@') ? user : user + D;
      const s = new Session(base);
      const mark = log.length;
      const r = await s.call('POST', '/api/auth/request-code', { email });
      if (r.status !== 200) throw new Error(`request-code ${r.status} ${JSON.stringify(r.body)}`);
      const v = await s.call('POST', '/api/auth/verify', { email, code: await server.codeFor(email, mark) });
      if (v.status !== 200) throw new Error(`verify ${v.status} ${JSON.stringify(v.body)}`);
      s.user = v.body.user;
      return s;
    },
    anon() { return new Session(base); },
  };
  return server;
}

/** Cliente HTTP con su propia cookie de sesión. */
export class Session {
  constructor(base) { this.base = base; this.cookies = new Map(); this.user = null; }
  get cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  async fetch(method, path, { body, headers = {}, raw = false, csrf = true } = {}) {
    const h = { ...(csrf ? CSRF : {}), ...headers };
    if (this.cookies.size) h.cookie = this.cookieHeader;
    let payload;
    if (body !== undefined) {
      if (raw) payload = body;
      else { payload = JSON.stringify(body); h['content-type'] ??= 'application/json'; }
    }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (!v || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(k); else this.cookies.set(k, v);
    }
    return res;
  }
  async call(method, path, body, headers) {
    const res = await this.fetch(method, path, { body, headers });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* no JSON */ }
    return { status: res.status, body: json, text, headers: res.headers };
  }
}
