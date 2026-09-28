import { FormEvent, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, CardContent, Checkbox, ConfirmModal, Input, Label,
  Modal, Select, Spinner, Table, Textarea,
} from '@aurevo/design-system';
import { api, ApiError } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { computeMinSellPrice, validateMargin, marginTone, MIN_MARGIN_PCT } from '@aurevo/shared';

interface Meta { total: number; page: number; limit: number; totalPages: number; }
interface Category { id: string; name: string; slug: string; }
interface Variant { id: string; name: string; sku: string; price: number; isActive?: boolean; }
interface Image { id: string; url: string; alt?: string | null; isPrimary?: boolean; }
interface Product {
  id: string; name: string; slug: string; sku: string; basePrice: number; currency: string;
  status: string; isFeatured?: boolean; description?: string; categoryId?: string;
  cost?: number | null;  // paise — admin reads only; the storefront never sees it
  marginPct?: number | null;
  variants?: Variant[]; images?: Image[];
  inventory?: { quantity: number; reservedQuantity: number; lowStockThreshold?: number; trackQuantity?: boolean; allowBackorder?: boolean; variantId?: string | null }[];
  category?: { name: string } | null;
}
interface ProductList { data: Product[]; meta: Meta; }

const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
  ACTIVE: 'success', DRAFT: 'warning', ARCHIVED: 'default',
};

interface FormState {
  name: string; slug: string; sku: string; description: string; basePrice: string;
  compareAtPrice: string; currency: string; status: string; categoryId: string;
  isFeatured: boolean; trackQuantity: boolean; allowBackorder: boolean;
  initialQuantity: string; lowStockThreshold: string;
  cost: string;  // NEW: landed cost in paise/INR
}
const emptyForm: FormState = {
  name: '', slug: '', sku: '', description: '', basePrice: '', compareAtPrice: '',
  currency: 'INR', status: 'DRAFT', categoryId: '', isFeatured: false,
  trackQuantity: true, allowBackorder: false, initialQuantity: '', lowStockThreshold: '',
  cost: '',
};

export function Products() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [variantForm, setVariantForm] = useState({ name: '', sku: '', price: '' });
  const [imageUrl, setImageUrl] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Cost / margin readout ────────────────────────────────────────────────
  // The cost input is in ₹ (whole rupees) because that's how sellers think;
  // it is converted to paise (×100) for the shared helpers and the DTO, which
  // store everything in minor units. basePrice stays in paise (existing form).
  const costNum = form.cost !== '' ? Number(form.cost) : NaN;
  const hasValidCost = Number.isFinite(costNum) && costNum > 0;
  const costPaise = hasValidCost ? Math.round(costNum * 100) : 0;
  const priceNum = form.basePrice !== '' ? Number(form.basePrice) : NaN;
  const hasValidPrice = Number.isFinite(priceNum) && priceNum > 0;
  // Suggested sell price = cost / (1 - 0.30), rounded up (same source of truth
  // as the backend — imported, never reimplemented).
  const suggestedPaise = computeMinSellPrice(costPaise);
  // Live margin % for the current basePrice vs the cost floor.
  const marginCheck = validateMargin(costPaise, hasValidPrice ? priceNum : 0);
  const marginShown = hasValidCost ? marginCheck.marginPct : null;
  const marginToneClass = ({
    unknown: 'text-[var(--color-text-tertiary)]',
    critical: 'text-[var(--color-status-error)]',
    warning: 'text-[var(--color-status-warning)]',
    good: 'text-[var(--color-status-success)]',
  }[marginTone(marginShown)]);
  // A product can only be ACTIVE once it has landed-cost data.
  const canBeActive = hasValidCost;

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories').then((r) => r.data),
  });

  const listQuery = useQuery({
    queryKey: ['admin', 'products', page, search, status],
    queryFn: () =>
      api
        .get<ProductList>('/admin/products', {
          params: { page, limit: 24, ...(status ? { status } : {}), ...(search ? { search } : {}) },
        })
        .then((r) => r.data),
  });

  const resetForm = (p: Product | null) => {
    const inv = p?.inventory?.find((i) => i.variantId == null);
    setForm(
      p
        ? {
            name: p.name, slug: p.slug, sku: p.sku, description: p.description ?? '',
            basePrice: String(p.basePrice), compareAtPrice: '', currency: p.currency,
            status: p.status, categoryId: p.categoryId ?? '',
            isFeatured: !!p.isFeatured,
            trackQuantity: inv?.trackQuantity ?? true,
            allowBackorder: inv?.allowBackorder ?? false,
            initialQuantity: inv ? String(inv.quantity) : '',
            lowStockThreshold: inv?.lowStockThreshold != null ? String(inv.lowStockThreshold) : '',
            cost: (p as any).cost != null ? String((p as any).cost / 100) : '',
          }
        : emptyForm,
    );
    setVariantForm({ name: '', sku: '', price: '' });
    setImageUrl('');
    setFormError(null);
  };

  const openCreate = () => { resetForm(null); setEditing(null); setCreateOpen(true); };
  const openEdit = (p: Product) => { resetForm(p); setEditing(p); setCreateOpen(true); };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const costPayload = hasValidCost ? Math.round(costNum * 100) : undefined;
    if (form.status === 'ACTIVE' && !costPayload) {
      setFormError('A landed cost is required before a product can go ACTIVE — the 30% minimum margin needs a cost floor.');
      setSaving(false);
      return;
    }
    const payload = {
      name: form.name, slug: form.slug || undefined, sku: form.sku,
      description: form.description, basePrice: Number(form.basePrice),
      cost: costPayload,
      compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : undefined,
      currency: form.currency, status: form.status, categoryId: form.categoryId,
      isFeatured: form.isFeatured, trackQuantity: form.trackQuantity,
      allowBackorder: form.allowBackorder,
      ...(form.initialQuantity !== '' ? { initialQuantity: Number(form.initialQuantity) } : {}),
      ...(form.lowStockThreshold !== '' ? { lowStockThreshold: Number(form.lowStockThreshold) } : {}),
    };
    try {
      if (editing) {
        await api.patch(`/products/${editing.id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      setCreateOpen(false);
      await listQuery.refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const addVariant = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.post(`/products/${editing.id}/variants`, {
        name: variantForm.name, sku: variantForm.sku, price: Number(variantForm.price),
      });
      setVariantForm({ name: '', sku: '', price: '' });
      await refreshEditingDetail();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Variant add failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteVariant = async (variantId: string) => {
    if (!editing) return;
    await api.delete(`/products/${editing.id}/variants/${variantId}`);
    await refreshEditingDetail();
  };

  const addImage = async () => {
    if (!editing || !imageUrl) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.post(`/products/${editing.id}/images`, { url: imageUrl });
      setImageUrl('');
      await refreshEditingDetail();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Image add failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteImage = async (imageId: string) => {
    if (!editing) return;
    await api.delete(`/products/images/${imageId}`);
    await refreshEditingDetail();
  };

  const refreshEditingDetail = async () => {
    const res = await api.get<Product>(`/admin/products/${editing!.id}`).then((r) => r.data);
    setEditing(res);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/products/${deleteTarget.id}`);
      setDeleteTarget(null);
      await listQuery.refetch();
    } finally {
      setDeleting(false);
    }
  };

  const meta = listQuery.data?.meta;
  const rows = listQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">{meta ? `${meta.total} products` : 'Loading…'}</p>
        </div>
        <Button variant="primary" onClick={openCreate}>New product</Button>
      </header>

      <div className="flex flex-wrap gap-4">
        <Input
          placeholder="Search products…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
        <div className="w-44">
          <Select
            label="Status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            placeholder="All statuses"
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto">
          {listQuery.isError ? (
            <Alert variant="error">{listQuery.error instanceof Error ? listQuery.error.message : 'Failed to load products'}</Alert>
          ) : listQuery.isLoading ? (
            <div className="flex justify-center py-10"><Spinner label="Loading products…" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">No products found.</p>
          ) : (
            <Table
              data={rows}
              keyExtractor={(p) => p.id}
              emptyMessage="No products found."
              columns={[
                { key: 'name', header: 'Product', render: (p) => <span className="font-medium">{p.name}</span> },
                { key: 'sku', header: 'SKU', render: (p) => p.sku },
                { key: 'basePrice', header: 'Price', render: (p) => formatMoney(p.basePrice) },
                { key: 'marginPct', header: 'Margin', render: (p) => {
                  if (p.marginPct == null) return <span className="text-[var(--color-text-secondary)]">—</span>;
                  const tone = marginTone(p.marginPct);
                  const cls = tone === 'good' ? 'text-[var(--color-status-success)]'
                    : tone === 'warning' ? 'text-[var(--color-status-warning)]'
                    : 'text-[var(--color-status-error)]';
                  return <span className={cls}>{p.marginPct.toFixed(1)}%</span>;
                }},
                { key: 'status', header: 'Status', render: (p) => <Badge variant={statusVariant[p.status] ?? 'default'}>{p.status}</Badge> },
                { key: 'category', header: 'Category', render: (p) => p.category?.name ?? '—' },
                { key: 'stock', header: 'Stock', render: (p) => (p.inventory?.[0] ? `${p.inventory[0].quantity - p.inventory[0].reservedQuantity} available` : '—') },
                {
                  key: 'actions', header: '',
                  render: (p) => (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(p)}>Delete</Button>
                    </div>
                  ),
                },
              ]}
            />
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm text-[var(--color-text-secondary)]">Page {meta.page} of {meta.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / edit modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New product'}
        size="full"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <LabeledInput label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <LabeledInput label="SKU" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} required />
            <LabeledInput label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} />
            <LabeledInput label="Base price (paise)" type="number" value={form.basePrice} onChange={(v) => setForm({ ...form, basePrice: v })} required />
            <div className="space-y-1">
              <Label>Landed cost (₹)</Label>
              <Input type="number" step="0.01" value={form.cost} required={canBeActive} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              {hasValidCost && (
                <>
                  <p className="text-xs text-[var(--color-text-secondary)]">Suggested sell price: {formatMoney(suggestedPaise!)}</p>
                  <p className={`text-xs font-medium ${marginToneClass}`}>
                    Live margin: {marginShown!.toFixed(2)}% ({marginTone(marginShown)})
                  </p>
                </>
              )}
              {!hasValidCost && form.status === 'ACTIVE' && (
                <p className="text-xs text-[var(--color-status-error)]">Cannot publish ACTIVE without landed cost.</p>
              )}
            </div>
            <LabeledInput label="Compare-at (paise)" type="number" value={form.compareAtPrice} onChange={(v) => setForm({ ...form, compareAtPrice: v })} />
            <LabeledInput label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} required />
          </div>
          <LabeledTextarea label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="p-status">Status</Label>
              <Select
                id="p-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                options={STATUSES.map((s) => ({ value: s, label: s, disabled: s === 'ACTIVE' && !hasValidCost }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-category">Category</Label>
              <Select
                id="p-category"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                placeholder="Select category"
                options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <LabeledInput label="Quantity" type="number" value={form.initialQuantity} onChange={(v) => setForm({ ...form, initialQuantity: v })} />
            <LabeledInput label="Low stock threshold" type="number" value={form.lowStockThreshold} onChange={(v) => setForm({ ...form, lowStockThreshold: v })} />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isFeatured} onChange={(c) => setForm({ ...form, isFeatured: !!c })} />
              Featured
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.trackQuantity} onChange={(c) => setForm({ ...form, trackQuantity: !!c })} />
              Track quantity
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.allowBackorder} onChange={(c) => setForm({ ...form, allowBackorder: !!c })} />
              Allow backorder
            </label>
          </div>

          {editing && (
            <>
              {/* Variants */}
              <div className="border-t border-[var(--color-border)] pt-3">
                <div className="text-sm font-medium mb-2">Variants</div>
                {editing.variants && editing.variants.length > 0 && (
                  <Table
                    data={editing.variants}
                    keyExtractor={(v) => v.id}
                    emptyMessage="No variants."
                    columns={[
                      { key: 'name', header: 'Name', render: (v) => v.name },
                      { key: 'sku', header: 'SKU', render: (v) => v.sku },
                      { key: 'price', header: 'Price', render: (v) => formatMoney(v.price) },
                      { key: 'actions', header: '', render: (v) => <Button variant="ghost" size="sm" onClick={() => void deleteVariant(v.id)}>Remove</Button> },
                    ]}
                  />
                )}
                <div className="flex gap-2 items-end">
                  <LabeledInput label="Variant name" value={variantForm.name} onChange={(v) => setVariantForm({ ...variantForm, name: v })} />
                  <LabeledInput label="SKU" value={variantForm.sku} onChange={(v) => setVariantForm({ ...variantForm, sku: v })} />
                  <LabeledInput label="Price" type="number" value={variantForm.price} onChange={(v) => setVariantForm({ ...variantForm, price: v })} />
                  <Button type="button" variant="outline" onClick={() => void addVariant()} disabled={saving}>Add</Button>
                </div>
              </div>

              {/* Images */}
              <div className="border-t border-[var(--color-border)] pt-3">
                <div className="text-sm font-medium mb-2">Images</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(editing.images ?? []).map((img) => (
                    <div key={img.id} className="relative">
                      <img src={img.url} alt={img.alt ?? ''} loading="lazy" className="w-16 h-16 object-cover rounded" />
                      <button
                        type="button"
                        onClick={() => void deleteImage(img.id)}
                        className="absolute -top-2 -right-2 text-xs bg-[var(--color-status-error)] text-white rounded-full w-5 h-5"
                      >×</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 items-end">
                  <LabeledInput label="Image URL" value={imageUrl} onChange={setImageUrl} />
                  <Button type="button" variant="outline" onClick={() => void addImage()} disabled={saving || !imageUrl}>Add</Button>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>{editing ? 'Save changes' : 'Create product'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete product"
        description={deleteTarget ? `Delete "${deleteTarget.name}"? This cannot be undone.` : ''}
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}

function LabeledInput({ label, value, onChange, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
