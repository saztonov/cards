import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { query } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpe?g|png|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error('unsupported_image_type'), ok);
  },
});

const PROFILE_FIELDS = ['full_name', 'position', 'phone', 'telegram', 'about', 'social'];

function sanitize(input) {
  const out = {};
  for (const k of PROFILE_FIELDS) {
    if (!(k in input)) continue;
    if (k === 'social') {
      out[k] = input[k] && typeof input[k] === 'object' ? input[k] : {};
    } else {
      out[k] = input[k] == null ? null : String(input[k]).slice(0, 500);
    }
  }
  return out;
}

// GET /api/v1/me
router.get('/', async (req, res) => {
  const { rows } = await query(
    `select u.id, u.email, u.slug, p.full_name, p.position, p.phone, p.telegram, p.about, p.avatar_path, p.social
       from users u join profiles p on p.user_id = u.id
      where u.id = $1`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
});

// PUT /api/v1/me
router.put('/', async (req, res) => {
  const data = sanitize(req.body || {});
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: 'nothing_to_update' });
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const vals = keys.map((k) => data[k]);
  await query(
    `update profiles set ${sets}, updated_at = now() where user_id = $1`,
    [req.user.id, ...vals]
  );
  res.status(204).end();
});

// POST /api/v1/me/avatar
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  await fs.mkdir(config.uploads.dir, { recursive: true });
  const filename = `${req.user.id}.webp`;
  const filepath = path.join(config.uploads.dir, filename);
  await sharp(req.file.buffer).rotate().resize(512, 512, { fit: 'cover' }).webp({ quality: 85 }).toFile(filepath);
  const publicPath = `/uploads/${filename}`;
  await query('update profiles set avatar_path = $1, updated_at = now() where user_id = $2', [publicPath, req.user.id]);
  res.json({ avatar_path: publicPath });
});

// GET /api/v1/me/sessions
router.get('/sessions', async (req, res) => {
  const { rows } = await query(
    `select id, user_agent, ip::text as ip, created_at, rotated_at
       from sessions where user_id = $1 and revoked_at is null
       order by created_at desc`,
    [req.user.id]
  );
  res.json(rows);
});

// DELETE /api/v1/me/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  const { rowCount } = await query(
    'update sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null',
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

export default router;
