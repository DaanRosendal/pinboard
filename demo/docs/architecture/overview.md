# Architecture Overview

Acme Platform is a cloud-native SaaS product built as a Turborepo monorepo.

## Key components

- **apps/web** — Next.js customer-facing app
- **apps/admin** — Vite-based internal admin panel
- **apps/mobile** — React Native app (iOS + Android)
- **services/api-gateway** — Express reverse proxy + auth verification
- **services/auth-service** — OAuth + JWT issuance
- **services/billing-service** — Stripe integration
- **services/notification-service** — Email + push notifications
- **packages/db** — Drizzle ORM schema + migrations
- **packages/shared** — Shared types and utilities
- **packages/ui** — Shared React component library
