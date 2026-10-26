// Copia consistente de la base SQLite (funciona con la aplicación abierta).
const { DatabaseSync } = require('node:sqlite');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const root = __dirname;
let dbPath = join(root, 'data', 'riskguard.db');
try {
  const m = readFileSync(join(root, 'configuracion.env'), 'utf8').match(/^SQLITE_PATH=(.+)$/m);
  if (m && m[1].trim()) dbPath = resolve(root, m[1].trim());
} catch { /* sin configuración: ruta por defecto */ }

if (!existsSync(dbPath)) {
  console.error(`No se encontró la base de datos en ${dbPath}. Inicia la aplicación al menos una vez.`);
  process.exit(1);
}
const dir = join(root, 'respaldos');
mkdirSync(dir, { recursive: true });
const p = (n) => String(n).padStart(2, '0');
const d = new Date();
const file = join(dir, `riskguard-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`);
const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
db.close();
console.log(`Respaldo creado: ${file}`);
console.log('Para restaurarlo: detén la aplicación, reemplaza data/riskguard.db por el respaldo (con ese mismo nombre) y borra data/riskguard.db-wal y data/riskguard.db-shm si existen.');
