import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { pool } from '../src/db.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../sql/migrations');

async function ensureTable() {
  await pool.query(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function applied() {
  const { rows } = await pool.query('select name from _migrations');
  return new Set(rows.map((r) => r.name));
}

async function main() {
  await ensureTable();
  const done = await applied();
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    console.log(`applying ${file}...`);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (name) values ($1)', [file]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
  await pool.end();
  console.log('migrations done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
