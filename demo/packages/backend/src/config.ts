export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/acme',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-do-not-use-in-prod',
  jwtExpiresIn: '7d',
  bcryptRounds: 12,
  emailFrom: process.env.EMAIL_FROM ?? 'no-reply@acme.example.com',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;
