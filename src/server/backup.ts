import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { dialect, getDbConfig, getPool, getSqlitePath, getSqlitePool } from './db';
import { appendLedger, getSetting, setInternalSetting } from './repository';

const run = promisify(execFile);

/**
 * Respaldos de la base de datos:
 * - SQLite: copia consistente con la API de respaldo de SQLite (archivo .db listo para usar).
 * - PostgreSQL: pg_dump en formato personalizado (.dump), que se restaura con pg_restore.
 * Cada respaldo deja un manifiesto .json con su SHA-256, tamaño y conteos, y se conservan los últimos BACKUP_KEEP.
 */

export interface BackupManifest {
  file: string;
  engine: 'SQLite' | 'PostgreSQL';
  createdAt: string;
  trigger: 'programado' | 'manual';
  size: number;
  sha256: string;
  durationMs: number;
  counts: Record<string, number>;
  appVersion: string;
}

export interface BackupStatus {
  ok: boolean;
  at: string;
  file?: string;
  size?: number;
  error?: string;
}

const NAME_RE = /^riskguard-\d{8}-\d{6}\.(db|dump)$/;

export const backupIntervalHours = () => Math.max(0, Number(process.env['BACKUP_INTERVAL_HOURS'] ?? 24));
export const backupKeep = () => Math.max(1, Math.round(Number(process.env['BACKUP_KEEP'] ?? 14)));
export const appVersion = () => process.env['APP_VERSION'] || process.env['npm_package_version'] || 'dev';

/** Carpeta de respaldos: BACKUP_DIR o, por defecto, "backups" junto a la base SQLite o a la aplicación. */
export function backupDir(): string {
  if (process.env['BACKUP_DIR']) return resolve(process.env['BACKUP_DIR']);
  return dialect() === 'sqlite' ? join(dirname(getSqlitePath()), 'backups') : resolve(process.cwd(), 'backups');
}

export const isBackupName = (f: string) => NAME_RE.test(f);

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function sha256File(file: string): Promise<string> {
  return new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', c => h.update(c)).on('end', () => ok(h.digest('hex'))).on('error', fail);
  });
}

/** Cadena de conexión para pg_dump (DATABASE_URL o las variables POSTGRES_*). */
function pgConnection(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  const c = getDbConfig();
  if (!c) throw new Error('No hay configuración de PostgreSQL.');
  const u = encodeURIComponent(String(c.user ?? 'postgres')), pw = encodeURIComponent(String(c.password ?? ''));
  return `postgres://${u}:${pw}@${c.host}:${c.port}/${c.database}`;
}

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ['risks', 'controls', 'operational_flaws', 'user_profiles', 'evidence_files', 'crypto_audit_ledger']) {
    try {
      out[t] = Number((await getPool()!.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
    } catch { /* tabla ausente */ }
  }
  return out;
}

let running: Promise<BackupManifest> | null = null;

/** Crea un respaldo ahora (si ya hay uno en curso, devuelve ese). */
export function runBackup(trigger: BackupManifest['trigger'], actor?: { name: string; role: string }, ip = 'servidor'): Promise<BackupManifest> {
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    const at = new Date();
    try {
      if (!getPool()) throw new Error('No hay base de datos configurada.');
      const dir = backupDir();
      mkdirSync(dir, { recursive: true });
      const engine = dialect() === 'sqlite' ? 'SQLite' : 'PostgreSQL';
      const file = join(dir, `riskguard-${stamp(at)}.${engine === 'SQLite' ? 'db' : 'dump'}`);
      if (engine === 'SQLite') {
        await getSqlitePool()!.backupTo(file);
        // Archivo autocontenido (sin -wal/-shm), listo para copiar o restaurar.
        const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
        const copy = new DatabaseSync(file);
        copy.exec('PRAGMA journal_mode = DELETE');
        copy.close();
      } else {
        await run(process.env['PG_DUMP_PATH'] || 'pg_dump',
          ['--format=custom', '--no-owner', '--no-privileges', '--compress=6', '--file', file, '--dbname', pgConnection()],
          { timeout: 30 * 60_000, maxBuffer: 10 * 1024 * 1024 });
      }
      const manifest: BackupManifest = {
        file: basename(file), engine, createdAt: at.toISOString(), trigger, size: statSync(file).size, sha256: await sha256File(file),
        durationMs: Date.now() - started, counts: await counts(), appVersion: appVersion(),
      };
      writeFileSync(`${file}.json`, JSON.stringify(manifest, null, 2));
      pruneBackups(dir);
      await setInternalSetting('backup_last', { ok: true, at: manifest.createdAt, file: manifest.file, size: manifest.size } satisfies BackupStatus);
      await appendLedger({
        id: `log-backup-${Date.now()}`, userName: actor?.name ?? 'Sistema', userRole: actor?.role ?? 'Respaldo programado', action: 'RESPALDO_BASE',
        entityType: 'Sistema', entityCode: manifest.file,
        details: `Respaldo ${trigger} de ${engine}: ${manifest.file} (${(manifest.size / 1048576).toFixed(1)} MB, SHA-256 ${manifest.sha256.slice(0, 16)}…).`,
      }, ip);
      console.log(`[Respaldo] ${manifest.file} (${manifest.size} bytes) en ${manifest.durationMs} ms.`);
      return manifest;
    } catch (err) {
      const msg = (err as Error).message.replace(/postgres(ql)?:\/\/[^@\s]*@/gi, 'postgres://***@');
      await setInternalSetting('backup_last', { ok: false, at: at.toISOString(), error: msg } satisfies BackupStatus).catch(() => undefined);
      console.error(`[Respaldo] Error: ${msg}`);
      throw new Error(msg);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Deja solo los BACKUP_KEEP respaldos más recientes (con su manifiesto). */
export function pruneBackups(dir = backupDir()): string[] {
  const files = existsSync(dir) ? readdirSync(dir).filter(isBackupName).sort().reverse() : [];
  const removed = files.slice(backupKeep());
  for (const f of removed) {
    for (const p of [join(dir, f), join(dir, `${f}.json`), join(dir, `${f}-wal`), join(dir, `${f}-shm`)]) if (existsSync(p)) unlinkSync(p);
  }
  return removed;
}

/** Respaldos disponibles, del más reciente al más antiguo. */
export function listBackups(): (BackupManifest | { file: string; size: number; createdAt: string })[] {
  const dir = backupDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(isBackupName).sort().reverse().map(f => {
    const m = join(dir, `${f}.json`);
    if (existsSync(m)) {
      try { return JSON.parse(readFileSync(m, 'utf8')) as BackupManifest; } catch { /* manifiesto dañado */ }
    }
    const st = statSync(join(dir, f));
    return { file: f, size: st.size, createdAt: st.mtime.toISOString() };
  });
}

/** Comprueba que el archivo esté íntegro (SHA-256 del manifiesto) y sea legible por su motor. */
export async function verifyBackup(file: string): Promise<{ ok: boolean; detail: string }> {
  if (!isBackupName(file)) return { ok: false, detail: 'Nombre de respaldo no válido.' };
  const path = join(backupDir(), file);
  if (!existsSync(path)) return { ok: false, detail: 'El respaldo no existe.' };
  const manifestPath = `${path}.json`;
  const sha = await sha256File(path);
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;
    if (m.sha256 !== sha) return { ok: false, detail: 'El SHA-256 no coincide con el del manifiesto: el archivo fue modificado o está dañado.' };
  }
  try {
    if (file.endsWith('.db')) {
      const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        const r = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
        const n = db.prepare('SELECT count(*) AS n FROM crypto_audit_ledger').get() as { n: number };
        if (r.integrity_check !== 'ok') return { ok: false, detail: `SQLite: ${r.integrity_check}` };
        return { ok: true, detail: `Íntegro (SHA-256 y verificación de SQLite); ${n.n} bloques de bitácora.` };
      } finally {
        db.close();
      }
    }
    const { stdout } = await run(process.env['PG_RESTORE_PATH'] || 'pg_restore', ['--list', path], { maxBuffer: 50 * 1024 * 1024 });
    const tables = stdout.split('\n').filter(l => / TABLE DATA /.test(l)).length;
    return { ok: true, detail: `Íntegro (SHA-256 y catálogo de pg_restore); ${tables} tablas con datos.` };
  } catch (err) {
    return { ok: false, detail: `No se pudo leer el respaldo: ${(err as Error).message}` };
  }
}

export const backupPath = (file: string) => (isBackupName(file) ? join(backupDir(), file) : null);

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Respaldo programado cada BACKUP_INTERVAL_HOURS (24 por defecto; 0 lo desactiva). Al iniciar,
 * si el último respaldo es más antiguo que el intervalo, se hace uno a los pocos minutos.
 */
export function startBackupScheduler(ready: () => Promise<unknown>): void {
  const hours = backupIntervalHours();
  if (!getPool() || timer || !(hours > 0)) return;
  const tick = async () => {
    try {
      await ready();
      const last = (await getSetting('backup_last')) as BackupStatus | undefined;
      const due = !last?.ok || Date.now() - new Date(last.at).getTime() >= hours * 3_600_000 - 60_000;
      if (due) await runBackup('programado');
    } catch {
      // Ya registrado en backup_last y en el log.
    }
  };
  setTimeout(tick, Number(process.env['BACKUP_FIRST_DELAY_SECONDS'] ?? 120) * 1000).unref();
  timer = setInterval(tick, Math.min(hours, 1) * 3_600_000);
  timer.unref();
}
