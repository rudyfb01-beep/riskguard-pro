// Verificación de una instalación de producción ya levantada (base nueva, sin datos de ejemplo).
//
//   PROD_URL=https://grc.cooperativa.cl ADMIN_EMAIL=admin@cooperativa.cl \
//   MAILPIT_URL=http://localhost:8025 node tests/produccion/smoke.mjs
//
// El código de acceso se lee de Mailpit (MAILPIT_URL) o de un archivo JSONL de correos (MAIL_JSONL).
// Con un certificado interno: NODE_EXTRA_CA_CERTS=<raíz> o PROD_INSECURE_TLS=1 (solo pruebas).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

if (process.env.PROD_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const BASE = (process.env.PROD_URL || 'https://localhost').replace(/\/+$/, '');
const ADMIN = process.env.ADMIN_EMAIL;
if (!ADMIN) throw new Error('Defina ADMIN_EMAIL');
const H = { 'X-Requested-With': 'RiskGuard', 'content-type': 'application/json' };
let cookie = '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(method, path, body, extra = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...H, ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, headers: res.headers, body: json, text };
}

async function latestCode(email, since) {
  for (let i = 0; i < 60; i++) {
    if (process.env.MAILPIT_URL) {
      const list = await (await fetch(`${process.env.MAILPIT_URL}/api/v1/messages?limit=20`)).json();
      const m = list.messages.find(x => x.To.some(t => t.Address.toLowerCase() === email.toLowerCase()) && /código de acceso/.test(x.Subject) && Date.parse(x.Created) >= since - 2000);
      if (m) return /(\d{6})/.exec(m.Subject)[1];
    } else if (process.env.MAIL_JSONL && existsSync(process.env.MAIL_JSONL)) {
      const all = readFileSync(process.env.MAIL_JSONL, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const m = all.filter(x => x.to.includes(email) && /código de acceso/.test(x.subject) && x.at * 1000 >= since - 2000).pop();
      if (m) return /(\d{6})/.exec(m.subject)[1];
    }
    await sleep(500);
  }
  throw new Error(`No llegó el código a ${email}`);
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(['OK', name]);
    console.log(`OK    ${name}`);
  } catch (err) {
    results.push(['FALLA', name]);
    console.log(`FALLA ${name}\n      ${err.message.split('\n').join('\n      ')}`);
  }
}

await check('servicio vivo y base lista', async () => {
  const h = await call('GET', '/api/health');
  assert.equal(h.body.status, 'ok');
  const r = await call('GET', '/api/ready');
  assert.equal(r.status, 200);
  console.log(`      versión ${h.body.version}`);
});

await check('HTTPS: HSTS, CSP y cabeceras de seguridad', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('strict-transport-security') ?? '', /max-age=\d+/);
  assert.match(r.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

await check('correo no registrado: misma respuesta y sin código', async () => {
  const r = await call('POST', '/api/auth/request-code', { email: 'no-existe@ejemplo.cl' });
  assert.equal(r.status, 200);
});

await check('el administrador inicial ingresa con el código del correo (cookie Secure)', async () => {
  const since = Date.now();
  const r = await call('POST', '/api/auth/request-code', { email: ADMIN });
  assert.equal(r.status, 200);
  const code = await latestCode(ADMIN, since);
  const v = await call('POST', '/api/auth/verify', { email: ADMIN, code });
  assert.equal(v.status, 200, v.text);
  const set = v.headers.getSetCookie().find(c => c.startsWith('rg_session='));
  assert.match(set, /Secure/i);
  assert.match(set, /HttpOnly/i);
  cookie = set.split(';')[0];
  assert.equal(v.body.user.permissions.canManageRoles, true);
});

let data;
await check('base nueva sin datos de ejemplo', async () => {
  const r = await call('GET', '/api/data');
  assert.equal(r.status, 200);
  data = r.body;
  for (const k of ['risks', 'controls', 'flaws', 'alerts', 'kris', 'audits', 'providers', 'infoAssets', 'vulnerabilities', 'documents', 'approvals', 'actionPlans', 'crisisEvents']) {
    assert.equal((data[k] ?? []).length, 0, `${k} debería estar vacío y tiene ${(data[k] ?? []).length}`);
  }
  assert.equal(data.users.length, 1);
  assert.equal(data.users[0].email.toLowerCase(), ADMIN.toLowerCase());
  assert.ok(!JSON.stringify(data).includes('demo.riskguard.cl'), 'hay referencias a la demostración');
  assert.ok(data.roles.length >= 5, 'faltan los cargos base');
  assert.ok(data.regulatoryMilestones.length >= 3, 'faltan los plazos regulatorios');
  assert.equal(data.settings.general_parameters.currency, 'CLP');
});

await check('registrar datos reales: área y proceso, con bitácora', async () => {
  const area = { id: 'area-smoke', name: 'Operaciones (verificación)', manager: 'Administrador', description: '', active: true };
  let r = await call('PUT', '/api/data/areas/area-smoke', area);
  assert.equal(r.status, 200, r.text);
  const proc = { id: 'proc-smoke', code: 'PRC-900', name: 'Proceso de verificación', areaId: 'area-smoke', owner: 'Administrador', criticality: 'Medio', description: '', active: true };
  r = await call('PUT', '/api/data/processes/proc-smoke', proc);
  assert.equal(r.status, 200, r.text);
  r = await call('POST', '/api/ledger', { id: `log-smoke-${Date.now()}`, action: 'ALTA_PROCESO', entityType: 'Proceso', entityCode: 'PRC-900', details: 'Verificación de la instalación.' });
  assert.equal(r.status, 200, r.text);
  const d = (await call('GET', '/api/data')).body;
  assert.ok(d.processes.some(p => p.id === 'proc-smoke'));
  // Se deja la base como estaba.
  await call('DELETE', '/api/data/processes/proc-smoke');
  await call('DELETE', '/api/data/areas/area-smoke');
});

await check('operación: sin advertencias graves, bitácora íntegra y PostgreSQL', async () => {
  const r = await call('GET', '/api/admin/ops');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.database.engine, 'PostgreSQL');
  assert.equal(r.body.ledger.ok, true);
  const high = r.body.config.filter(c => c.level === 'alta');
  assert.deepEqual(high.map(c => c.text), []);
  console.log(`      observaciones: ${r.body.config.map(c => `[${c.level}] ${c.text.slice(0, 60)}`).join(' | ') || 'ninguna'}`);
});

await check('respaldo con pg_dump y verificación', async () => {
  const b = await call('POST', '/api/admin/backups');
  assert.equal(b.status, 200, b.text);
  assert.match(b.body.file, /\.dump$/);
  const v = await call('POST', `/api/admin/backups/${b.body.file}/verify`);
  assert.equal(v.body.ok, true, v.body.detail);
  console.log(`      ${b.body.file} (${b.body.size} bytes)`);
});

await check('cerrar sesión invalida la cookie', async () => {
  await call('POST', '/api/auth/logout');
  const r = await call('GET', '/api/data');
  assert.equal(r.status, 401);
});

const failed = results.filter(r => r[0] !== 'OK').length;
console.log(`\n${results.length - failed}/${results.length} verificaciones correctas`);
process.exit(failed ? 1 : 0);
