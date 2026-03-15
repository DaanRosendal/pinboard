import React from 'react';
import { DataTable } from '../components/DataTable';
import { useData } from '../hooks/useData';
import type { Order } from '@acme/shared';

export function Dashboard() {
  const { data: recentOrders, loading } = useData<Order[]>('/api/orders?limit=10');

  return (
    <main className="page page--dashboard">
      <h1>Dashboard</h1>

      <section className="stats-grid">
        <StatCard label="Revenue (MTD)" value="$48,320" delta="+12%" />
        <StatCard label="Orders (MTD)" value="1,204" delta="+8%" />
        <StatCard label="Customers" value="9,871" delta="+3%" />
        <StatCard label="Churn Rate" value="1.4%" delta="-0.2%" />
      </section>

      <section>
        <h2>Recent Orders</h2>
        <DataTable
          rows={recentOrders ?? []}
          loading={loading}
          columns={[
            { key: 'id', header: 'Order ID' },
            { key: 'customerName', header: 'Customer' },
            { key: 'total', header: 'Total', render: v => `$${v}` },
            { key: 'status', header: 'Status' },
          ]}
        />
      </section>
    </main>
  );
}

function StatCard({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__delta">{delta}</span>
    </div>
  );
}
