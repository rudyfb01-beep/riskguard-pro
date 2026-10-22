import { Pool, PoolConfig, types } from 'pg';

// Tipos devueltos como valores simples y estables para la aplicación:
// DATE como 'YYYY-MM-DD' (sin desfase horario), NUMERIC y BIGINT como number.
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(1700, (v: string) => parseFloat(v));
types.setTypeParser(20, (v: string) => parseInt(v, 10));
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let pool: Pool | null = null;
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

export function getPool(): Pool | null {
  if (pool) return pool;
  const config = getDbConfig();
  if (!config) return null;

  try {
    pool = new Pool(config);
    pool.on('error', (err) => {
      console.error('[PostgreSQL] Unexpected pool error on idle client:', err);
      isConnected = false;
    });
    return pool;
  } catch (err) {
    console.warn('[PostgreSQL] Could not create pool:', err);
    return null;
  }
}

export async function checkDbHealth(): Promise<{ connected: boolean; message: string; version?: string }> {
  const p = getPool();
  if (!p) {
    return {
      connected: false,
      message: 'Base de datos no configurada (DATABASE_URL o POSTGRES_HOST no especificados). Operando en modo local/memoria.',
    };
  }

  try {
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
      message: `Error de conexión a PostgreSQL: ${(err as Error).message}`,
    };
  }
}

export async function getDbStats(): Promise<Record<string, unknown>> {
  const p = getPool();
  if (!p) throw new Error('Database pool not available');

  const [risksRes, controlsRes, krisRes, usersRes, ledgerRes] = await Promise.all([
    p.query('SELECT count(*)::int AS count FROM risks'),
    p.query('SELECT count(*)::int AS count FROM controls'),
    p.query('SELECT count(*)::int AS count FROM kri_definitions'),
    p.query('SELECT count(*)::int AS count FROM user_profiles'),
    p.query('SELECT count(*)::int AS count, max(block_number)::int AS last_block FROM crypto_audit_ledger'),
  ]);

  return {
    risksCount: risksRes.rows[0]?.count ?? 0,
    controlsCount: controlsRes.rows[0]?.count ?? 0,
    krisCount: krisRes.rows[0]?.count ?? 0,
    usersCount: usersRes.rows[0]?.count ?? 0,
    ledgerBlocksCount: ledgerRes.rows[0]?.count ?? 0,
    lastLedgerBlock: ledgerRes.rows[0]?.last_block ?? 0,
  };
}

/** Ruta de database/schema.sql (desarrollo, Docker o despliegue). */
function findSchemaFile(baseDir: string): string | undefined {
  return [
    join(baseDir, 'database/schema.sql'),
    join(baseDir, '../database/schema.sql'),
    '/app/database/schema.sql',
    '/database/schema.sql',
  ].find(p => existsSync(p));
}

/**
 * Aplica database/schema.sql. El script es idempotente, por lo que se ejecuta en
 * cada arranque y actúa como migración de bases existentes.
 */
export async function applySchema(baseDir: string = process.cwd()): Promise<void> {
  const p = getPool();
  if (!p) throw new Error('No hay conexión configurada a PostgreSQL.');
  const schemaFile = findSchemaFile(baseDir);
  if (!schemaFile) throw new Error('Archivo database/schema.sql no encontrado.');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    // Evita que dos instancias migren al mismo tiempo.
    await client.query('SELECT pg_advisory_xact_lock(727001)');
    await client.query(readFileSync(schemaFile, 'utf8'));
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
