CREATE TYPE role AS ENUM ('admin', 'member', 'viewer');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
