#!/usr/bin/env bash
set -euo pipefail

TARGET=${1:-staging}
echo "→ Deploying to $TARGET"
kubectl config use-context "acme-$TARGET"
kubectl set image deployment/api-gateway api-gateway="ghcr.io/acme/api-gateway:${VERSION}"
kubectl set image deployment/auth-service auth-service="ghcr.io/acme/auth-service:${VERSION}"
kubectl rollout status deployment/api-gateway
kubectl rollout status deployment/auth-service
echo "✓ Deploy to $TARGET complete"
