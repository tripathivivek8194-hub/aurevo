import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Modal, Select, Spinner, Table,
} from '@aurevo/design-system';
import { api, ApiError } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';

interface Meta { total: number; page: number; limit: number; totalPages: number; }
interface OrderRow {
  id: string; orderNumber: string; total: number; status: string; createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string } | null;
  _count: { items: number };
}
interface OrderDetail extends OrderRow {
  email: string; subtotal: number; shippingCost: number; tax: number; discount: number;
  notes?: string | null; shippingAddress?: Record<string, unknown> | null;
  items: { id: string; productName: string; quantity: number; unitPrice: number; totalPrice: number }[];
}

/** Mirror of the backend transition map — the backend remains the validator. */
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PAID', 'CANCELLED', 'FAILED'],
  PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['FULFILLMENT', 'CANCELLED'],
  FULFILLMENT: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED', 'REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
  FAILED: ['PAYMENT_PENDING', 'CANCELLED'],
  RETURNED: ['REFUNDED'],
};
const ALL_STATUSES = Object.keys(TRANSITIONS);

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
  DELIVERED: 'success', PAID: 'success', PAYMENT_PENDING: 'warning',
  PROCESSING: 'info', PENDING: 'info', SHIPPED: 'info',
  CANCELLED: 'error', FAILED: 'error', REFUNDED: 'error', RETURNED: 'error',
};

export function Orders() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const listQuery = useQuery({
    queryKey: ['admin', 'orders', page, status],
    queryFn: () =>
      api
        .get<{ data: OrderRow[]; meta: Meta }>('/orders', {
          params: { page, limit: 10, ...(status ? { status } : {}) },
        })
        .then((r) => r.data),
  });

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setActionError(null);
    try {
      const res = await api.get<OrderDetail>(`/orders/${id}`).then((r) => r.data);
      setDetail(res);
    } catch {
      setDetail(null);
    }
  };

  const changeStatus = async (next: string) => {
    if (!selectedId) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.patch(`/orders/${selectedId}/status`, { status: next });
      await listQuery.refetch();
      setDetail(null);
      if (selectedId) void openDetail(selectedId);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!selectedId) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/orders/${selectedId}/cancel`, { reason: 'Cancelled from admin dashboard' });
      await listQuery.refetch();
      setDetail(null);
      if (selectedId) void openDetail(selectedId);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  const meta = listQuery.data?.meta;
  const rows = listQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {meta ? `${meta.total} orders` : 'Loading…'}
          </p>
        </div>
        <div className="w-52">
          <Select
            label="Status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            placeholder="All statuses"
            options={ALL_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </header>

      <Card>
        <CardContent className="overflow-x-auto">
          {listQuery.isError ? (
            <Alert variant="error">
              {listQuery.error instanceof Error ? listQuery.error.message : 'Failed to load orders'}
            </Alert>
          ) : listQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner label="Loading orders…" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">No orders{status ? ` with status ${status}` : ''}.</p>
          ) : (
            <Table
              data={rows}
              keyExtractor={(o) => o.id}
              onRowClick={(o) => void openDetail(o.id)}
              emptyMessage="No orders found."
              columns={[
                { key: 'orderNumber', header: 'Order', render: (o) => <span className="font-medium">{o.orderNumber}</span> },
                { key: 'customer', header: 'Customer', render: (o) => (o.user ? `${o.user.firstName} ${o.user.lastName}` : 'Guest') },
                { key: 'items', header: 'Items', render: (o) => o._count.items },
                { key: 'total', header: 'Total', render: (o) => formatMoney(o.total) },
                { key: 'status', header: 'Status', render: (o) => <Badge variant={statusVariant[o.status] ?? 'default'}>{o.status}</Badge> },
                { key: 'createdAt', header: 'Date', render: (o) => formatDate(o.createdAt) },
              ]}
            />
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-[var(--color-text-secondary)]">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order detail */}
      <Modal
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="Order detail"
        size="lg"
      >
        {!detail ? (
          <div className="flex justify-center py-10"><Spinner label="Loading order…" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="font-semibold">{detail.orderNumber}</div>
              <Badge variant={statusVariant[detail.status] ?? 'default'}>{detail.status}</Badge>
            </div>
            <div className="text-sm text-[var(--color-text-secondary)]">
              Placed {formatDate(detail.createdAt)} · {detail.email}
            </div>

            {actionError && <Alert variant="error">{actionError}</Alert>}

            {/* Items */}
            <Table
              data={detail.items}
              keyExtractor={(it) => it.id}
              emptyMessage="No items."
              columns={[
                { key: 'productName', header: 'Item', render: (it) => it.productName },
                { key: 'quantity', header: 'Qty', render: (it) => it.quantity },
                { key: 'unitPrice', header: 'Unit', render: (it) => formatMoney(it.unitPrice) },
                { key: 'totalPrice', header: 'Total', render: (it) => formatMoney(it.totalPrice) },
              ]}
            />

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-[var(--color-text-secondary)]">Subtotal</dt><dd className="text-right">{formatMoney(detail.subtotal)}</dd>
              <dt className="text-[var(--color-text-secondary)]">Shipping</dt><dd className="text-right">{formatMoney(detail.shippingCost)}</dd>
              <dt className="text-[var(--color-text-secondary)]">Tax</dt><dd className="text-right">{formatMoney(detail.tax)}</dd>
              <dt className="text-[var(--color-text-secondary)]">Discount</dt><dd className="text-right">-{formatMoney(detail.discount)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatMoney(detail.total)}</dd>
            </dl>

            {detail.notes && (
              <Alert variant="info">Notes: {detail.notes}</Alert>
            )}

            {/* Status actions — backend validates each transition */}
            <div className="border-t border-[var(--color-border)] pt-3">
              <div className="text-sm font-medium mb-2">Change status</div>
              {TRANSITIONS[detail.status]?.length ? (
                <div className="flex flex-wrap gap-2">
                  {TRANSITIONS[detail.status].map((next) => (
                    <Button key={next} variant="outline" size="sm" disabled={busy} onClick={() => void changeStatus(next)}>
                      {next === 'CANCELLED' ? 'Cancel' : `→ ${next}`}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-secondary)]">No further transitions allowed from {detail.status}.</p>
              )}
              {TRANSITIONS[detail.status]?.includes('CANCELLED') && (
                <div className="mt-2">
                  <Button variant="destructive" size="sm" disabled={busy} onClick={() => void cancelOrder()}>
                    Cancel order
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
