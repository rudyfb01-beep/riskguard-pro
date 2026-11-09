// Alertas de KRI: canales de aviso (webhook y SMS) con envíos reales a un receptor local,
// pruebas de canal y protección contra webhooks a la red interna.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { startServer } from './helpers.mjs';

const received = [];
let receiver, rport, srv, elena, carlos;

before(async () => {
  receiver = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      received.push({ path: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      res.writeHead(req.url === '/falla' ? 500 : 200).end('ok');
    });
  });
  await new Promise(r => receiver.listen(0, '127.0.0.1', r));
  rport = receiver.address().port;
  srv = await startServer({
    WEBHOOK_ALLOW_HTTP: 'true', WEBHOOK_ALLOW_PRIVATE: 'true',
    SMS_GATEWAY_URL: `http://127.0.0.1:${rport}/sms`, SMS_GATEWAY_TOKEN: 'secreto-sms',
  });
  elena = await srv.login('elena.vasconcelos');
  carlos = await srv.login('andres.fuentes'); // comité: sin permiso para configurar KRIs
});
after(async () => {
  await srv?.stop();
  receiver?.close();
});

const waitFor = async (pred, ms = 5000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 100))) if (pred()) return true;
  return false;
};

describe('Canales de aviso de KRIs', () => {
  test('informa los canales disponibles', async () => {
    const r = await elena.call('GET', '/api/notifications/channels');
    assert.deepEqual(r.body, { email: false, sms: true, webhook: true });
  });

  test('prueba de webhook y SMS: envíos reales y registro en la bitácora', async () => {
    received.length = 0;
    let r = await elena.call('POST', '/api/notifications/kri-test', { channel: 'webhook', to: `http://127.0.0.1:${rport}/hook`, kriCode: 'KRI-T1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await elena.call('POST', '/api/notifications/kri-test', { channel: 'sms', to: '+56 9 1234 5678', kriCode: 'KRI-T1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const hook = received.find(x => x.path === '/hook');
    const sms = received.find(x => x.path === '/sms');
    assert.equal(hook.body.type, 'prueba');
    assert.equal(sms.body.to, '+56912345678');
    assert.equal(sms.auth, 'Bearer secreto-sms');
    assert.match(sms.body.message, /\[PRUEBA\]/);
    const d = (await elena.call('GET', '/api/data')).body;
    assert.ok(d.ledger.some(e => /Envío de prueba por WEBHOOK/.test(e.details)));
  });

  test('prueba fallida: informa el error (no un éxito simulado)', async () => {
    let r = await elena.call('POST', '/api/notifications/kri-test', { channel: 'webhook', to: `http://127.0.0.1:${rport}/falla` });
    assert.equal(r.status, 502);
    assert.match(r.body.error, /500/);
    r = await elena.call('POST', '/api/notifications/kri-test', { channel: 'email', to: 'alguien@ejemplo.cl' });
    assert.equal(r.status, 502);
    assert.match(r.body.error, /SMTP/);
  });

  test('sin permiso para configurar KRIs → 403', async () => {
    const r = await carlos.call('POST', '/api/notifications/kri-test', { channel: 'webhook', to: `http://127.0.0.1:${rport}/hook` });
    assert.equal(r.status, 403);
  });

  test('una alerta nueva del KRI se envía por webhook y SMS según sus preferencias', async () => {
    received.length = 0;
    const d = (await elena.call('GET', '/api/data')).body;
    const kri = d.kris[0];
    const prefs = {
      emailEnabled: false, emailRecipients: [], emailTemplate: 'completa', smsEnabled: true, smsRecipients: ['+56 9 8765 4321'],
      webhookEnabled: true, webhookUrl: `http://127.0.0.1:${rport}/alertas`, notifyOnWarning: true, notifyOnCritical: true, cooldownMinutes: 0, escalateToRiskOfficer: false,
    };
    let r = await elena.call('PUT', `/api/data/kris/${kri.id}`, { ...kri, notificationPreferences: prefs });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const alert = {
      id: 'alt-test-1', code: 'ALT-901', title: `KRI Excedido Crítico: ${kri.name}`, description: 'Lectura de prueba', kriMetric: kri.name,
      threshold: '>= 10 %', currentValue: '15 %', severity: 'Crítico', process: kri.process, triggeredAt: '2026-11-09 10:00', status: 'Activa', escalatedTo: kri.responsible,
    };
    r = await elena.call('PUT', '/api/data/alerts/alt-test-1', alert);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(await waitFor(() => received.some(x => x.path === '/alertas') && received.some(x => x.path === '/sms')), 'no llegaron los envíos');
    const hook = received.find(x => x.path === '/alertas').body;
    assert.equal(hook.code, 'ALT-901');
    assert.equal(hook.severity, 'Crítico');
    assert.equal(received.find(x => x.path === '/sms').body.to, '+56987654321');
    // Actualizar la alerta (cambio de estado) no vuelve a enviarla.
    received.length = 0;
    await elena.call('PUT', '/api/data/alerts/alt-test-1', { ...alert, status: 'En Investigación' });
    await new Promise(r2 => setTimeout(r2, 800));
    assert.equal(received.length, 0);
  });
});

describe('Webhook a la red interna (SSRF)', () => {
  test('sin WEBHOOK_ALLOW_PRIVATE se rechaza localhost y http', async () => {
    const s2 = await startServer();
    try {
      const u = await s2.login('elena.vasconcelos');
      let r = await u.call('POST', '/api/notifications/kri-test', { channel: 'webhook', to: `https://127.0.0.1:${rport}/x` });
      assert.equal(r.status, 502);
      assert.match(r.body.error, /interna/);
      r = await u.call('POST', '/api/notifications/kri-test', { channel: 'webhook', to: 'http://example.org/x' });
      assert.match(r.body.error, /https/);
      r = await u.call('POST', '/api/notifications/kri-test', { channel: 'sms', to: '+56912345678' });
      assert.match(r.body.error, /SMS_GATEWAY_URL/);
    } finally {
      await s2.stop();
    }
  });
});
