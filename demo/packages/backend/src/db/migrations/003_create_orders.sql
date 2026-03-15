CREATE TABLE orders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  items      JSONB NOT NULL DEFAULT '[]',
  total      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_id_idx ON orders (user_id);
CREATE INDEX orders_status_idx  ON orders (status);
CREATE INDEX orders_created_idx ON orders (created_at DESC);
