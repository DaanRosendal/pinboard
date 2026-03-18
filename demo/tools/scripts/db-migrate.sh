#!/usr/bin/env bash
set -euo pipefail

ENV=${1:-development}
echo "→ Running migrations for env: $ENV"
DATABASE_URL="${DATABASE_URL}" pnpm --filter @acme/db run migrate
echo "✓ Migrations complete"
