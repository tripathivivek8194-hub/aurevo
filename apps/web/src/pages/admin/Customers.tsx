import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, CardContent, Modal, Spinner, Table,
} from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatDate, formatMoney, initialsof } from '../../lib/format';

interface Customer {
  id: string; email: string; name: string; totalSpent: number; orderCount: number;
  reviewCount: number; lastOrderDate: string | null; createdAt: string;
}
interface OrderRow {
  id: string; orderNumber: string; total: number; status: string; createdAt: string;
}
interface OrderPage { data: OrderRow[]; meta: { total: number } }

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
  DELIVERED: 'success', PAID: 'success', PAYMENT_PENDING: 'warning',
  PROCESSING: 'info', PENDING: 'info', SHIPPED: 'info',
  CANCELLED: 'error', FAILED: 'error', REFUNDED: 'error', RETURNED: 'error',
};

export function Customers() {
  const [selected, setSelected] = useState<Customer | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: () => api.get<Customer[]>('/admin/reports/customers').then((r) => r.data),
  });

  const ordersQuery = useQuery({
    queryKey: ['admin', 'customers', selected?.id],
    enabled: !!selected,
    queryFn: () =>
      api
        .get<OrderPage>('/orders', { params: { userId: selected!.id, limit: 20 } })
        .then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {data ? `${data.length} customers` : 'Loading…'}
        </p>
      </header>

      <Card>
        <CardContent className="overflow-x-auto">
          {isError ? (
            <Alert variant="error">{error instanceof Error ? error.message : 'Failed to load customers'}</Alert>
          ) : isLoading ? (
            <div className="flex justify-center py-10"><Spinner label="Loading customers…" /></div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">No customers yet.</p>
          ) : (
            <Table
              data={data}
              keyExtractor={(c) => c.id}
              onRowClick={(c) => setSelected(c)}
              emptyMessage="No customers yet."
              columns={[
                {
                  key: 'name', header: 'Customer',
                  render: (c) => (
                    <span className="font-medium">
                      <span className="mr-2 text-[var(--color-text-secondary)]">{initialsof(c.name.split(' ')[0], c.name.split(' ')[1])}</span>
                      {c.name}
                    </span>
                  ),
                },
                { key: 'email', header: 'Email', render: (c) => c.email },
                { key: 'orderCount', header: 'Orders', render: (c) => c.orderCount },
                { key: 'reviewCount', header: 'Reviews', render: (c) => c.reviewCount },
                { key: 'totalSpent', header: 'Total spent', render: (c) => formatMoney(c.totalSpent) },
                { key: 'lastOrderDate', header: 'Last order', render: (c) => formatDate(c.lastOrderDate) },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? selected.name : 'Customer'}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[var(--color-interactive-primary)] text-white flex items-center justify-center font-semibold">
                {initialsof(selected.name.split(' ')[0], selected.name.split(' ')[1])}
              </div>
              <div>
                <div className="font-semibold">{selected.name}</div>
                <div className="text-sm text-[var(--color-text-secondary)]">{selected.email}</div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-[var(--color-text-secondary)]">Customer since</dt><dd className="text-right">{formatDate(selected.createdAt)}</dd>
              <dt className="text-[var(--color-text-secondary)]">Orders</dt><dd className="text-right">{selected.orderCount}</dd>
              <dt className="text-[var(--color-text-secondary)]">Reviews</dt><dd className="text-right">{selected.reviewCount}</dd>
              <dt className="text-[var(--color-text-secondary)]">Total spent</dt><dd className="text-right font-medium">{formatMoney(selected.totalSpent)}</dd>
              <dt className="text-[var(--color-text-secondary)]">Last order</dt><dd className="text-right">{formatDate(selected.lastOrderDate)}</dd>
            </dl>

            <div className="border-t border-[var(--color-border)] pt-3">
              <div className="text-sm font-medium mb-2">Order history</div>
              {ordersQuery.isLoading ? (
                <div className="flex justify-center py-6"><Spinner label="Loading orders…" /></div>
              ) : !ordersQuery.data || ordersQuery.data.data.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No orders yet.</p>
              ) : (
                <Table
                  data={ordersQuery.data.data}
                  keyExtractor={(o) => o.id}
                  emptyMessage="No orders yet."
                  columns={[
                    { key: 'orderNumber', header: 'Order', render: (o) => <span className="font-medium">{o.orderNumber}</span> },
                    { key: 'total', header: 'Total', render: (o) => formatMoney(o.total) },
                    { key: 'status', header: 'Status', render: (o) => <Badge variant={statusVariant[o.status] ?? 'default'}>{o.status}</Badge> },
                    { key: 'createdAt', header: 'Date', render: (o) => formatDate(o.createdAt) },
                  ]}
                />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
