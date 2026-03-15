import express from 'express';
import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { requestLogger } from './middleware/logger';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { productsRouter } from './routes/products';
import { ordersRouter } from './routes/orders';

const app = express();

app.use(express.json());
app.use(requestLogger);

app.use('/api/auth', authRouter);
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/products', authMiddleware, productsRouter);
app.use('/api/orders', authMiddleware, ordersRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});
