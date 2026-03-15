import React from 'react';
import { DataTable } from '../components/DataTable';
import { useData } from '../hooks/useData';
import type { Product } from '@acme/shared';

export function Products() {
  const { data: products, loading } = useData<Product[]>('/api/products');

  return (
    <main className="page page--products">
      <div className="page-header">
        <h1>Products</h1>
        <button className="btn btn--primary">+ New product</button>
      </div>
      <DataTable
        rows={products ?? []}
        loading={loading}
        emptyMessage="No products yet."
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'sku', header: 'SKU' },
          { key: 'price', header: 'Price', render: v => `$${v}` },
          { key: 'stock', header: 'Stock' },
          { key: 'status', header: 'Status' },
        ]}
      />
    </main>
  );
}
