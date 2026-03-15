# Acme Platform — Demo Workspace

A fictional full-stack TypeScript monorepo used for Pinboard screenshots and manual demos.

## Structure

```
packages/
  frontend/   React + Vite app
  backend/    Express API server
  api/        Shared API contract & OpenAPI spec
  shared/     Types, utils, constants
docs/
  frontend/   Component guide, styling, routing
  backend/    Architecture, database, auth flow
  api/        Endpoint reference, changelog
scripts/      Build, deploy, seed helpers
.github/      CI workflows, PR template
```

## Demo setup

1. Open this repo in VS Code
2. Switch Pinboard to **Workspace** scope
3. Click the preset button and apply **Frontend Team** or **Backend Team**
4. Expand `packages/frontend/src` to show nested file browsing

## Presets (`.pinboard.json`)

| Preset | Pins |
|--------|------|
| Frontend Team | `packages/frontend/src`, `packages/shared`, `docs/frontend` |
| Backend Team | `packages/backend`, `packages/api`, `packages/shared` |
| Docs & Scripts | `docs`, `scripts`, `.github` |
