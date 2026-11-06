import { Pool, PoolConfig, types } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { createRequire } from 'node:module';

// Tipos devueltos como valores simples y estables para la aplicación:
// DATE como 'YYYY-MM-DD' (sin desfase horario), NUMERIC y BIGINT como number.
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(1700, (v: string) => parseFloat(v));
types.setTypeParser(20, (v: string) => parseInt(v, 10));

// =============================================================================
// Interfaz común: el resto del servidor solo usa query(), y las transacciones
// pasan por withTransaction(). Funciona igual con PostgreSQL y con SQLite.
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface QueryResult { rows: any[]; rowCount: number | null }
export interface DbClient { query(sql: string, params?: unknown[]): Promise<QueryResult> }
export interface DbPool extends DbClient {
  /** Ejecuta `fn` dentro de una transacción (BEGIN/COMMIT, ROLLBACK si falla). */
  transaction<T>(fn: (c: DbClient) => Promise<T>): Promise<T>;
}

export type DbDialect = 'postgres' | 'sqlite';

let pool: DbPool | null = null;
let poolDialect: DbDialect | null = null;
let isConnected = false;

export function isDbConnected(): boolean {
  return isConnected;
}

export function getDbConfig(): PoolConfig | null {
  const connectionString = process.env['DATABASE_URL'];
  if (connectionString) {
    return {
      connectionString,
      // SSL solo si se pide explícitamente (DATABASE_SSL=true), p. ej. en una base administrada en la nube.
      ssl: process.env['DATABASE_SSL'] === 'true' ? { rejectUnauthorized: process.env['DATABASE_SSL_REJECT_UNAUTHORIZED'] !== 'false' } : false,
    };
  }

  const host = process.env['POSTGRES_HOST'] || process.env['PGHOST'];
  if (host) {
    return {
      host,
      port: Number(process.env['POSTGRES_PORT'] || process.env['PGPORT'] || 5432),
      user: process.env['POSTGRES_USER'] || process.env['PGUSER'] || 'postgres',
      password: process.env['POSTGRES_PASSWORD'] || process.env['PGPASSWORD'] || 'postgres',
      database: process.env['POSTGRES_DB'] || process.env['PGDATABASE'] || 'custodia_risk',
    };
  }

  return null;
}

/**
 * Motor de base de datos:
 * - DB_CLIENT=postgres | sqlite | none lo fija explícitamente.
 * - Sin DB_CLIENT: PostgreSQL si hay DATABASE_URL o POSTGRES_HOST; si no, SQLite en un archivo local.
 */
export function getDialect(): DbDialect | null {
  const forced = (process.env['DB_CLIENT'] || '').trim().toLowerCase();
  if (forced === 'none' || forced === 'memory') return null;
  if (forced === 'sqlite') return 'sqlite';
  if (forced === 'postgres' || forced === 'postgresql' || forced === 'pg') return 'postgres';
  return getDbConfig() ? 'postgres' : 'sqlite';
}

/** Ruta del archivo SQLite (SQLITE_PATH, por defecto data/riskguard.db junto a la aplicación). */
export function getSqlitePath(): string {
  return resolve(process.env['SQLITE_PATH'] || join(process.cwd(), 'data', 'riskguard.db'));
}

export function getPool(): DbPool | null {
  if (pool) return pool;
  const dialect = getDialect();
  if (!dialect) return null;
  try {
    if (dialect === 'postgres') {
      const config = getDbConfig();
      if (!config) {
        console.warn('[PostgreSQL] DB_CLIENT=postgres pero falta DATABASE_URL o POSTGRES_HOST.');
        return null;
      }
      pool = new PgPool(config);
    } else {
      pool = new SqlitePool(getSqlitePath());
    }
    poolDialect = dialect;
    return pool;
  } catch (err) {
    console.warn(`[${dialect === 'postgres' ? 'PostgreSQL' : 'SQLite'}] No se pudo abrir la base de datos:`, err);
    return null;
  }
}

/** Motor de la conexión abierta (o el que se usará). */
export function dialect(): DbDialect | null {
  return poolDialect ?? getDialect();
}

const engineName = () => (dialect() === 'sqlite' ? 'SQLite' : 'PostgreSQL');

// =============================================================================
// PostgreSQL
// =============================================================================

class PgPool implements DbPool {
  private readonly pg: Pool;

  constructor(config: PoolConfig) {
    this.pg = new Pool(config);
    this.pg.on('error', (err) => {
      console.error('[PostgreSQL] Unexpected pool error on idle client:', err);
      isConnected = false;
    });
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    return this.pg.query(sql, params);
  }

  async transaction<T>(fn: (c: DbClient) => Promise<T>): Promise<T> {
    const client = await this.pg.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({ query: (sql, params) => client.query(sql, params) });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

// =============================================================================
// SQLite (módulo node:sqlite incluido en Node.js 22.16 o superior; sin compilación nativa)
// =============================================================================

const ISO_NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

/** Adapta el SQL común escrito para PostgreSQL: parámetros $n → ?n, sin conversiones ::tipo. */
function toSqliteSql(sql: string): string {
  return sql
    .replace(/\$(\d+)/g, '?$1')
    .replace(/::(?:int|integer|bigint|text|numeric|boolean|jsonb|date|timestamptz)\b(?:\[\])?/gi, '')
    .replace(/\bCURRENT_TIMESTAMP\b/g, ISO_NOW);
}

/** Valores de JavaScript → valores que acepta SQLite. */
function toSqliteValue(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v) || (typeof v === 'object' && !(v instanceof Uint8Array))) return JSON.stringify(v);
  return v;
}

/** Fila de PRAGMA table_info. */
interface SqliteColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null }

const SQLITE_TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

/** Valores de SQLite → los mismos tipos que entrega PostgreSQL, según el tipo declarado de la columna. */
function fromSqliteValue(v: unknown, declared: string | null): unknown {
  if (v === null || v === undefined || !declared) return v ?? null;
  switch (declared.toUpperCase()) {
    case 'BOOLEAN':
      return v === 1 || v === '1' || v === true || v === 'true';
    case 'JSONTEXT':
    case 'TEXTARRAY':
      if (typeof v !== 'string') return v;
      try { return JSON.parse(v); } catch { return v; }
    case 'DATE':
      return String(v).slice(0, 10);
    case 'TIMESTAMPTZ': {
      const s = String(v);
      const d = new Date(SQLITE_TS.test(s) ? `${s.replace(' ', 'T')}Z` : s);
      return Number.isNaN(d.getTime()) ? s : d;
    }
    default:
      return v;
  }
}

class SqlitePool implements DbPool {
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, { stmt: StatementSync; types: (string | null)[] | null }>();
  /** Cola de acceso: una transacción a la vez; las consultas sueltas esperan su turno. */
  private queue: Promise<void> = Promise.resolve();
  private readonly inTransaction = new AsyncLocalStorage<boolean>();

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    // Carga diferida: así el módulo solo se requiere cuando se usa SQLite.
    const { DatabaseSync: Sqlite } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    this.db = new Sqlite(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    // lower() de SQLite solo convierte ASCII; se reemplaza por la versión Unicode (como PostgreSQL),
    // que también usan los índices únicos de nombres y correos.
    this.db.function('lower', { deterministic: true }, (s: unknown) => (typeof s === 'string' ? s.toLocaleLowerCase('es') : s) as never);
  }

  private acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>(r => (release = r));
    const prev = this.queue;
    this.queue = prev.then(() => next);
    return prev.then(() => release);
  }

  private prepare(sql: string) {
    let entry = this.statements.get(sql);
    if (!entry) {
      const stmt = this.db.prepare(toSqliteSql(sql));
      const cols = stmt.columns();
      entry = { stmt, types: cols.length ? cols.map(c => c.type) : null };
      if (this.statements.size > 500) this.statements.clear();
      this.statements.set(sql, entry);
    }
    return entry;
  }

  private run(sql: string, params: unknown[] = []): QueryResult {
    // Los bloqueos asesores de PostgreSQL no hacen falta: la cola ya serializa las transacciones.
    if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [], rowCount: 0 };
    const { stmt, types: colTypes } = this.prepare(sql);
    const args = params.map(toSqliteValue) as never[];
    if (colTypes) {
      const names = stmt.columns().map(c => c.name);
      const rows = (stmt.all(...args) as Record<string, unknown>[]).map(r => {
        const out: Record<string, unknown> = {};
        names.forEach((n, i) => (out[n] = fromSqliteValue(r[n], colTypes[i])));
        return out;
      });
      return { rows, rowCount: rows.length };
    }
    const r = stmt.run(...args);
    return { rows: [], rowCount: Number(r.changes) };
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    // Dentro de una transacción de este mismo flujo se ejecuta directo (evita esperar su propio turno).
    if (this.inTransaction.getStore()) return this.run(sql, params);
    const release = await this.acquire();
    try {
      return this.run(sql, params);
    } finally {
      release();
    }
  }

  async transaction<T>(fn: (c: DbClient) => Promise<T>): Promise<T> {
    if (this.inTransaction.getStore()) return fn({ query: async (s, p) => this.run(s, p) });
    const release = await this.acquire();
    try {
      return await this.inTransaction.run(true, async () => {
        this.db.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn({ query: async (s, p) => this.run(s, p) });
          this.db.exec('COMMIT');
          return result;
        } catch (err) {
          this.db.exec('ROLLBACK');
          throw err;
        }
      });
    } finally {
      release();
    }
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  /**
   * Agrega a las tablas existentes las columnas nuevas del esquema (CREATE TABLE IF NOT EXISTS no las crea).
   * Compara con una base en memoria creada con el mismo script. Devuelve las columnas agregadas.
   */
  addMissingColumns(schemaSql: string): string[] {
    const { DatabaseSync: Sqlite } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const ref = new Sqlite(':memory:');
    ref.function('lower', { deterministic: true }, (v: unknown) => (typeof v === 'string' ? v.toLocaleLowerCase('es') : v) as never);
    ref.exec(schemaSql);
    const tables = ref.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[];
    const added: string[] = [];
    for (const { name } of tables) {
      const current = this.db.prepare(`PRAGMA table_info(${name})`).all() as unknown as SqliteColumnInfo[];
      if (!current.length) continue; // tabla nueva: la crea el script
      const have = new Set(current.map(c => c.name));
      for (const c of ref.prepare(`PRAGMA table_info(${name})`).all() as unknown as SqliteColumnInfo[]) {
        if (have.has(c.name)) continue;
        // SQLite no admite valores por defecto variables (p. ej. la fecha actual) en ADD COLUMN.
        const constantDefault = c.dflt_value !== null && !/\(/.test(c.dflt_value);
        let ddl = `ALTER TABLE ${name} ADD COLUMN ${c.name} ${c.type}`;
        if (constantDefault) ddl += `${c.notnull ? ' NOT NULL' : ''} DEFAULT ${c.dflt_value}`;
        this.db.exec(ddl);
        if (c.dflt_value !== null && !constantDefault) this.db.exec(`UPDATE ${name} SET ${c.name} = ${c.dflt_value} WHERE ${c.name} IS NULL`);
        added.push(`${name}.${c.name}`);
      }
    }
    ref.close();
    return added;
  }

  /**
   * SQLite no permite quitar una restricción CHECK con ALTER TABLE: las tablas cuya definición
   * antigua lo requiere se renombran aquí, el script crea la tabla nueva y `finishRebuilds`
   * copia los datos. Devuelve las tablas renombradas.
   */
  prepareRebuilds(): string[] {
    const renamed: string[] = [];
    for (const { table, legacy } of SQLITE_REBUILDS) {
      const row = this.db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as { sql: string } | undefined;
      if (!row || !legacy.test(row.sql)) continue;
      // Los índices se mueven con la tabla renombrada: se eliminan para que el script los cree en la nueva.
      const indexes = this.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`).all(table) as { name: string }[];
      for (const { name } of indexes) this.db.exec(`DROP INDEX IF EXISTS ${name}`);
      this.db.exec(`ALTER TABLE ${table} RENAME TO ${table}__anterior`);
      renamed.push(table);
    }
    return renamed;
  }

  finishRebuilds(tables: string[]) {
    for (const table of tables) {
      const cols = (t: string) => (this.db.prepare(`PRAGMA table_info(${t})`).all() as unknown as SqliteColumnInfo[]).map(c => c.name);
      const fresh = new Set(cols(table));
      const common = cols(`${table}__anterior`).filter(c => fresh.has(c)).join(', ');
      this.db.exec(`INSERT INTO ${table} (${common}) SELECT ${common} FROM ${table}__anterior`);
      this.db.exec(`DROP TABLE ${table}__anterior`);
    }
  }

  version(): string {
    return String((this.db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v);
  }
}

/** Tablas a reconstruir cuando su definición guardada coincide con la versión antigua. */
const SQLITE_REBUILDS: { table: string; legacy: RegExp }[] = [
  // Cumplimiento multinorma: el requisito dejó de limitarse a los capítulos 20-7 a 20-10.
  { table: 'compliance_requirements', legacy: /CHECK\s*\(+\s*chapter\s*\)*\s+IN\b/i },
  // Gestión documental: el tipo de solicitud de aprobación lo valida la aplicación (se agregó "documento").
  { table: 'approval_requests', legacy: /CHECK\s*\(+\s*kind\s*\)*\s+IN\b/i },
];

// =============================================================================
// Estado, estadísticas y esquema
// =============================================================================

export async function checkDbHealth(): Promise<{ connected: boolean; message: string; version?: string }> {
  const p = getPool();
  if (!p) {
    return {
      connected: false,
      message: 'Base de datos no configurada. Operando en modo local/memoria.',
    };
  }

  try {
    if (p instanceof SqlitePool) {
      const version = p.version();
      isConnected = true;
      return { connected: true, message: `Conectado a SQLite (${getSqlitePath()})`, version: `SQLite ${version}` };
    }
    const res = await p.query('SELECT version() AS version, current_database() AS db');
    isConnected = true;
    return {
      connected: true,
      message: `Conectado exitosamente a PostgreSQL (${res.rows[0].db})`,
      version: res.rows[0].version,
    };
  } catch (err) {
    isConnected = false;
    return {
      connected: false,
      message: `Error de conexión a ${engineName()}: ${(err as Error).message}`,
    };
  }
}

export async function getDbStats(): Promise<Record<string, unknown>> {
  const p = getPool();
  if (!p) throw new Error('Database pool not available');

  const [risksRes, controlsRes, krisRes, usersRes, ledgerRes] = await Promise.all([
    p.query('SELECT count(*) AS count FROM risks'),
    p.query('SELECT count(*) AS count FROM controls'),
    p.query('SELECT count(*) AS count FROM kri_definitions'),
    p.query('SELECT count(*) AS count FROM user_profiles'),
    p.query('SELECT count(*) AS count, max(block_number) AS last_block FROM crypto_audit_ledger'),
  ]);

  return {
    engine: engineName(),
    risksCount: Number(risksRes.rows[0]?.count ?? 0),
    controlsCount: Number(controlsRes.rows[0]?.count ?? 0),
    krisCount: Number(krisRes.rows[0]?.count ?? 0),
    usersCount: Number(usersRes.rows[0]?.count ?? 0),
    ledgerBlocksCount: Number(ledgerRes.rows[0]?.count ?? 0),
    lastLedgerBlock: Number(ledgerRes.rows[0]?.last_block ?? 0),
  };
}

/** Ruta del archivo de esquema (desarrollo, Docker o paquete descargable). */
function findSchemaFile(baseDir: string, file: string): string | undefined {
  const here = import.meta.dirname ?? baseDir; // carpeta del servidor compilado
  return [
    join(baseDir, 'database', file),
    join(baseDir, '..', 'database', file),
    join(here, '..', '..', 'database', file),        // paquete descargable: app/server → database
    join(here, '..', '..', '..', 'database', file),  // repositorio: dist/app/server → database
    join('/app/database', file),
    join('/database', file),
  ].find(p => existsSync(p));
}

/**
 * Aplica el esquema (database/schema.sql en PostgreSQL, database/schema.sqlite.sql en SQLite).
 * Los scripts son idempotentes, por lo que se ejecutan en cada arranque.
 */
export async function applySchema(baseDir: string = process.cwd()): Promise<void> {
  const p = getPool();
  if (!p) throw new Error('No hay base de datos configurada.');

  if (p instanceof SqlitePool) {
    const schemaFile = findSchemaFile(baseDir, 'schema.sqlite.sql');
    if (!schemaFile) throw new Error('Archivo database/schema.sqlite.sql no encontrado.');
    const schemaSql = readFileSync(schemaFile, 'utf8');
    const added = await p.transaction(async () => {
      // Primero las tablas a reconstruir y las columnas nuevas (los índices del script pueden usarlas);
      // luego el script completo y, al final, se copian los datos de las tablas reconstruidas.
      const rebuilt = p.prepareRebuilds();
      const cols = p.addMissingColumns(schemaSql);
      p.exec(schemaSql);
      p.finishRebuilds(rebuilt);
      if (rebuilt.length) console.log(`[SQLite] Tablas reconstruidas por actualización: ${rebuilt.join(', ')}`);
      return cols;
    });
    if (added.length) console.log(`[SQLite] Columnas agregadas por actualización: ${added.join(', ')}`);
    return;
  }

  const schemaFile = findSchemaFile(baseDir, 'schema.sql');
  if (!schemaFile) throw new Error('Archivo database/schema.sql no encontrado.');
  await p.transaction(async c => {
    // Evita que dos instancias migren al mismo tiempo.
    await c.query('SELECT pg_advisory_xact_lock(727001)');
    await c.query(readFileSync(schemaFile, 'utf8'));
  });
}
