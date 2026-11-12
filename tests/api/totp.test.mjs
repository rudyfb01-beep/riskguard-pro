// Ingreso con aplicación autenticadora (TOTP, RFC 6238): registro por el administrador, ingreso
// sin correo, códigos de un solo uso, bloqueo, restablecimiento, permisos y comando del servidor.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { D, ROOT, SERVER, Session, startServer } from './helpers.mjs';

// TOTP independiente de la implementación del servidor.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(s) {
  let bits = 0, v = 0; const out = [];
  for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', b32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
const step = () => Math.floor(Date.now() / 30000);

const SECRET_ENV = { AUTH_TOTP: 'true', AUTH_SECRET: 'x'.repeat(64) };
let srv, admin, carlosId;
before(async () => {
  srv = await startServer(SECRET_ENV);
  admin = await srv.login('elena.vasconcelos');
  carlosId = (await admin.call('GET', '/api/data')).body.users.find(u => u.email === `carlos.mendoza${D}`).id;
});
after(() => srv?.stop());

async function loginTotp(email, code) {
  const s = new Session(srv.base);
  await s.call('POST', '/api/auth/request-code', { email });
  return { s, r: await s.call('POST', '/api/auth/verify', { email, code }) };
}

describe('Aplicación autenticadora', () => {
  test('la configuración pública lo informa', async () => {
    const r = await srv.anon().call('GET', '/api/auth/config');
    assert.equal(r.body.totp, true);
  });

  test('vector de prueba RFC 6238 (SHA-1, 6 dígitos)', () => {
    // Secreto ASCII "12345678901234567890", T = 59 s → 94287082 (8 dígitos) → 287082.
    const secret = Buffer.from('12345678901234567890');
    let b = 0, v = 0, s = '';
    for (const x of secret) { v = (v << 8) | x; b += 8; while (b >= 5) { s += B32[(v >>> (b - 5)) & 31]; b -= 5; } }
    if (b) s += B32[(v << (5 - b)) & 31];
    assert.equal(totp(s, 1), '287082');
  });

  let secret;
  test('el administrador lo activa: QR, clave y bitácora', async () => {
    const r = await admin.call('POST', `/api/admin/users/${carlosId}/totp`);
    assert.equal(r.status, 200, r.text);
    assert.match(r.body.uri, /^otpauth:\/\/totp\/RiskGuard%20Pro%3Acarlos\.mendoza%40demo\.riskguard\.cl\?secret=[A-Z2-7]+&issuer=RiskGuard%20Pro/);
    assert.match(r.body.qr, /^data:image\/png;base64,/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    secret = r.body.secret;
    assert.match(r.body.ledger.details, /Autenticador activado/);
    const list = await admin.call('GET', '/api/admin/totp');
    assert.deepEqual(list.body.userIds, [carlosId]);
  });

  test('con autenticador no se envía correo y se entra con el número de la aplicación', async () => {
    const mark = srv.log.length;
    const { s, r } = await loginTotp(`carlos.mendoza${D}`, totp(secret));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.email, `carlos.mendoza${D}`);
    assert.doesNotMatch(srv.log.slice(mark), /Código de acceso para carlos\.mendoza/);
    assert.equal((await s.call('GET', '/api/auth/me')).status, 200);
    const d = (await admin.call('GET', '/api/data')).body;
    assert.ok(d.ledger.some(e => /aplicación autenticadora/.test(e.details)));
  });

  test('el mismo número no sirve dos veces', async () => {
    // Espera al paso siguiente para no chocar con el ingreso anterior.
    const s0 = step();
    while (step() === s0) await new Promise(r => setTimeout(r, 250));
    const code = totp(secret);
    assert.equal((await loginTotp(`carlos.mendoza${D}`, code)).r.status, 200);
    const again = (await loginTotp(`carlos.mendoza${D}`, code)).r;
    assert.equal(again.status, 401);
    assert.match(again.body.error, /ya se usó/);
  });

  test('un cargo sin permiso no puede activar ni quitar autenticadores', async () => {
    const ops = await srv.login('sofia.valenzuela');
    assert.equal((await ops.call('POST', `/api/admin/users/${carlosId}/totp`)).status, 403);
    assert.equal((await ops.call('DELETE', `/api/admin/users/${carlosId}/totp`)).status, 403);
    assert.equal((await ops.call('GET', '/api/admin/totp')).status, 403);
  });

  test('5 números incorrectos bloquean, y restablecer invalida el registro anterior', async () => {
    const bad = totp(secret) === '000000' ? '111111' : '000000';
    let last;
    for (let i = 0; i < 5; i++) last = (await loginTotp(`carlos.mendoza${D}`, bad)).r;
    assert.equal(last.status, 429);
    assert.match(last.body.error, /Espera 15 minutos/);
    // Bloqueado: ni el número correcto entra.
    assert.equal((await loginTotp(`carlos.mendoza${D}`, totp(secret, step() + 1))).r.status, 429);
    // Restablecer: secreto nuevo, el anterior deja de servir y el bloqueo se levanta.
    const r = await admin.call('POST', `/api/admin/users/${carlosId}/totp`);
    assert.equal(r.body.replaced, true);
    assert.equal((await loginTotp(`carlos.mendoza${D}`, totp(secret))).r.status, 401);
    assert.equal((await loginTotp(`carlos.mendoza${D}`, totp(r.body.secret))).r.status, 200);
    secret = r.body.secret;
  });

  test('quitar el autenticador vuelve al código por correo', async () => {
    assert.equal((await admin.call('DELETE', `/api/admin/users/${carlosId}/totp`)).status, 200);
    const mark = srv.log.length;
    await srv.anon().call('POST', '/api/auth/request-code', { email: `carlos.mendoza${D}` });
    assert.ok(await srv.codeFor(`carlos.mendoza${D}`, mark));
  });

  test('comando del servidor: activa el autenticador del primer administrador', async () => {
    const dbEnv = process.env.TEST_DATABASE_URL
      ? { DATABASE_URL: (() => { const u = new URL(process.env.TEST_DATABASE_URL); u.pathname = `/riskguard_test_${srv.port}`; return u.toString(); })() }
      : { DB_CLIENT: 'sqlite', SQLITE_PATH: join(srv.dir, 'riskguard.db') };
    const run = spawnSync(process.execPath, [SERVER, 'autenticador', `elena.vasconcelos${D}`],
      { cwd: ROOT, env: { PATH: process.env.PATH, ...SECRET_ENV, ...dbEnv }, encoding: 'utf8', timeout: 30_000 });
    assert.equal(run.status, 0, run.stderr);
    const key = /clave ([A-Z2-7]{32})/.exec(run.stdout)?.[1];
    assert.ok(key, run.stdout);
    assert.match(run.stdout, /[▀▄█]/, 'dibuja el QR en la terminal');
    assert.equal((await loginTotp(`elena.vasconcelos${D}`, totp(key))).r.status, 200);
    const wrong = spawnSync(process.execPath, [SERVER, 'autenticador', 'nadie@ejemplo.cl'],
      { cwd: ROOT, env: { PATH: process.env.PATH, ...SECRET_ENV, ...dbEnv }, encoding: 'utf8', timeout: 30_000 });
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /No hay una persona activa/);
  });
});
