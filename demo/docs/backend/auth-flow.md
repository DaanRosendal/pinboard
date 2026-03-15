# Auth Flow

## Registration

1. `POST /api/auth/register` with `{ email, password, name }`
2. Server validates with `registerSchema` (zod)
3. Password is hashed with bcrypt (12 rounds)
4. User row inserted; JWT returned

## Login

1. `POST /api/auth/login` with `{ email, password }`
2. `bcrypt.compare` against stored hash
3. On success: signed JWT (`sub: userId`, 7-day expiry) returned

## Authenticated requests

Include the token as `Authorization: Bearer <token>` on every request to a protected route. The `authMiddleware` verifies the signature and attaches `req.userId`.

## Token refresh

JWTs are not refreshed automatically. Clients must re-login after expiry. A refresh-token flow can be added later if session length becomes a product concern.

## Password reset

1. `POST /api/auth/forgot-password` with `{ email }`
2. A signed reset token (15-min expiry) is emailed via `emailService`
3. `POST /api/auth/reset-password` with `{ token, newPassword }`
