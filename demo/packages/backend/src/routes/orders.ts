import { Router } from 'express';
import { db } from '../db/client';
import { emailService } from '../services/emailService';
import type { AuthRequest } from '../middleware/auth';

export const ordersRouter = Router();

ordersRouter.get('/', async (req: AuthRequest, res) => {
  const limit = Number(req.query.limit) || 50;
  const { rows } = await db.query(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  res.json(rows);
});

ordersRouter.post('/', async (req: AuthRequest, res) => {
  const { items } = req.body;
  const { rows } = await db.query(
    'INSERT INTO orders (user_id, items, status) VALUES ($1, $2, $3) RETURNING *',
    [req.userId, JSON.stringify(items), 'pending']
  );
  await emailService.sendOrderConfirmation(rows[0]);
  res.status(201).json(rows[0]);
});
