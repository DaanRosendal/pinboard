import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../db/client';
import { config } from '../config';
import { validateBody } from '../middleware/validate';
import { loginSchema, registerSchema } from '@acme/shared';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), async (req, res) => {
  const { email, password, name } = req.body;
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already in use' });
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const { rows } = await db.query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
    [email, hash, name]
  );
  const token = jwt.sign({ sub: rows[0].id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.status(201).json({ user: rows[0], token });
});

authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: rows[0].id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.json({ user: { id: rows[0].id, email: rows[0].email, name: rows[0].name }, token });
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
