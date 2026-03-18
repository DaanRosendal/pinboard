#!/usr/bin/env bash
set -euo pipefail
echo "→ Linting all packages"
pnpm run lint
echo "✓ Lint complete"
