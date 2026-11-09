#!/usr/bin/env node
// =============================================================================
// Restaura un respaldo de RiskGuard Pro (con la aplicación DETENIDA).
//
//   SQLite:      node scripts/restaurar.mjs backups/riskguard-20261109-020000.db [--destino data/riskguard.db]
//   PostgreSQL:  DATABASE_URL=postgres://... node scripts/restaurar.mjs backups/riskguard-20261109-020000.dump
//
// Antes de restaurar comprueba el SHA-256 contra el manifiesto (.json) y que el archivo sea legible.
// SQLite: la base actual se conserva como <base>.antes-de-restaurar-<fecha>.
// PostgreSQL: usa pg_restore --clean --if-exists (reemplaza los objetos del respaldo en la base indicada).
// --verificar solo comprueba el respaldo, sin restaurar.
// =============================================================================
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const flag = name => args.includes(`--${name}`);
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const fail = msg => { console.error(`✗ ${msg}`); process.exit(1); };

if (!file) fail('Indica el archivo de respaldo (.db o .dump). Ver el encabezado de este script.');
const path = resolve(file);
if (!existsSync(path)) fail(`No existe ${path}`);

const sha = createHash('sha256').update(readFileSync(path)).digest('hex');
const manifestPath = `${path}.json`;
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (m.sha256 !== sha) fail('El SHA-256 no coincide con el manifiesto: el respaldo fue modificado o está dañado.');
  console.log(`✓ SHA-256 coincide con el manifiesto (${m.engine}, ${m.createdAt}, ${JSON.stringify(m.counts)})`);
} else {
  console.warn('! Sin manifiesto .json: no se puede comprobar el SHA-256 original.');
}

if (path.endsWith('.db')) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  const check = db.prepare('PRAGMA integrity_check').get().integrity_check;
  const blocks = db.prepare('SELECT count(*) AS n FROM crypto_audit_ledger').get().n;
  db.close();
  if (check !== 'ok') fail(`SQLite: ${check}`);
  console.log(`✓ Integridad de SQLite correcta (${blocks} bloques de bitácora).`);
  if (flag('verificar')) process.exit(0);
  const dest = resolve(opt('destino') || process.env.SQLITE_PATH || 'data/riskguard.db');
  if (existsSync(dest)) {
    const keep = `${dest}.antes-de-restaurar-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(dest, keep);
    for (const s of ['-wal', '-shm']) if (existsSync(dest + s)) renameSync(dest + s, keep + s);
    console.log(`  Base anterior guardada en ${keep}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(path, dest);
  console.log(`✓ Restaurado en ${dest}. Inicie la aplicación.`);
} else if (path.endsWith('.dump')) {
  const restore = process.env.PG_RESTORE_PATH || 'pg_restore';
  execFileSync(restore, ['--list', path], { stdio: 'ignore' });
  console.log('✓ pg_restore puede leer el respaldo.');
  if (flag('verificar')) process.exit(0);
  const url = process.env.DATABASE_URL;
  if (!url) fail('Defina DATABASE_URL con la base de destino.');
  execFileSync(restore, ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--dbname', url, path], { stdio: 'inherit' });
  console.log('✓ Restaurado en PostgreSQL. Inicie la aplicación.');
} else {
  fail('Formato no reconocido (se espera .db o .dump).');
}
