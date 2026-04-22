import fs from 'node:fs/promises';
import path from 'node:path';
import url, { pathToFileURL } from 'node:url';
import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';

// Зависимости, доступные JS-миграциям как второй аргумент up(client, deps).
// Миграции лежат в ../../sql/migrations/ — импортировать npm-пакеты оттуда
// нельзя (нет соседнего node_modules), поэтому инжектируем отсюда.
const deps = { bcrypt };

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
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql') || f.endsWith('.js'))
    .sort();

  for (const file of files) {
    if (done.has(file)) continue;
    console.log(`applying ${file}...`);
    const client = await pool.connect();
    try {
      await client.query('begin');
      const full = path.join(migrationsDir, file);
      if (file.endsWith('.sql')) {
        const sql = await fs.readFile(full, 'utf8');
        await client.query(sql);
      } else {
        const mod = await import(pathToFileURL(full).href);
        if (typeof mod.up !== 'function') {
          throw new Error(`${file}: expected export "up(client, deps)"`);
        }
        await mod.up(client, deps);
      }
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
