import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import pg from 'pg';
import { config } from './config.js';

function buildSsl() {
  if (!config.db.caPath) return undefined;
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const caAbs = path.isAbsolute(config.db.caPath)
    ? config.db.caPath
    : path.resolve(here, '..', config.db.caPath);
  return {
    ca: fs.readFileSync(caAbs, 'utf8'),
    rejectUnauthorized: true,
  };
}

export const pool = new pg.Pool({
  connectionString: config.db.connectionString,
  ssl: buildSsl(),
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const query = (text, params) => pool.query(text, params);
