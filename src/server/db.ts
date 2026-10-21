import { Pool, PoolConfig } from 'pg';
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
      ssl: process.env['NODE_ENV'] === 'production' && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
        ? { rejectUnauthorized: false }
        : false,
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

export async function initializeSchemaAndSeed(baseDir: string = process.cwd()): Promise<{ success: boolean; message: string }> {
  const p = getPool();
  if (!p) {
    throw new Error('No hay conexión configurada a PostgreSQL para inicializar el esquema.');
  }

  const schemaPaths = [
    join(baseDir, 'database/schema.sql'),
    join(baseDir, '../database/schema.sql'),
    '/database/schema.sql',
  ];
  const seedPaths = [
    join(baseDir, 'database/seed.sql'),
    join(baseDir, '../database/seed.sql'),
    '/database/seed.sql',
  ];

  const schemaFile = schemaPaths.find((p) => existsSync(p));
  const seedFile = seedPaths.find((p) => existsSync(p));

  if (!schemaFile) {
    throw new Error('Archivo database/schema.sql no encontrado.');
  }

  const client = await p.connect();
  try {
    await client.query('BEGIN');
    
    const schemaSql = readFileSync(schemaFile, 'utf8');
    await client.query(schemaSql);

    if (seedFile) {
      const seedSql = readFileSync(seedFile, 'utf8');
      await client.query(seedSql);
    }

    await client.query('COMMIT');
    return {
      success: true,
      message: 'Esquema y datos semilla aplicados exitosamente en la base de datos PostgreSQL.',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
