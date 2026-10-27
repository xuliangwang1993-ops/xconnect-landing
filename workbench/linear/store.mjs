import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../migrations/20261028_linear_issues.sql'),
  'utf8',
);

const COLUMNS = [
  'record_type', 'id', 'identifier', 'title', 'description', 'url', 'priority',
  'team_id', 'team_key', 'team_name', 'state_id', 'state_name', 'state_type',
  'state_color', 'assignee_name', 'created_at', 'updated_at', 'synced_at', 'payload',
];

const INSERT = `insert into linear_issues (${COLUMNS.join(', ')})
  values (${COLUMNS.map((_, i) => `$${i + 1}`).join(', ')})`;

const LIST = `select ${COLUMNS.filter((c) => c !== 'payload').join(', ')}
  from linear_issues
  where record_type = $1
  order by updated_at desc nulls last, title asc`;

function valuesOf(row) {
  return COLUMNS.map((column) => (column === 'payload' ? (row.payload ?? {}) : row[column] ?? null));
}

export function createLinearStore(pool) {
  return {
    async ensureSchema() {
      await pool.query(MIGRATION);
    },
    async replaceCache(rows) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('delete from linear_issues');
        for (const row of rows) await client.query(INSERT, valuesOf(row));
        await client.query('commit');
      } catch (err) {
        try { await client.query('rollback'); } catch {}
        throw err;
      } finally {
        client.release();
      }
    },
    async list(recordType) {
      const result = await pool.query(LIST, [recordType]);
      return result.rows;
    },
    async close() {
      await pool.end();
    },
  };
}

export async function openLinearStore(env = process.env) {
  const connectionString = String(env.DATABASE_URL || '').trim();
  if (!connectionString) {
    const err = new Error('database_url_missing');
    err.code = 'database_url_missing';
    throw err;
  }
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString, max: 4 });
  const store = createLinearStore(pool);
  await store.ensureSchema();
  return store;
}
