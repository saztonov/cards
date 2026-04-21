import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/v1/admin/users
router.get('/users', async (_req, res) => {
  const { rows } = await query(
    `select id, email, slug, full_name, role, is_active, created_at, updated_at
       from users
      order by is_active asc, created_at desc`
  );
  res.json(rows);
});

// POST /api/v1/admin/users/:id/activate
router.post('/users/:id/activate', async (req, res) => {
  const { rowCount } = await query(
    'update users set is_active = true, updated_at = now() where id = $1',
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// POST /api/v1/admin/users/:id/deactivate
router.post('/users/:id/deactivate', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'self_deactivate' });
  const { rowCount } = await query(
    'update users set is_active = false, updated_at = now() where id = $1',
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// DELETE /api/v1/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'self_delete' });
  const { rowCount } = await query('delete from users where id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

export default router;
