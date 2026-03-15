#!/usr/bin/env bash
set -euo pipefail

echo "Building all packages..."
npm run build --workspaces --if-present

echo "Done."
