import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, ConfirmModal, Input, Label, Modal, Select, Table, Textarea, type Column,
} from '@aurevo/design-system';
import { api } from '../../lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  isActive: boolean;
  sortOrder: number;
  parentId?: string | null;
  _count?: { products: number };
}

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  sortOrder: string;
}

const emptyForm: CategoryForm = {
  name: '', slug: '', description: '', image: '', isActive: true, sortOrder: '0',
};

/** Generate a URL-friendly slug from a category name. */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function Categories() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [editing, setEditing] = useState<Category | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.get<Category[]>('/categories', { params: { includeInactive: true } }).then((r) => r.data),
  });

  const categories = categoriesQuery.data ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? '',
      image: cat.image ?? '',
      isActive: cat.isActive,
      sortOrder: String(cat.sortOrder ?? 0),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name.trim()),
        description: form.description.trim() || undefined,
        image: form.image.trim() || undefined,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (!payload.name) throw new Error('Category name is required.');
      if (editing) {
        return api.patch(`/categories/${editing.id}`, payload);
      }
      return api.post('/categories', payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      setFormError(err?.message ?? 'Failed to save category.');
    },
    onSettled: () => setSaving(false),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    saveMutation.mutate();
  };

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/categories/${deleteTarget!.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      setDeleteTarget(null);
    },
    onSettled: () => setDeleting(false),
  });

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (cat) => (
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">{cat.name}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">/{cat.slug}</p>
        </div>
      ),
    },
    {
      key: 'products',
      header: 'Products',
      render: (cat) => (
        <span className="text-sm text-[var(--color-text-secondary)]">
          {cat._count?.products ?? 0}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (cat) => (
        <Badge variant={cat.isActive ? 'success' : 'outline'} size="sm">
          {cat.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'sortOrder',
      header: 'Order',
      render: (cat) => (
        <span className="text-sm text-[var(--color-text-tertiary)]">{cat.sortOrder}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Categories</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>Add category</Button>
      </div>

      {categoriesQuery.error && (
        <Alert variant="error" className="mt-4">
          {categoriesQuery.error instanceof Error ? categoriesQuery.error.message : 'Could not load categories.'}
        </Alert>
      )}

      <div className="mt-4">
        <Table
          columns={columns}
          data={categories}
          keyExtractor={(c) => c.id}
          onRowClick={openEdit}
          loading={categoriesQuery.isLoading}
          emptyMessage="No categories yet. Create one to organise products."
        />
      </div>

      {/* Create / Edit modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? 'Edit category' : 'New category'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, slug: editing ? f.slug : slugify(name) }));
              }}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Slug</Label>
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder={slugify(form.name || '')}
            />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label>Image URL</Label>
            <Input
              value={form.image}
              onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </div>
            <div className="flex items-end gap-3 pb-0.5">
              <input
                type="checkbox"
                id="cat-active"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="cat-active">Active</Label>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { setDeleting(true); deleteMutation.mutate(); }}
        title="Delete category"
        description={deleteTarget ? `Delete "${deleteTarget.name}"? This cannot be undone. Products in this category will not be deleted.` : ''}
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
