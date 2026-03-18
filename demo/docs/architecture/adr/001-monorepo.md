# ADR 001: Use a Turborepo Monorepo

**Status**: Accepted

## Context

We need a single repository that can house all apps, services, and shared packages.

## Decision

Use Turborepo with pnpm workspaces.

## Consequences

- Faster builds via Turbo's remote caching
- Shared packages are symlinked locally — no publish step for internal deps
- All teams work in one repo; branch permissions enforced via CODEOWNERS
