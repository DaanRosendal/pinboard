export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PRODUCT_STATUSES = ['active', 'draft', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PAGINATION_DEFAULTS = {
  page: 1,
  perPage: 25,
  maxPerPage: 100,
} as const;

export const API_BASE = '/api/v1';
