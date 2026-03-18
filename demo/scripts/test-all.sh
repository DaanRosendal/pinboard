#!/usr/bin/env bash
set -euo pipefail
echo "→ Running all tests"
pnpm run test
echo "→ Running E2E tests"
pnpm --filter @acme/e2e test
echo "✓ All tests complete"
