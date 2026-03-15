import type { Product } from '@acme/shared';

export interface ListProductsResponse { products: Product[] }
export interface GetProductResponse { product: Product }

export interface CreateProductBody {
  name: string;
  sku: string;
  price: number;
  stock: number;
}

export interface UpdateProductBody {
  name?: string;
  price?: number;
  stock?: number;
  status?: Product['status'];
}
