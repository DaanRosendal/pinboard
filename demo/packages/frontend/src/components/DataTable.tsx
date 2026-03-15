import React from 'react';

interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  loading,
  emptyMessage = 'No results.',
}: DataTableProps<T>) {
  if (loading) return <div className="table-spinner">Loading…</div>;
  if (rows.length === 0) return <p className="table-empty">{emptyMessage}</p>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map(col => <th key={String(col.key)}>{col.header}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id}>
            {columns.map(col => (
              <td key={String(col.key)}>
                {col.render ? col.render(row[col.key], row) : String(row[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
