// Pruebas funcionales de la API: salud, carga de datos, permisos por módulo, edición simultánea,
// carga masiva y gestión de crisis.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';

let srv, elena, sofia, carlos;
before(async () => {
  srv = await startServer();
  [elena, sofia, carlos] = [await srv.login('elena.vasconcelos'), await srv.login('sofia.valenzuela'), await srv.login('carlos.mendoza')];
});
after(() => srv?.stop());

const put = (s, entity, obj, base) =>
  s.call('PUT', `/api/data/${entity}/${encodeURIComponent(obj.id)}`, obj, base === undefined ? {} : { 'X-Base-Version': String(base) });

describe('Servicio', () => {
  test('/api/health y /api/ready', async () => {
    const h = await srv.anon().call('GET', '/api/health');
    assert.equal(h.status, 200);
    assert.equal(h.body.status, 'ok');
    const r = await srv.anon().call('GET', '/api/ready');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ready');
  });

  test('carga inicial con datos de ejemplo, CLP y bitácora íntegra', async () => {
    const { status, body: d } = await elena.call('GET', '/api/data');
    assert.equal(status, 200);
    assert.equal(d.mode, 'database');
    assert.ok(d.risks.length > 0 && d.controls.length > 0 && d.users.length > 0);
    assert.equal(d.settings.general_parameters.currency, 'CLP');
    assert.ok(d.ledger.length >= 3);
  });
});

describe('Edición simultánea (versiones)', () => {
  test('guardar con versión vieja → 409 con la versión vigente', async () => {
    const d = (await elena.call('GET', '/api/data')).body;
    const ctl = d.controls[0];
    const v = d.versions.controls[ctl.id];
    let r = await put(elena, 'controls', { ...ctl, owner: 'Elena edita' }, v);
    assert.equal(r.status, 200);
    assert.equal(r.body.version, v + 1);
    r = await put(sofia, 'controls', { ...ctl, owner: 'Sofía edita' }, v);
    assert.equal(r.status, 409);
    assert.equal(r.body.conflict.current.owner, 'Elena edita');
    assert.equal(r.body.conflict.version, v + 1);
    r = await put(sofia, 'controls', { ...ctl, owner: 'Sofía sobre la nueva' }, v + 1);
    assert.equal(r.status, 200);
  });

  test('carrera de 6 guardados sobre la misma versión: solo uno gana', async () => {
    const d = (await elena.call('GET', '/api/data')).body;
    const ctl = d.controls[1];
    const v = d.versions.controls[ctl.id];
    const res = await Promise.all([...Array(6)].map((_, i) => put(i % 2 ? elena : sofia, 'controls', { ...ctl, owner: `carrera ${i}` }, v)));
    assert.deepEqual(res.map(r => r.status).sort(), [200, 409, 409, 409, 409, 409]);
  });
});

describe('Permisos por módulo', () => {
  test('un cargo operativo no puede cambiar parámetros ni la matriz de aprobaciones', async () => {
    const d = (await carlos.call('GET', '/api/data')).body;
    const r = await carlos.call('PUT', '/api/settings/general_parameters', d.settings.general_parameters);
    assert.equal(r.status, 403);
  });

  test('administración sí puede', async () => {
    const d = (await elena.call('GET', '/api/data')).body;
    const r = await elena.call('PUT', '/api/settings/general_parameters', d.settings.general_parameters);
    assert.equal(r.status, 200);
  });
});

describe('Carga masiva', () => {
  const ctl = (procs, i, o = {}) => ({
    id: `ctr-test-${i}`, code: `CTR-T${i}`, name: `Control de prueba ${i}`, description: '', process: procs[0], type: 'Preventivo',
    automation: 'Manual', frequency: 'Mensual', designEffectiveness: 90, operatingEffectiveness: 80, totalEffectiveness: 84,
    status: 'Parcialmente Efectivo', owner: 'X', lastTested: '2026-11-01', sampleDetails: 'Carga', evidence: 'e', attachments: [], testHistory: [], ...o,
  });

  test('sin permiso → 403; validación; todo o nada; alta y bitácora', async () => {
    const d = (await elena.call('GET', '/api/data')).body;
    const procs = d.processes.map(p => p.name);
    assert.equal((await carlos.call('POST', '/api/import/users', { records: [], fileName: 'x.xlsx' })).status, 403);
    let r = await elena.call('POST', '/api/import/controls', { records: [ctl(procs, 1), ctl(procs, 2, { type: 'Mágico' })], fileName: 'x.xlsx' });
    assert.equal(r.status, 400);
    r = await elena.call('POST', '/api/import/controls', { records: [ctl(procs, 1), ctl(procs, 2, { code: d.controls[0].code })], fileName: 'x.xlsx' });
    assert.equal(r.status, 422);
    assert.equal((await elena.call('GET', '/api/data')).body.controls.length, d.controls.length, 'nada se guardó');
    r = await elena.call('POST', '/api/import/controls', { records: [ctl(procs, 1), ctl(procs, 2)], fileName: 'controles.xlsx' });
    assert.equal(r.status, 200);
    assert.equal(r.body.created, 2);
    assert.equal(r.body.ledger.action, 'CARGA_MASIVA');
  });
});

describe('Gestión de crisis', () => {
  const now = '2026-11-06T15:00:00.000Z';
  const crisis = by => ({
    id: 'cri-test-1', code: 'CR-2026-090', title: 'Caída del core', mode: 'Real', level: 2, status: 'Activa', scenarioId: 'esc-01',
    declaredAt: now, declaredBy: by, affectedProcessIds: [], activatedPlanIds: [],
    log: [{ id: 'l1', at: now, by, kind: 'Estado', text: 'Crisis declarada' }], tasks: [], communications: [], createdBy: by, createdAt: now,
  });

  test('solo el comité declara; la bitácora de la crisis no se reescribe', async () => {
    const andres = await srv.login('andres.fuentes');
    let r = await put(andres, 'crisis-events', crisis('Andrés Fuentes'));
    assert.equal(r.status, 403);
    r = await put(elena, 'crisis-events', crisis('Dra. Elena Vasconcelos'));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const c = crisis('Dra. Elena Vasconcelos');
    r = await put(elena, 'crisis-events', { ...c, log: [{ ...c.log[0], text: 'editado' }] });
    assert.equal(r.status, 403);
  });
});
