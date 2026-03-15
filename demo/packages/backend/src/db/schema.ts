// Canonical table definitions — keep in sync with migrations/

export const TABLES = {
  users: 'users',
  products: 'products',
  orders: 'orders',
  order_items: 'order_items',
  sessions: 'sessions',
} as const;

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'member';
  created_at: Date;
  updated_at: Date;
}

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: 'active' | 'draft' | 'archived';
  created_at: Date;
}

export interface OrderRow {
  id: string;
  user_id: string;
  items: string;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  created_at: Date;
}
