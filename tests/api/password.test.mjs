// Ingreso con correo y contraseña (AUTH_PASSWORD=true): contraseña temporal desde la consola o el
// administrador, cambio obligatorio, respuestas genéricas, bloqueo, cambio propio y permisos.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { D, ROOT, SERVER, Session, startServer } from './helpers.mjs';

const ENV = { AUTH_PASSWORD: 'true', AUTH_SECRET: 'p'.repeat(64) };
const ADMIN = `elena.vasconcelos${D}`;
const CARLOS = `carlos.mendoza${D}`;
let srv;

before(async () => { srv = await startServer(ENV); });
after(() => srv?.stop());

function cli(email) {
  const dbEnv = process.env.TEST_DATABASE_URL
    ? { DATABASE_URL: (() => { const u = new URL(process.env.TEST_DATABASE_URL); u.pathname = `/riskguard_test_${srv.port}`; return u.toString(); })() }
    : { DB_CLIENT: 'sqlite', SQLITE_PATH: join(srv.dir, 'riskguard.db') };
  return spawnSync(process.execPath, [SERVER, 'contrasena', email],
    { cwd: ROOT, env: { PATH: process.env.PATH, ...ENV, ...dbEnv }, encoding: 'utf8', timeout: 30_000 });
}

const login = (s, email, password) => s.call('POST', '/api/auth/password-login', { email, password });

/** Ingreso completo con temporal → cambio obligatorio → sesión. */
async function firstLogin(email, temp, nueva) {
  const s = new Session(srv.base);
  const r = await login(s, email, temp);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.mustChange, true);
  const c = await s.call('POST', '/api/auth/password-change', { ticket: r.body.ticket, newPassword: nueva });
  assert.equal(c.status, 200, c.text);
  return s;
}

let admin, adminPw = 'faro azul sobre el puerto 77', carlosId, carlosTemp, carlos;

describe('Ingreso con contraseña', () => {
  test('configuración pública: contraseña sí, código por correo no', async () => {
    const r = await srv.anon().call('GET', '/api/auth/config');
    assert.equal(r.body.password, true);
    assert.equal(r.body.emailCode, 'false');
    const code = await srv.anon().call('POST', '/api/auth/request-code', { email: ADMIN });
    assert.equal(code.status, 403);
  });

  test('consola del servidor: contraseña temporal para el primer administrador', async () => {
    const run = cli(ADMIN);
    assert.equal(run.status, 0, run.stderr);
    const temp = /\n {4}(\S{4}-\S{4}-\S{4})\n/.exec(run.stdout)?.[1];
    assert.ok(temp, run.stdout);
    assert.match(run.stdout, /Vence: /);

    const s = new Session(srv.base);
    const r = await login(s, ADMIN, temp);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.mustChange, true);
    assert.ok(r.body.ticket);
    assert.equal(s.cookies.size, 0, 'sin sesión hasta cambiarla');
    assert.equal((await s.call('GET', '/api/data')).status, 401);

    const weak = await s.call('POST', '/api/auth/password-change', { ticket: r.body.ticket, newPassword: 'corta' });
    assert.equal(weak.status, 400);
    assert.match(weak.body.error, /12 caracteres/);
    const same = await s.call('POST', '/api/auth/password-change', { ticket: r.body.ticket, newPassword: temp });
    assert.equal(same.status, 400);
    const mine = await s.call('POST', '/api/auth/password-change', { ticket: r.body.ticket, newPassword: 'vasconcelos-2026-abc' });
    assert.equal(mine.status, 400, 'no puede contener su correo o nombre');

    const ok = await s.call('POST', '/api/auth/password-change', { ticket: r.body.ticket, newPassword: adminPw });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.body.user.email, ADMIN);
    assert.equal((await s.call('GET', '/api/data')).status, 200);

    const reuse = await new Session(srv.base).call('POST', '/api/auth/password-change', { ticket: r.body.ticket, newPassword: 'otra frase bastante larga 9' });
    assert.equal(reuse.status, 401, 'el ticket sirve una sola vez');
    assert.equal((await login(new Session(srv.base), ADMIN, temp)).status, 401, 'la temporal ya no sirve');

    admin = new Session(srv.base);
    const again = await login(admin, ADMIN, adminPw);
    assert.equal(again.status, 200);
    assert.ok(again.body.user);
    carlosId = (await admin.call('GET', '/api/data')).body.users.find(u => u.email === CARLOS).id;
  });

  test('respuesta genérica: correo inexistente y contraseña incorrecta dicen lo mismo', async () => {
    const a = await login(srv.anon(), 'nadie@ejemplo.cl', 'cualquier cosa larga');
    const b = await login(srv.anon(), ADMIN, 'cualquier cosa larga');
    const c = await login(srv.anon(), CARLOS, 'cualquier cosa larga'); // sin contraseña asignada
    for (const r of [a, b, c]) {
      assert.equal(r.status, 401);
      assert.equal(r.body.error, 'Correo o contraseña incorrectos.');
    }
  });

  test('el administrador asigna una temporal: se muestra una vez y queda en la bitácora sin la contraseña', async () => {
    const r = await admin.call('POST', `/api/admin/users/${carlosId}/password`);
    assert.equal(r.status, 200, r.text);
    assert.match(r.body.password, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    carlosTemp = r.body.password;
    const st = await admin.call('GET', '/api/admin/passwords');
    assert.equal(st.body.enabled, true);
    assert.equal(st.body.users[carlosId].mustChange, true);
    assert.ok(st.body.users[carlosId].tempExpiresAt);
    assert.ok(!JSON.stringify(st.body).includes('scrypt'), 'nunca devuelve el hash');
    const ledger = (await admin.call('GET', '/api/data')).body.ledger;
    const entry = ledger.find(l => l.entityCode === carlosId && /Contraseña temporal asignada/.test(l.details));
    assert.ok(entry);
    assert.ok(!JSON.stringify(ledger).includes(carlosTemp));
  });

  test('propia cuenta y permisos', async () => {
    const own = await admin.call('POST', `/api/admin/users/${admin.user?.id ?? (await admin.call('GET', '/api/auth/me')).body.user.id}/password`);
    assert.equal(own.status, 400);
    carlos = await firstLogin(CARLOS, carlosTemp, 'mesa de roble con tres patas');
    assert.equal((await carlos.call('POST', `/api/admin/users/${carlosId}/password`)).status, 403);
    assert.equal((await carlos.call('GET', '/api/admin/passwords')).status, 403);
  });

  test('cambio propio: exige la actual y cierra las otras sesiones', async () => {
    const other = new Session(srv.base);
    assert.equal((await login(other, CARLOS, 'mesa de roble con tres patas')).status, 200);
    const bad = await carlos.call('POST', '/api/auth/password', { currentPassword: 'no es', newPassword: 'velero rojo en la bahía' });
    assert.equal(bad.status, 400);
    const ok = await carlos.call('POST', '/api/auth/password', { currentPassword: 'mesa de roble con tres patas', newPassword: 'velero rojo en la bahía' });
    assert.equal(ok.status, 200, ok.text);
    assert.equal((await carlos.call('GET', '/api/data')).status, 200, 'la sesión actual sigue');
    assert.equal((await other.call('GET', '/api/data')).status, 401, 'la otra sesión se cerró');
    assert.equal((await login(srv.anon(), CARLOS, 'mesa de roble con tres patas')).status, 401);
    assert.equal((await login(srv.anon(), CARLOS, 'velero rojo en la bahía')).status, 200);
    assert.equal((await srv.anon().call('POST', '/api/auth/password', { currentPassword: 'x', newPassword: 'y' })).status, 401);
  });

  test('5 intentos fallidos bloquean la cuenta; el administrador la desbloquea con una temporal', async () => {
    let last;
    for (let i = 0; i < 5; i++) last = await login(srv.anon(), CARLOS, `incorrecta numero ${i}`);
    assert.equal(last.status, 429);
    const locked = await login(srv.anon(), CARLOS, 'velero rojo en la bahía');
    assert.equal(locked.status, 429, 'bloqueada aunque la contraseña sea correcta');
    assert.match(locked.body.error, /bloqueada/);
    assert.equal((await admin.call('GET', '/api/admin/passwords')).body.users[carlosId].locked, true);

    const t = await admin.call('POST', `/api/admin/users/${carlosId}/password`);
    assert.equal(t.status, 200);
    assert.equal((await carlos.call('GET', '/api/data')).status, 401, 'restablecer cierra sus sesiones');
    const r = await login(srv.anon(), CARLOS, t.body.password);
    assert.equal(r.status, 200);
    assert.equal(r.body.mustChange, true);
  });

  test('comando del servidor con un correo desconocido', () => {
    const run = cli('nadie@ejemplo.cl');
    assert.equal(run.status, 1);
    assert.match(run.stderr, /No hay una persona activa/);
  });
});
