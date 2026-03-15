# API Endpoints

Base path: `/api`

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Get JWT |
| POST | `/auth/logout` | — | Invalidate session |
| POST | `/auth/forgot-password` | — | Send reset email |
| POST | `/auth/reset-password` | — | Set new password |

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | ✓ | Get current user |
| PATCH | `/users/me` | ✓ | Update profile |

## Products

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products` | ✓ | List all products |
| GET | `/products/:id` | ✓ | Get product |
| POST | `/products` | ✓ admin | Create product |
| PATCH | `/products/:id` | ✓ admin | Update product |
| DELETE | `/products/:id` | ✓ admin | Delete product |

## Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/orders` | ✓ | List orders |
| POST | `/orders` | ✓ | Create order |
| GET | `/orders/:id` | ✓ | Get order |
| PATCH | `/orders/:id/status` | ✓ admin | Update status |
