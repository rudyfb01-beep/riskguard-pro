// Arma el paquete descargable con SQLite: release/riskguard-pro-sqlite/ y su .zip.
// Uso: npm run package:sqlite   (compila primero con ng build)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(import.meta.dirname, '..');
const name = 'riskguard-pro-sqlite';
const out = join(root, 'release', name);
const dist = join(root, 'dist', 'app');

if (!existsSync(join(dist, 'server', 'server.mjs'))) {
  console.error('Falta la compilación: ejecuta "npx ng build" antes de empaquetar.');
  process.exit(1);
}

rmSync(join(root, 'release'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(dist, join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'database'));
for (const f of ['schema.sqlite.sql', 'schema.sql']) cpSync(join(root, 'database', f), join(out, 'database', f));
mkdirSync(join(out, 'data'));
writeFileSync(join(out, 'data', 'LEEME.txt'), 'Aquí se guarda la base de datos (riskguard.db). No borres esta carpeta al actualizar.\r\n');

const pkg = join(root, 'packaging');
for (const f of readdirSync(pkg)) {
  const text = readFileSync(join(pkg, f), 'utf8');
  // Windows: los .bat, .env y .txt con fin de línea CRLF; los .sh con LF.
  const crlf = /\.(bat|env|txt)$/.test(f);
  writeFileSync(join(out, f), crlf ? text.replace(/\r?\n/g, '\r\n') : text, { mode: f.endsWith('.sh') ? 0o755 : 0o644 });
}
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
let commit = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim(); } catch { /* sin git */ }
writeFileSync(join(out, 'VERSION.txt'), `RiskGuard Pro ${version}${commit ? ` (${commit})` : ''}\r\nGenerado: ${new Date().toISOString()}\r\n`);

const zip = join(root, 'release', `${name}.zip`);
try {
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}' -DestinationPath '${zip}' -Force`]);
  } else {
    execFileSync('zip', ['-qr', '-X', zip, name], { cwd: join(root, 'release') });
  }
  console.log(`Paquete listo: ${zip}`);
} catch (err) {
  console.log(`Carpeta lista en ${out} (no se pudo crear el .zip: ${err.message})`);
}
