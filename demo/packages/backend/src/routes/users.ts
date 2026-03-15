import { Router } from 'express';
import { db } from '../db/client';
import type { AuthRequest } from '../middleware/auth';

export const usersRouter = Router();

usersRouter.get('/me', async (req: AuthRequest, res) => {
  const { rows } = await db.query(
    'SELECT id, email, name, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

usersRouter.patch('/me', async (req: AuthRequest, res) => {
  const { name, email } = req.body;
  const { rows } = await db.query(
    'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, email, name',
    [name, email, req.userId]
  );
  res.json(rows[0]);
});
