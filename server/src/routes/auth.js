import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { randomToken, sha256, signAccess, slugify } from '../util/tokens.js';
import { sendMail, buildVerifyLink, buildResetLink } from '../mail.js';
import { config } from '../config.js';
import { loginIpLimiter, loginEmailLimiter, authSoftLimiter } from '../middleware/rate-limit.js';

const router = Router();

const BCRYPT_COST = 12;
const MIN_PASSWORD = 6;
const REFRESH_COOKIE = '__Host-refresh';
const REFRESH_PATH = '/api/v1/auth';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: REFRESH_PATH,
    maxAge: config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
}

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
router.post('/register', authSoftLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'invalid_email' });
  if (password.length < MIN_PASSWORD) return res.status(400).json({ error: 'password_too_short' });

  const exists = await query('select 1 from users where email = $1', [email]);
  if (exists.rows.length) {
    // Не раскрываем, что email занят — отвечаем generic'ом.
    return res.status(202).json({ ok: true });
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_COST);
  const slug = await uniqueSlug(email.split('@')[0]);

  const { rows } = await query(
    'insert into users (email, password_hash, slug) values ($1, $2, $3) returning id',
    [email, password_hash, slug]
  );
  const userId = rows[0].id;

  await query('insert into profiles (user_id, full_name) values ($1, $2)', [userId, '']);

  const token = randomToken(32);
  const hash = sha256(token);
  await query(
    `insert into email_verifications (user_id, token_sha256, expires_at)
     values ($1, $2, now() + interval '24 hours')`,
    [userId, hash]
  );

  try {
    await sendMail({
      to: email,
      subject: 'Подтверждение регистрации — cards.fvds.ru',
      text: `Для подтверждения перейдите по ссылке:\n${buildVerifyLink(token)}\n\nСсылка действительна 24 часа.`,
    });
  } catch (err) {
    console.error('mail error', err);
  }

  res.status(201).json({ ok: true });
});

// GET /api/v1/auth/verify/:token
router.get('/verify/:token', async (req, res) => {
  const token = String(req.params.token || '');
  if (!token) return res.redirect(`${config.appUrl}/login?verified=0`);
  const hash = sha256(token);
  const { rows } = await query(
    `update email_verifications
       set used_at = now()
     where token_sha256 = $1 and used_at is null and expires_at > now()
     returning user_id`,
    [hash]
  );
  if (!rows.length) return res.redirect(`${config.appUrl}/login?verified=0`);
  await query('update users set email_verified_at = now() where id = $1', [rows[0].user_id]);
  res.redirect(`${config.appUrl}/login?verified=1`);
});

// POST /api/v1/auth/login
router.post('/login', loginIpLimiter, loginEmailLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ip = req.ip;
  const ua = req.get('user-agent') || null;

  const logAttempt = (success) =>
    query('insert into login_attempts (email, ip, success) values ($1, $2, $3)', [email, ip, success]).catch(() => {});

  if (!email || !password) {
    await logAttempt(false);
    return res.status(400).json({ error: 'invalid_credentials' });
  }

  const { rows } = await query(
    'select id, password_hash, slug, email_verified_at from users where email = $1',
    [email]
  );
  const user = rows[0];
  const hash = user?.password_hash || '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) {
    await logAttempt(false);
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  if (!user.email_verified_at) {
    await logAttempt(false);
    return res.status(403).json({ error: 'email_not_verified' });
  }

  const refreshRaw = randomToken(32);
  const refreshHash = sha256(refreshRaw);
  await query(
    `insert into sessions (user_id, refresh_token_sha256, user_agent, ip) values ($1, $2, $3, $4)`,
    [user.id, refreshHash, ua, ip]
  );

  await logAttempt(true);
  setRefreshCookie(res, refreshRaw);
  res.json({ access: signAccess(user) });
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) return res.status(401).json({ error: 'no_refresh' });
  const hash = sha256(raw);
  const ua = req.get('user-agent') || null;
  const ip = req.ip;

  const { rows } = await query(
    `select s.id, s.user_id, s.rotated_at, s.revoked_at, u.slug
       from sessions s join users u on u.id = s.user_id
      where s.refresh_token_sha256 = $1`,
    [hash]
  );
  const session = rows[0];
  if (!session) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'invalid_refresh' });
  }
  if (session.revoked_at) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'session_revoked' });
  }
  if (session.rotated_at) {
    // Reuse detection — старый токен вернулся после ротации. Revoke всю линию.
    await query('update sessions set revoked_at = now() where id = $1', [session.id]);
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'refresh_reuse_detected' });
  }

  const newRaw = randomToken(32);
  const newHash = sha256(newRaw);
  await query(
    `update sessions set rotated_at = now() where id = $1`,
    [session.id]
  );
  await query(
    `insert into sessions (user_id, refresh_token_sha256, user_agent, ip) values ($1, $2, $3, $4)`,
    [session.user_id, newHash, ua, ip]
  );

  setRefreshCookie(res, newRaw);
  res.json({ access: signAccess({ id: session.user_id, slug: session.slug }) });
});

// POST /api/v1/auth/logout
router.post('/logout', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) {
    const hash = sha256(raw);
    await query(
      `update sessions set revoked_at = now() where refresh_token_sha256 = $1 and revoked_at is null`,
      [hash]
    );
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

// POST /api/v1/auth/password/forgot
router.post('/password/forgot', authSoftLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(202).json({ ok: true });

  const { rows } = await query('select id from users where email = $1', [email]);
  const user = rows[0];
  if (user) {
    const token = randomToken(32);
    const hash = sha256(token);
    await query(
      `insert into password_resets (user_id, token_sha256, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [user.id, hash]
    );
    try {
      await sendMail({
        to: email,
        subject: 'Сброс пароля — cards.fvds.ru',
        text: `Для сброса пароля перейдите по ссылке:\n${buildResetLink(token)}\n\nСсылка действительна 1 час.`,
      });
    } catch (err) {
      console.error('mail error', err);
    }
  }
  res.status(202).json({ ok: true });
});

// POST /api/v1/auth/password/reset
router.post('/password/reset', authSoftLimiter, async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (!token || password.length < MIN_PASSWORD) return res.status(400).json({ error: 'invalid_input' });

  const hash = sha256(token);
  const { rows } = await query(
    `update password_resets
       set used_at = now()
     where token_sha256 = $1 and used_at is null and expires_at > now()
     returning user_id`,
    [hash]
  );
  if (!rows.length) return res.status(400).json({ error: 'invalid_or_expired' });
  const password_hash = await bcrypt.hash(password, BCRYPT_COST);
  await query('update users set password_hash = $1, updated_at = now() where id = $2', [password_hash, rows[0].user_id]);
  // Инвалидируем все активные сессии пользователя для безопасности.
  await query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [rows[0].user_id]);
  res.status(204).end();
});

export default router;
