#!/usr/bin/env bash
set -euo pipefail

echo "Type-checking..."
npm run typecheck

echo "Linting..."
npm run lint

echo "Running tests..."
npm test

echo "All checks passed."
