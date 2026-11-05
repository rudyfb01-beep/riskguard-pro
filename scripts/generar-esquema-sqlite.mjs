// Regenera las tablas e índices de database/schema.sqlite.sql a partir de una base PostgreSQL
// ya migrada con database/schema.sql (conserva la sección de disparadores escrita a mano).
// Uso: DATABASE_URL=postgres://... node scripts/generar-esquema-sqlite.mjs
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const target = join(import.meta.dirname, '..', 'database', 'schema.sqlite.sql');
const MARKER = '-- =============================================================================\n-- Disparadores';

const CASTS = /::(?:character varying(?:\(\d+\))?|bpchar|text|numeric|integer|bigint|smallint|jsonb|date|boolean|timestamp with time zone|regclass)(?:\[\])?/g;
const strip = (s) => s.replace(CASTS, '');
const anyArray = (s) => s.replace(/\s*=\s*ANY\s*\(\(?ARRAY\[(.*?)\]\)?(?:::text\[\])?\)/g, (_, list) => ` IN (${strip(list)})`);
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

function colType(t) {
  if (t.startsWith('character varying') || t === 'text') return 'TEXT';
  if (t === 'text[]') return 'TEXTARRAY';
  if (t === 'jsonb') return 'JSONTEXT';
  if (t === 'boolean') return 'BOOLEAN';
  if (t === 'bytea') return 'BLOB';
  if (t.startsWith('character(')) return 'TEXT';
  if (['integer', 'smallint', 'bigint'].includes(t)) return 'INTEGER';
  if (t.startsWith('numeric')) return 'NUMERIC';
  if (t === 'date') return 'DATE';
  if (t === 'timestamp with time zone') return 'TIMESTAMPTZ';
  throw new Error(`Tipo sin equivalencia SQLite: ${t}`);
}

function defaultOf(def, type) {
  if (def == null || def.startsWith('nextval')) return null;
  if (def === 'CURRENT_TIMESTAMP') return NOW;
  if (def === 'true' || def === 'false') return def === 'true' ? '1' : '0';
  if (type === 'text[]') return "'[]'";
  return strip(def);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = async (sql, params) => (await client.query(sql, params)).rows;

const tables = await q(`SELECT c.relname AS name, c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.oid`);
const out = [
  '-- RiskGuard Pro: esquema SQLite equivalente a database/schema.sql (PostgreSQL).',
  '-- Tablas e índices generados con scripts/generar-esquema-sqlite.mjs; idempotente (se aplica en cada arranque).',
  '-- Tipos declarados que el servidor convierte al leer: BOOLEAN, JSONTEXT (JSON), TEXTARRAY (lista JSON),',
  '-- DATE (AAAA-MM-DD) y TIMESTAMPTZ (ISO 8601 UTC).',
  '',
];
const indexes = [];
for (const t of tables) {
  const cols = await q(`SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS nn,
      pg_get_expr(d.adbin, d.adrelid) AS def
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [t.oid]);
  const cons = await q(`SELECT conname, contype, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = $1 ORDER BY contype, conname`, [t.oid]);
  const idx = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`, [t.name]);

  const pk = cons.find(c => c.contype === 'p');
  const pkCols = pk ? pk.def.match(/\((.*)\)/)[1].split(', ') : [];
  let inlinePk = false;
  const lines = [];
  for (const c of cols) {
    if ((c.def ?? '').startsWith('nextval') && pkCols.length === 1 && pkCols[0] === c.name) {
      lines.push(`    ${c.name} INTEGER PRIMARY KEY AUTOINCREMENT`);
      inlinePk = true;
      continue;
    }
    let s = `    ${c.name} ${colType(c.type)}`;
    if (c.nn) s += ' NOT NULL';
    const d = defaultOf(c.def, c.type);
    if (d !== null) s += ` DEFAULT ${d}`;
    lines.push(s);
  }
  for (const c of cons) {
    if (c.contype === 'p' && !inlinePk) lines.push(`    ${c.def}`);
    else if (c.contype === 'u' || c.contype === 'f') lines.push(`    ${c.def}`);
    else if (c.contype === 'c') lines.push(`    ${strip(anyArray(c.def))}`);
  }
  out.push(`CREATE TABLE IF NOT EXISTS ${t.name} (\n${lines.join(',\n')}\n);\n`);
  const conNames = new Set(cons.map(c => c.conname));
  for (const i of idx) {
    if (conNames.has(i.indexname)) continue;
    const m = i.indexdef.match(/^CREATE (UNIQUE )?INDEX (\w+) ON public\.(\w+) USING btree (.*)$/);
    if (m) indexes.push(`CREATE ${m[1] ?? ''}INDEX IF NOT EXISTS ${m[2]} ON ${m[3]} ${strip(m[4])};`);
  }
}
await client.end();

out.push('-- Índices', ...indexes, '');
const current = readFileSync(target, 'utf8');
const triggers = current.includes(MARKER) ? current.slice(current.indexOf(MARKER)) : '';
writeFileSync(target, out.join('\n') + '\n' + triggers);
console.log(`Actualizado ${target} (${tables.length} tablas, ${indexes.length} índices).`);
