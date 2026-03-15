# API Authentication

## Bearer token

All protected endpoints require an `Authorization` header:

```
Authorization: Bearer <jwt>
```

## Errors

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid token |
| 403 | Valid token but insufficient permissions |

## Rate limiting

- Unauthenticated: 20 req/min per IP
- Authenticated: 300 req/min per user

Rate limit headers:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 247
X-RateLimit-Reset: 1720000000
```
