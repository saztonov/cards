import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/v1/cards
router.get('/', async (_req, res) => {
  const { rows } = await query(
    `select slug, full_name, position, avatar_path, show_photo
       from users
      where coalesce(full_name, '') <> ''
      order by full_name`
  );
  res.json(rows);
});

// GET /api/v1/cards/:slug
router.get('/:slug', async (req, res) => {
  const { rows } = await query(
    `select slug, full_name, position, phone, telegram, about, avatar_path, social, show_photo, email
       from users where slug = $1`,
    [req.params.slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
});

export default router;
