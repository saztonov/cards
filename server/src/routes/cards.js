import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/v1/cards
router.get('/', async (_req, res) => {
  const { rows } = await query(
    `select u.slug, p.full_name, p.position, p.avatar_path
       from users u join profiles p on p.user_id = u.id
      where u.email_verified_at is not null and coalesce(p.full_name, '') <> ''
      order by p.full_name`
  );
  res.json(rows);
});

// GET /api/v1/cards/:slug
router.get('/:slug', async (req, res) => {
  const { rows } = await query(
    `select u.slug, p.full_name, p.position, p.phone, p.telegram, p.about, p.avatar_path, p.social, u.email
       from users u join profiles p on p.user_id = u.id
      where u.slug = $1 and u.email_verified_at is not null`,
    [req.params.slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
});

export default router;
