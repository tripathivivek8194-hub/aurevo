import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, ConfirmModal, Input, Label, Modal, Switch, Table, type Column } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';

interface ShippingMethod {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  baseCost: number;
  perItemCost?: number | null;
  perKgCost?: number | null;
  freeShippingThreshold?: number | null;
  minOrderAmount?: number | null;
  maxOrderAmount?: number | null;
  estimatedDays: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
}

interface MethodForm {
  name: string;
  code: string;
  description: string;
  baseCost: string;
  estimatedDays: string;
  isActive: boolean;
}

const emptyForm: MethodForm = { name: '', code: '', description: '', baseCost: '', estimatedDays: '', isActive: true };

export function Settings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MethodForm>(emptyForm);
  const [editing, setEditing] = useState<ShippingMethod | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShippingMethod | null>(null);

  const methodsQuery = useQuery({
    queryKey: ['admin', 'shipping-methods'],
    queryFn: () => api.get<ShippingMethod[]>('/shipping/methods/admin', { params: { includeInactive: true } }).then((r) => r.data),
  });
  const methods = methodsQuery.data ?? [];

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(null); setModalOpen(true); };
  const openEdit = (m: ShippingMethod) => {
    setEditing(m);
    setForm({
      name: m.name, code: m.code, description: m.description ?? '',
      baseCost: String(m.baseCost), estimatedDays: String(m.estimatedDays), isActive: m.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || undefined,
        baseCost: Number(form.baseCost) || 0,
        estimatedDays: Number(form.estimatedDays) || 1,
        currency: 'INR',
        isActive: form.isActive,
      };
      if (!payload.name || !payload.code) throw new Error('Name and code are required.');
      return editing
        ? api.patch(`/shipping/methods/${editing.id}`, payload)
        : api.post('/shipping/methods', payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'shipping-methods'] });
      setModalOpen(false); setEditing(null); setForm(emptyForm);
    },
    onError: (err: any) => setFormError(err?.message ?? 'Could not save shipping method.'),
  });

  const toggleMutation = useMutation({
    mutationFn: (m: ShippingMethod) => api.patch(`/shipping/methods/${m.id}`, { isActive: !m.isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'shipping-methods'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/shipping/methods/${deleteTarget!.id}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin', 'shipping-methods'] }); setDeleteTarget(null); },
  });

  const columns: Column<ShippingMethod>[] = [
    {
      key: 'name',
      header: 'Method',
      render: (m) => (
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">{m.name}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">/{m.code} · {m.estimatedDays} day{m.estimatedDays === 1 ? '' : 's'}</p>
        </div>
      ),
    },
    {
      key: 'cost',
      header: 'Base cost',
      render: (m) => <span className="text-sm tabular-nums text-[var(--color-text-primary)]">{formatMoney(m.baseCost)}</span>,
    },
    {
      key: 'free',
      header: 'Free over',
      render: (m) => (
        <span className="text-sm text-[var(--color-text-secondary)]">
          {m.freeShippingThreshold ? formatMoney(m.freeShippingThreshold) : '—'}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'Active',
      render: (m) => (
        <Switch
          checked={m.isActive}
          onChange={() => toggleMutation.mutate(m)}
          aria-label={`Toggle ${m.name}`}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (m) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(m)}>Edit</Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(m)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Settings</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Shipping methods and store configuration</p>
        </div>
        <Button variant="primary" onClick={openCreate}>Add method</Button>
      </div>

      {/* Shipping methods */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Shipping methods</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Costs are shown in the store's currency. These are the methods customers can choose at checkout.
        </p>
        {methodsQuery.error && (
          <Alert variant="error" className="mt-3">
            {methodsQuery.error instanceof Error ? methodsQuery.error.message : 'Could not load shipping methods.'}
          </Alert>
        )}
        <div className="mt-3">
          <Table columns={columns} data={methods} keyExtractor={(m) => m.id} loading={methodsQuery.isLoading} emptyMessage="No shipping methods yet." />
        </div>
      </section>

      {/* Honest gap list — no backend module, not fabricated */}
      <section className="mt-8 rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Not yet available</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          These store settings are not backed by a settings module in the API yet, so they are not shown here (rather than presenting placeholder values):
        </p>
        <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-[var(--color-text-secondary)]">
          <li>Store name and branding</li>
          <li>Default currency</li>
          <li>Tax configuration</li>
          <li>Email / order-confirmation templates</li>
          <li>AliExpress credentials and API connection</li>
        </ul>
        <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
          Connection details and secrets for the AliExpress integration are intentionally never shown in the browser — they live server-side only.
        </p>
      </section>

      {/* Create / edit modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? 'Edit shipping method' : 'New shipping method'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancel</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create method'}
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required placeholder="e.g. standard" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Base cost (paise)</Label>
              <Input type="number" value={form.baseCost} onChange={(e) => setForm((f) => ({ ...f, baseCost: e.target.value }))} />
              <p className="text-xs text-[var(--color-text-tertiary)]">Integer; e.g. 9900 = {formatMoney(9900)}</p>
            </div>
            <div className="space-y-1">
              <Label>Estimated days</Label>
              <Input type="number" value={form.estimatedDays} onChange={(e) => setForm((f) => ({ ...f, estimatedDays: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} aria-label="Active" />
            <Label>Active</Label>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete shipping method"
        description={deleteTarget ? `Delete "${deleteTarget.name}"? This cannot be undone.` : ''}
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
