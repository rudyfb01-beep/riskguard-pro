// Pruebas de seguridad (OWASP ASVS / Top 10): cabeceras, sesión, CSRF, control de acceso,
// inyección, rutas, tamaño de solicitudes, errores y límites. Ver SECURITY.md.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, CSRF } from './helpers.mjs';

let srv, admin, ops;
before(async () => {
  srv = await startServer();
  admin = await srv.login('elena.vasconcelos');
  ops = await srv.login('carlos.mendoza');
});
after(() => srv?.stop());

describe('A05 Configuración: cabeceras de seguridad', () => {
  test('la página lleva CSP sin scripts en línea y protección contra marcos', async () => {
    const r = await srv.anon().fetch('GET', '/');
    assert.equal(r.status, 200);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-(inline|eval)/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('referrer-policy'), 'same-origin');
    assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
    assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.ok(r.headers.get('x-request-id'));
  });

  test('el HTML no contiene scripts ni manejadores en línea (compatibles con la CSP)', async () => {
    const html = await (await srv.anon().fetch('GET', '/')).text();
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = m[1];
      if (/type="application\/json"/.test(attrs)) continue;
      assert.match(attrs, /\bsrc=/, `script en línea: ${m[0].slice(0, 120)}`);
    }
    assert.doesNotMatch(html, /\son(load|error|click)=/i);
  });

  test('las respuestas de la API no se guardan en caché', async () => {
    const r = await admin.fetch('GET', '/api/data');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  test('sin HSTS sobre HTTP (se envía solo con HTTPS)', async () => {
    const r = await srv.anon().fetch('GET', '/api/health');
    assert.equal(r.headers.get('strict-transport-security'), null);
  });
});

describe('A07 Autenticación y sesión', () => {
  test('la cookie de sesión es HttpOnly y SameSite', async () => {
    const s = srv.anon();
    const mark = srv.log.length;
    await s.call('POST', '/api/auth/request-code', { email: 'sofia.valenzuela@demo.riskguard.cl' });
    const code = await srv.codeFor('sofia.valenzuela@demo.riskguard.cl', mark);
    const r = await s.fetch('POST', '/api/auth/verify', { body: { email: 'sofia.valenzuela@demo.riskguard.cl', code } });
    const cookie = r.headers.getSetCookie().find(c => c.startsWith('rg_session='));
    assert.ok(cookie, 'sin cookie de sesión');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=(Lax|Strict)/i);
  });

  test('un correo no registrado recibe la misma respuesta (no se enumeran usuarios)', async () => {
    const a = await srv.anon().call('POST', '/api/auth/request-code', { email: 'nadie@ejemplo.cl' });
    const b = await srv.anon().call('POST', '/api/auth/request-code', { email: 'carlos.mendoza@demo.riskguard.cl' });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, b.body);
  });

  test('código incorrecto: se rechaza y se bloquea tras 5 intentos', async () => {
    const s = srv.anon();
    const email = 'andres.fuentes@demo.riskguard.cl';
    const mark = srv.log.length;
    await s.call('POST', '/api/auth/request-code', { email });
    const good = await srv.codeFor(email, mark);
    const bad = good === '000000' ? '111111' : '000000';
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await s.call('POST', '/api/auth/verify', { email, code: bad })).status);
    assert.ok(statuses.every(x => x === 401 || x === 429), String(statuses));
    // El código correcto ya no sirve: quedó invalidado.
    assert.notEqual((await s.call('POST', '/api/auth/verify', { email, code: good })).status, 200);
  });

  test('sin sesión no hay datos; tras cerrar sesión el token deja de servir', async () => {
    assert.equal((await srv.anon().call('GET', '/api/data')).status, 401);
    const s = await srv.login('sofia.valenzuela');
    const stolen = s.cookieHeader;
    assert.equal((await s.call('GET', '/api/auth/me')).status, 200);
    await s.call('POST', '/api/auth/logout');
    const r = await fetch(`${srv.base}/api/auth/me`, { headers: { cookie: stolen } });
    assert.equal(r.status, 401);
  });

  test('un token inventado no da acceso', async () => {
    const r = await fetch(`${srv.base}/api/data`, { headers: { cookie: 'rg_session=' + 'a'.repeat(64) } });
    assert.equal(r.status, 401);
  });
});

describe('A01 Control de acceso', () => {
  test('CSRF: escribir sin la cabecera X-Requested-With → 403', async () => {
    const r = await admin.fetch('PUT', '/api/settings/risk_appetite', { body: {}, csrf: false });
    assert.equal(r.status, 403);
  });

  test('CSRF: escribir desde otro origen → 403', async () => {
    const r = await admin.fetch('POST', '/api/notifications/read', { body: { ids: [] }, headers: { origin: 'https://atacante.example' } });
    assert.equal(r.status, 403);
    const nul = await admin.fetch('POST', '/api/notifications/read', { body: { ids: [] }, headers: { origin: 'null' } });
    assert.equal(nul.status, 403);
    const same = await admin.fetch('POST', '/api/notifications/read', { body: { ids: [] }, headers: { origin: srv.base } });
    assert.notEqual(same.status, 403);
  });

  test('un cargo sin permiso no puede escalar privilegios (usuarios, cargos)', async () => {
    const d = (await ops.call('GET', '/api/data')).body;
    const me = d.users.find(u => u.email === 'carlos.mendoza@demo.riskguard.cl');
    const role = d.roles.find(r => r.id === me.roleId) ?? d.roles[0];
    assert.equal((await ops.call('PUT', `/api/data/users/${me.id}`, { ...me, roleId: 'role-admin' })).status, 403);
    const allPerms = Object.fromEntries(Object.keys(role.permissions ?? {}).map(k => [k, true]));
    assert.equal((await ops.call('PUT', `/api/data/roles/${role.id}`, { ...role, permissions: allPerms })).status, 403);
  });

  test('funciones de administración rechazadas para un cargo operativo', async () => {
    for (const [m, p] of [['GET', '/api/admin/ops'], ['POST', '/api/admin/backups'], ['POST', '/api/admin/uf-sync'], ['PUT', '/api/settings/approval_matrix'], ['GET', '/api/notifications/outbox']]) {
      const r = await ops.call(m, p, m === 'GET' ? undefined : {});
      assert.equal(r.status, 403, `${m} ${p} → ${r.status}`);
    }
  });

  test('IDOR: los avisos son solo los propios', async () => {
    const r = await ops.call('GET', '/api/notifications');
    assert.equal(r.status, 200);
    const items = Array.isArray(r.body) ? r.body : r.body.items ?? [];
    assert.ok(items.every(n => (n.recipientEmail ?? n.email ?? 'carlos.mendoza@demo.riskguard.cl') === 'carlos.mendoza@demo.riskguard.cl'));
  });

  test('salto de directorio en respaldos y evidencias → 404', async () => {
    for (const p of ['/api/admin/backups/..%2F..%2Fetc%2Fpasswd', '/api/admin/backups/riskguard.db', '/api/evidence/..%2F..%2Fpackage.json']) {
      const r = await admin.call('GET', p);
      assert.ok([400, 404].includes(r.status), `${p} → ${r.status}`);
      assert.doesNotMatch(r.text, /root:|"dependencies"/);
    }
  });
});

describe('A03 Inyección y validación de entrada', () => {
  test('inyección SQL en identificadores y textos no altera la base', async () => {
    const d = (await admin.call('GET', '/api/data')).body;
    const area = d.areas[0];
    const evil = "x'); DROP TABLE risks; --";
    let r = await admin.call('PUT', `/api/data/areas/${encodeURIComponent(evil)}`, { ...area, id: evil, name: evil });
    assert.ok([200, 400].includes(r.status), String(r.status));
    r = await admin.call('GET', '/api/data');
    assert.equal(r.status, 200);
    assert.equal(r.body.risks.length, d.risks.length);
    if (r.body.areas.some(a => a.id === evil)) {
      assert.equal(r.body.areas.find(a => a.id === evil).name, evil, 'se guarda como texto literal');
      await admin.call('DELETE', `/api/data/areas/${encodeURIComponent(evil)}`);
    }
  });

  test('entidad desconocida o cuerpo con otro id → 404/400', async () => {
    assert.equal((await admin.call('PUT', '/api/data/pg_catalog/x', { id: 'x' })).status, 404);
    assert.equal((await admin.call('PUT', '/api/data/areas/a1', { id: 'otro' })).status, 400);
  });

  test('evidencias: se rechazan HTML, SVG y ejecutables', async () => {
    const ctl = (await admin.call('GET', '/api/data')).body.controls[0].id;
    for (const [name, body] of [['x.html', '<html><script>alert(1)</script>'], ['x.svg', '<svg onload=alert(1)/>'], ['x.exe', 'MZ\x90\x00']]) {
      const r = await admin.fetch('POST', `/api/evidence?entityType=controls&entityId=${ctl}`, {
        raw: true, body: Buffer.from(body), headers: { 'content-type': 'application/octet-stream', 'x-file-name': name },
      });
      assert.equal(r.status, 415, `${name} → ${r.status}`);
    }
  });

  test('JSON mal formado → 400 sin detalles internos', async () => {
    const r = await admin.fetch('PUT', '/api/data/areas/a1', { raw: true, body: '{"id":', headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 400);
    const t = await r.text();
    assert.doesNotMatch(t, /at \w+ \(|node_modules|SyntaxError/);
    assert.ok(JSON.parse(t).requestId);
  });

  test('cuerpo demasiado grande → 413', async () => {
    const big = JSON.stringify({ id: 'a1', name: 'x'.repeat(16 * 1024 * 1024) });
    const r = await admin.fetch('PUT', '/api/data/areas/a1', { raw: true, body: big, headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 413);
  });

  test('ruta de API inexistente → 404 JSON (no se renderiza la aplicación)', async () => {
    const r = await admin.call('GET', '/api/no-existe');
    assert.equal(r.status, 404);
    assert.ok(r.body?.error);
  });
});

describe('A09 Registro: bitácora encadenada', () => {
  test('la cadena de la bitácora es íntegra', async () => {
    const r = await admin.call('GET', '/api/admin/ops');
    assert.equal(r.status, 200);
    assert.equal(r.body.ledger.ok, true);
  });
});

describe('Límite de solicitudes', () => {
  test('la API responde 429 al superar RATE_LIMIT_PER_MINUTE', async () => {
    const s2 = await startServer({ RATE_LIMIT_PER_MINUTE: '15' });
    try {
      const codes = [];
      for (let i = 0; i < 20; i++) codes.push((await fetch(`${s2.base}/api/auth/config`, { headers: CSRF })).status);
      assert.ok(codes.slice(0, 14).every(c => c === 200));
      assert.equal(codes.at(-1), 429);
      // Salud y disponibilidad quedan fuera del límite (monitoreo).
      assert.equal((await fetch(`${s2.base}/api/health`)).status, 200);
    } finally {
      await s2.stop();
    }
  });
});
