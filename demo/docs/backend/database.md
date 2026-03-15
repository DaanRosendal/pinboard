# Database Guide

## Migrations

Migrations live in `src/db/migrations/` as numbered SQL files:
```
001_create_users.sql
002_create_products.sql
003_create_orders.sql
```

Run with: `npm run migrate`

Never edit existing migration files. Add a new numbered file for every schema change.

## Conventions

- UUIDs as primary keys (`gen_random_uuid()`)
- `created_at` on every table, `updated_at` where rows are mutable
- Foreign keys with `ON DELETE CASCADE` unless otherwise specified
- Status columns use `CHECK` constraints, not enum types (easier to alter)

## Indexes

Add an index for every column used in a `WHERE` clause in hot paths. Document the query it supports in a comment above the `CREATE INDEX` statement.

## Local setup

```bash
docker compose up postgres -d
npm run migrate
npm run seed        # loads demo data
```
