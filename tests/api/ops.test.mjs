// Operación: respaldos (crear, verificar, descargar, retención), restauración con
// scripts/restaurar.mjs y detección de una copia alterada.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startServer } from './helpers.mjs';

const pg = !!process.env.TEST_DATABASE_URL;
let srv, admin;
before(async () => {
  srv = await startServer({ BACKUP_KEEP: '2' });
  admin = await srv.login('elena.vasconcelos');
});
after(() => srv?.stop());

const restore = (args, env = {}) => execFileSync(process.execPath, [join(ROOT, 'scripts/restaurar.mjs'), ...args], {
  cwd: srv.dir, env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'pipe',
});

describe('Respaldos', () => {
  let manifest;

  test('panel de operación: base, bitácora y revisión de la configuración', async () => {
    const r = await admin.call('GET', '/api/admin/ops');
    assert.equal(r.status, 200);
    assert.equal(r.body.database.engine, pg ? 'PostgreSQL' : 'SQLite');
    assert.equal(r.body.ledger.ok, true);
    assert.ok(r.body.config.some(c => /AUTH_DEV_LOG_CODES/.test(c.text)), 'advierte los códigos en el log');
  });

  test('crear, verificar y descargar con el mismo SHA-256', async () => {
    const r = await admin.call('POST', '/api/admin/backups');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    manifest = r.body;
    assert.match(manifest.file, pg ? /\.dump$/ : /\.db$/);
    assert.ok(manifest.counts.crypto_audit_ledger >= 3);
    const v = await admin.call('POST', `/api/admin/backups/${manifest.file}/verify`);
    assert.equal(v.body.ok, true, v.body.detail);
    const dl = await admin.fetch('GET', `/api/admin/backups/${manifest.file}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    assert.equal(createHash('sha256').update(buf).digest('hex'), manifest.sha256);
    const d = (await admin.call('GET', '/api/data')).body;
    assert.ok(d.ledger.some(e => e.action === 'RESPALDO_BASE'));
  });

  test('retención: se conservan los últimos BACKUP_KEEP', async () => {
    for (let i = 0; i < 2; i++) {
      await new Promise(r => setTimeout(r, 1100)); // nombres con segundos distintos
      assert.equal((await admin.call('POST', '/api/admin/backups')).status, 200);
    }
    const files = readdirSync(join(srv.dir, 'backups')).filter(f => /^riskguard-.*\.(db|dump)$/.test(f));
    assert.equal(files.length, 2);
  });

  test('restaurar.mjs verifica, restaura y rechaza una copia alterada', async () => {
    const last = (await admin.call('GET', '/api/admin/ops')).body.backups.list[0];
    const file = join(srv.dir, 'backups', last.file);
    assert.match(restore([file, '--verificar']), /SHA-256 coincide/);
    if (!pg) {
      const dest = join(srv.dir, 'restaurada', 'riskguard.db');
      assert.match(restore([file, '--destino', dest]), /Restaurado/);
      assert.ok(existsSync(dest));
      const s2 = await startServer({ SQLITE_PATH: dest, DB_CLIENT: 'sqlite', SEED_DEMO_DATA: 'false' });
      try {
        const u = await s2.login('elena.vasconcelos');
        const d = (await u.call('GET', '/api/data')).body;
        assert.equal(d.risks.length, last.counts.risks);
      } finally {
        await s2.stop();
      }
    }
    const tampered = join(srv.dir, 'alterado' + (pg ? '.dump' : '.db'));
    copyFileSync(file, tampered);
    copyFileSync(`${file}.json`, `${tampered}.json`);
    appendFileSync(tampered, 'x');
    assert.throws(() => restore([tampered, '--verificar']), /SHA-256 no coincide/);
  });
});
