# ADR 002: OAuth + JWT Auth Strategy

**Status**: Accepted

## Context

We need a stateless auth mechanism that works across web, mobile, and service-to-service calls.

## Decision

Use short-lived JWTs (1h) with refresh tokens (7d). OAuth providers: Google and GitHub.

## Consequences

- No server-side session storage needed
- Token revocation requires a denylist (Redis-backed)
- Mobile apps must handle token refresh silently
