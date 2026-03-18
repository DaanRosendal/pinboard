# Deployment Runbook

## Staging

Staging deploys automatically on every push to `main`.

## Production

1. Create and push a version tag: `git tag v1.x.x && git push origin v1.x.x`
2. GitHub Actions builds and pushes images tagged with the version
3. Run: `VERSION=1.x.x ./tools/scripts/release.sh production`
4. Monitor rollout: `kubectl rollout status deployment/api-gateway -n acme-platform`
