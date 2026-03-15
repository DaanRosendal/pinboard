CREATE TABLE products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  sku        TEXT NOT NULL UNIQUE,
  price      NUMERIC(10, 2) NOT NULL,
  stock      INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_sku_idx ON products (sku);
