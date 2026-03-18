# Local Development

## Running individual apps

```bash
pnpm --filter @acme/web dev         # Next.js web app on :3000
pnpm --filter @acme/admin dev       # Vite admin on :3001
pnpm --filter @acme/api-gateway dev # API Gateway on :4000
```

## Database

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres
./tools/scripts/db-migrate.sh
```
