import { Router } from 'express';
import { db } from '../db/client';

export const productsRouter = Router();

productsRouter.get('/', async (_req, res) => {
  const { rows } = await db.query('SELECT * FROM products ORDER BY created_at DESC');
  res.json(rows);
});

productsRouter.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
  res.json(rows[0]);
});

productsRouter.post('/', async (req, res) => {
  const { name, sku, price, stock } = req.body;
  const { rows } = await db.query(
    'INSERT INTO products (name, sku, price, stock) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, sku, price, stock]
  );
  res.status(201).json(rows[0]);
});

productsRouter.patch('/:id', async (req, res) => {
  const { name, price, stock, status } = req.body;
  const { rows } = await db.query(
    `UPDATE products SET
       name   = COALESCE($1, name),
       price  = COALESCE($2, price),
       stock  = COALESCE($3, stock),
       status = COALESCE($4, status)
     WHERE id = $5 RETURNING *`,
    [name, price, stock, status, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
  res.json(rows[0]);
});

productsRouter.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.status(204).send();
});
