# Onboarding

## Prerequisites

- Node.js 20+
- Docker (for Postgres + Redis)
- npm 10+

## First-time setup

```bash
git clone git@github.com:acme/platform.git
cd platform
npm install
docker compose up -d
npm run migrate
npm run seed
```

## Start dev servers

```bash
npm run dev
```

Frontend: http://localhost:3000
Backend: http://localhost:3001

## Recommended Pinboard presets

Open `.pinboard.json` at the workspace root and apply a preset:
- **Frontend Team** — pins `packages/frontend/src`, `packages/shared`, `docs/frontend`
- **Backend Team** — pins `packages/backend`, `packages/api`, `packages/shared`

## Key contacts

| Area | Owner |
|------|-------|
| Frontend | @frontend-team |
| Backend | @backend-team |
| DevOps | @platform-team |
| Design | @design-team |
