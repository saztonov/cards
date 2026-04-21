import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.db.connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const query = (text, params) => pool.query(text, params);
