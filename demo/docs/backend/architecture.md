# Backend Architecture

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Database | PostgreSQL 16 |
| Cache / queues | Redis 7 |
| Auth | JWT (HS256), 7-day expiry |
| ORM | Raw SQL via `pg` |

## Request lifecycle

```
Client → Express router → authMiddleware → route handler → db/service → response
```

Error handling is done by a global `errorHandler` middleware. All async handlers are wrapped with `asyncHandler()` to forward thrown errors to the middleware.

## Database access

No ORM. Use tagged `db.query()` calls with parameterized queries. Never interpolate user input into SQL strings.

## Background jobs

Long-running work (email, payment webhooks) is queued via Redis. Workers live in `src/workers/`. Run separately via `npm run workers`.

## Environment variables

See `src/config.ts` for the full list. Required in production:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `PAYMENT_SECRET_KEY`
- `EMAIL_FROM`
