import { FormEvent, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Input, Label, Modal, Select, Switch, Table, type Column } from '@aurevo/design-system';
import { api } from '../../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InventoryRow {
  id: string;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  trackQuantity: boolean;
  allowBackorder: boolean;
  available: number | null;
  isLowStock: boolean;
  isOutOfStock: boolean;
  product?: { id: string; name: string; sku: string; status: string; supplier?: { name: string } | null };
  variant?: { id: string; name: string; sku: string } | null;
}

interface InventoryStats {
  totalProducts: number;
  trackingProducts: number;
  lowStock: number;
  outOfStock: number;
  totalUnitsInStock: number;
}

interface InventoryList {
  data: InventoryRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/*  Inventory page                                                     */
/* ------------------------------------------------------------------ */

export function Inventory() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [page, setPage] = useState(1);

  /* ── Edit modal state ────────────────────────────────────────────── */
  const [editTarget, setEditTarget] = useState<InventoryRow | null>(null);
  const [editForm, setEditForm] = useState({
    quantity: '',
    reservedQuantity: '',
    lowStockThreshold: '',
    trackQuantity: true,
    allowBackorder: false,
  });
  const [editError, setEditError] = useState<string | null>(null);

  /* ── Adjust modal state ──────────────────────────────────────────── */
  const [adjustTarget, setAdjustTarget] = useState<InventoryRow | null>(null);
  const [adjustment, setAdjustAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  /* ── Queries ─────────────────────────────────────────────────────── */
  const statsQuery = useQuery({
    queryKey: ['admin', 'inventory', 'stats'],
    queryFn: () => api.get<InventoryStats>('/inventory/stats').then((r) => r.data),
  });

  const listQuery = useQuery({
    queryKey: ['admin', 'inventory', page, filter],
    queryFn: () =>
      api
        .get<InventoryList>('/inventory', {
          params: {
            page,
            limit: PAGE_SIZE,
            ...(filter === 'low' ? { lowStock: 'true' } : {}),
            ...(filter === 'out' ? { outOfStock: 'true' } : {}),
          },
        })
        .then((r) => r.data),
  });

  const rows = listQuery.data?.data ?? [];
  const stats = statsQuery.data;

  /* ── Edit mutation (PATCH /inventory/:id) ────────────────────────── */
  const editMutation = useMutation({
    mutationFn: () => {
      const id = editTarget!.id;
      const qty = editForm.quantity !== '' ? Number(editForm.quantity) : undefined;
      const reserved = editForm.reservedQuantity !== '' ? Number(editForm.reservedQuantity) : undefined;
      const threshold = editForm.lowStockThreshold !== '' ? Number(editForm.lowStockThreshold) : undefined;
      if (qty != null && (!Number.isFinite(qty) || qty < 0)) throw new Error('Quantity must be a non-negative number.');
      if (reserved != null && (!Number.isFinite(reserved) || reserved < 0)) throw new Error('Reserved quantity must be a non-negative number.');
      if (threshold != null && (!Number.isFinite(threshold) || threshold < 0)) throw new Error('Low-stock threshold must be a non-negative number.');
      return api.patch(`/inventory/${id}`, {
        ...(qty != null ? { quantity: qty } : {}),
        ...(reserved != null ? { reservedQuantity: reserved } : {}),
        ...(threshold != null ? { lowStockThreshold: threshold } : {}),
        trackQuantity: editForm.trackQuantity,
        allowBackorder: editForm.allowBackorder,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      closeEditModal();
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.message ?? err?.message ?? 'Could not update inventory.');
    },
  });

  /* ── Adjust mutation (POST /inventory/:id/adjust) ────────────────── */
  const adjustMutation = useMutation({
    mutationFn: () => {
      const delta = Number(adjustment);
      if (!Number.isFinite(delta) || delta === 0) throw new Error('Enter a non-zero whole-number adjustment.');
      return api.post(`/inventory/${adjustTarget!.id}/adjust`, {
        adjustment: delta,
        reason: reason.trim() || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      closeAdjustModal();
    },
    onError: (err: any) => {
      setAdjustError(err?.response?.data?.message ?? err?.message ?? 'Could not adjust inventory.');
    },
  });

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function openEditModal(row: InventoryRow) {
    setEditTarget(row);
    setEditForm({
      quantity: String(row.quantity),
      reservedQuantity: String(row.reservedQuantity),
      lowStockThreshold: String(row.lowStockThreshold),
      trackQuantity: row.trackQuantity,
      allowBackorder: row.allowBackorder,
    });
    setEditError(null);
  }

  function closeEditModal() {
    setEditTarget(null);
    setEditError(null);
  }

  function openAdjustModal(row: InventoryRow) {
    setAdjustTarget(row);
    setAdjustAdjustment('');
    setReason('');
    setAdjustError(null);
  }

  function closeAdjustModal() {
    setAdjustTarget(null);
    setAdjustError(null);
  }

  /* ── Column definitions ──────────────────────────────────────────── */
  const columns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">{row.product?.name ?? '—'}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {row.product?.sku}
            {row.variant ? ` · ${row.variant.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'On hand',
      render: (row) => (
        <span className="text-sm tabular-nums text-[var(--color-text-primary)]">
          {row.trackQuantity ? row.quantity : '—'}
        </span>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      render: (row) => (
        <span className="text-sm tabular-nums text-[var(--color-text-secondary)]">
          {row.trackQuantity ? row.reservedQuantity : '—'}
        </span>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      render: (row) => (
        <span className="text-sm tabular-nums text-[var(--color-text-primary)]">
          {row.available === null ? '—' : row.available}
        </span>
      ),
    },
    {
      key: 'threshold',
      header: 'Threshold',
      render: (row) => (
        <span className="text-sm tabular-nums text-[var(--color-text-secondary)]">
          {row.lowStockThreshold}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        if (!row.trackQuantity) return <Badge variant="outline" size="sm">Not tracked</Badge>;
        if (row.isOutOfStock) return <Badge variant="error" size="sm">Out of stock</Badge>;
        if (row.isLowStock) return <Badge variant="warning" size="sm">Low stock</Badge>;
        return <Badge variant="success" size="sm">In stock</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      width: '160px',
      render: (row) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" onClick={() => openEditModal(row)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openAdjustModal(row)}>
            Adjust
          </Button>
        </div>
      ),
    },
  ];

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Inventory</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Stock levels and adjustments</p>
        </div>
        <Select
          value={filter}
          onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(1); }}
          options={[
            { value: 'all', label: 'All items' },
            { value: 'low', label: 'Low stock' },
            { value: 'out', label: 'Out of stock' },
          ]}
          className="w-44"
        />
      </div>

      {/* Stat cards */}
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Records', value: stats?.totalProducts, tone: 'text-[var(--color-text-primary)]' },
          { label: 'Tracking qty', value: stats?.trackingProducts, tone: 'text-[var(--color-text-primary)]' },
          { label: 'Low stock', value: stats?.lowStock, tone: 'text-amber-600' },
          { label: 'Out of stock', value: stats?.outOfStock, tone: 'text-red-600' },
          { label: 'Units in stock', value: stats?.totalUnitsInStock, tone: 'text-[var(--color-text-primary)]' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-secondary)]">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${s.tone}`}>
              {s.value === undefined ? '—' : s.value}
            </p>
          </div>
        ))}
      </div>

      {listQuery.error && (
        <Alert variant="error" className="mt-4">
          {listQuery.error instanceof Error ? listQuery.error.message : 'Could not load inventory.'}
        </Alert>
      )}

      <div className="mt-4">
        <Table
          columns={columns}
          data={rows}
          keyExtractor={(r) => r.id}
          loading={listQuery.isLoading}
          emptyMessage="No inventory records match this filter."
        />
      </div>

      {/* Pagination */}
      {listQuery.data && listQuery.data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--color-border-primary)] px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-[var(--color-text-secondary)]">
            Page {page} of {listQuery.data.meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(listQuery.data!.meta.totalPages, p + 1))}
            disabled={page >= listQuery.data.meta.totalPages}
            className="rounded-lg border border-[var(--color-border-primary)] px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* ── Edit modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={editTarget !== null}
        onClose={closeEditModal}
        title="Edit inventory"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeEditModal} disabled={editMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      >
        {editTarget && (
          <form
            onSubmit={(e: FormEvent) => { e.preventDefault(); editMutation.mutate(); }}
            className="space-y-4"
          >
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">{editTarget.product?.name ?? '—'}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {editTarget.product?.sku}
                {editTarget.variant ? ` · ${editTarget.variant.name}` : ''}
              </p>
            </div>

            {editError && <Alert variant="error">{editError}</Alert>}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="inv-qty">Quantity on hand</Label>
                <Input
                  id="inv-qty"
                  type="number"
                  min={0}
                  value={editForm.quantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inv-reserved">Reserved quantity</Label>
                <Input
                  id="inv-reserved"
                  type="number"
                  min={0}
                  value={editForm.reservedQuantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, reservedQuantity: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="inv-threshold">Low-stock threshold</Label>
              <Input
                id="inv-threshold"
                type="number"
                min={0}
                value={editForm.lowStockThreshold}
                onChange={(e) => setEditForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
              />
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Badge shows "Low stock" when on-hand quantity falls to or below this value.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Switch
                label="Track quantity"
                checked={editForm.trackQuantity}
                onChange={(checked) => setEditForm((f) => ({ ...f, trackQuantity: checked }))}
              />
              <Switch
                label="Allow backorders"
                checked={editForm.allowBackorder}
                onChange={(checked) => setEditForm((f) => ({ ...f, allowBackorder: checked }))}
              />
            </div>
          </form>
        )}
      </Modal>

      {/* ── Adjust modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={adjustTarget !== null}
        onClose={closeAdjustModal}
        title="Quick adjust"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeAdjustModal} disabled={adjustMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => adjustMutation.mutate()}
              disabled={adjustMutation.isPending}
            >
              {adjustMutation.isPending ? 'Adjusting…' : 'Apply adjustment'}
            </Button>
          </div>
        }
      >
        {adjustTarget && (
          <div className="space-y-4">
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">{adjustTarget.product?.name}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {adjustTarget.product?.sku}{adjustTarget.variant ? ` · ${adjustTarget.variant.name}` : ''}
              </p>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Current quantity: <span className="font-semibold tabular-nums">{adjustTarget.quantity}</span>
            </p>
            {adjustError && <Alert variant="error">{adjustError}</Alert>}
            <div className="space-y-1">
              <Label htmlFor="adj-delta">Adjustment</Label>
              <Input
                id="adj-delta"
                type="number"
                value={adjustment}
                onChange={(e) => setAdjustAdjustment(e.target.value)}
                placeholder="e.g. 5 to add, -3 to remove"
                autoFocus
              />
              <p className="text-xs text-[var(--color-text-tertiary)]">
                New quantity will be {adjustTarget.quantity} + ({adjustment || '0'}) = {adjustTarget.quantity + (Number(adjustment) || 0)}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-reason">Reason</Label>
              <Input
                id="adj-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Stock received, damaged, cycle count"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
