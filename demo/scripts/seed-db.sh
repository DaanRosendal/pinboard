#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://acme:secret@localhost:5432/acme}"

echo "Seeding database at $DB_URL..."

psql "$DB_URL" <<'SQL'
INSERT INTO users (email, password_hash, name, role)
VALUES
  ('admin@acme.example.com', '$2b$12$placeholder', 'Admin User', 'admin'),
  ('alice@acme.example.com', '$2b$12$placeholder', 'Alice',      'member'),
  ('bob@acme.example.com',   '$2b$12$placeholder', 'Bob',        'member')
ON CONFLICT (email) DO NOTHING;

INSERT INTO products (name, sku, price, stock, status)
VALUES
  ('Basic Plan',    'PLAN-BASIC',    9.00,  999, 'active'),
  ('Pro Plan',      'PLAN-PRO',     29.00,  999, 'active'),
  ('Business Plan', 'PLAN-BIZ',     99.00,  999, 'active'),
  ('Legacy Add-on', 'ADDON-LEGACY',  5.00,    0, 'archived')
ON CONFLICT (sku) DO NOTHING;
SQL

echo "Seed complete."
