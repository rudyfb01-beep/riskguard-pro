// Configuración de producción: la aplicación no arranca sin base de datos ni con opciones inseguras.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, SERVER } from './helpers.mjs';

function start(env) {
  const r = spawnSync(process.execPath, [SERVER], { cwd: ROOT, env: { PATH: process.env.PATH, PORT: '0', ...env }, encoding: 'utf8', timeout: 20_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('Validación de la configuración al arrancar', () => {
  test('sin base de datos (DB_CLIENT=none) no arranca', () => {
    const r = start({ DB_CLIENT: 'none' });
    assert.equal(r.code, 1);
    assert.match(r.out, /DB_CLIENT=none ya no se admite/);
  });

  test('producción con opciones inseguras: no arranca y explica cada problema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rg-cfg-'));
    try {
      const r = start({
        NODE_ENV: 'production', DB_CLIENT: 'sqlite', SQLITE_PATH: join(dir, 'x.db'),
        AUTH_DEV_LOG_CODES: 'true', SEED_DEMO_DATA: 'true', AUTH_SECRET: 'corto',
        DATABASE_URL: '', POSTGRES_PASSWORD: 'postgres',
      });
      assert.equal(r.code, 1);
      for (const t of [/AUTH_DEV_LOG_CODES=true/, /SEED_DEMO_DATA=true/, /AUTH_SECRET debe tener/, /Defina APP_URL/, /Configure SMTP_HOST/, /contraseña de PostgreSQL/]) {
        assert.match(r.out, t);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('producción bien configurada pero base nueva sin ADMIN_EMAIL: se detiene', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rg-cfg-'));
    try {
      const r = start({
        NODE_ENV: 'production', DB_CLIENT: 'sqlite', SQLITE_PATH: join(dir, 'x.db'), BACKUP_DIR: join(dir, 'b'),
        APP_URL: 'https://grc.ejemplo.cl', AUTH_SECRET: 'a'.repeat(64), SMTP_HOST: '127.0.0.1', UF_AUTO_SYNC: 'false',
      });
      assert.equal(r.code, 1);
      assert.match(r.out, /defina ADMIN_EMAIL/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
