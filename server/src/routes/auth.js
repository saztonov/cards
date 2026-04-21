import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { signToken, slugify } from '../util/tokens.js';
import {
  loginIpLimiter,
  loginEmailLimiter,
  registerIpLimiter,
  registerGlobalLimiter,
} from '../middleware/rate-limit.js';

const router = Router();

const BCRYPT_COST = 12;
const MIN_PASSWORD = 6;

async function uniqueSlug(seed) {
  const base = slugify(seed);
  let slug = base;
  for (let i = 0; i < 10; i++) {
    const { rows } = await query('select 1 from users where slug = $1', [slug]);
    if (!rows.length) return slug;
    slug = `${base}-${Math.floor(Math.random() * 9999)}`;
  }
  throw new Error('cannot_generate_slug');
}

// POST /api/v1/auth/register
router.post('/register', registerGlobalLimiter, registerIpLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'invalid_email' });
  if (password.length < MIN_PASSWORD) return res.status(400).json({ error: 'password_too_short' });

  const exists = await query('select 1 from users where email = $1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'email_taken' });

  const password_hash = await bcrypt.hash(password, BCRYPT_COST);
  const slug = await uniqueSlug(email.split('@')[0]);

  await query(
    `insert into users (email, password_hash, slug, role, is_active)
     values ($1, $2, $3, 'user', false)`,
    [email, password_hash, slug]
  );

  res.status(202).json({ pending: true });
});

// POST /api/v1/auth/login
router.post('/login', loginIpLimiter, loginEmailLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'invalid_credentials' });

  const { rows } = await query(
    'select id, password_hash, slug, role, is_active from users where email = $1',
    [email]
  );
  const user = rows[0];
  const hash = user?.password_hash || '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) return res.status(401).json({ error: 'invalid_credentials' });
  if (!user.is_active) return res.status(403).json({ error: 'not_activated' });

  res.json({ token: signToken(user) });
});

export default router;
