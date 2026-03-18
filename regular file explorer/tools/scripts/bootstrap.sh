#!/usr/bin/env bash
set -euo pipefail

echo "→ Installing dependencies"
pnpm install

echo "→ Starting local services"
docker compose -f infra/docker/docker-compose.yml up -d

echo "→ Running migrations"
pnpm --filter @acme/db run migrate

echo "✓ Bootstrap complete"
