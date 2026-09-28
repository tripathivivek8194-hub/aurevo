import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Select, Textarea, Table, type Column } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';

interface ReviewUser { id: string; firstName: string; lastName: string; email: string }
interface ReviewProduct { id: string; name: string; sku: string }
interface Review {
  id: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string | null;
  createdAt: string;
  user?: ReviewUser;
  product?: ReviewProduct;
}

interface ReviewList { data: Review[]; meta: { total: number; page: number; limit: number; totalPages: number } }

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
  APPROVED: 'success', PENDING: 'warning', REJECTED: 'error',
};

const PAGE_SIZE = 20;

export function Reviews() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [moderating, setModerating] = useState<Review | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const listQuery = useQuery({
    queryKey: ['admin', 'reviews', status, page],
    queryFn: () =>
      api
        .get<ReviewList>('/reviews/admin/all', { params: { page, limit: PAGE_SIZE, ...(status ? { status } : {}) } })
        .then((r) => r.data),
  });

  const rows = listQuery.data?.data ?? [];

  const moderateMutation = useMutation({
    mutationFn: (newStatus: string) =>
      api.patch(`/reviews/admin/${moderating!.id}/moderate`, {
        status: newStatus,
        adminNotes: adminNotes.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      setModerating(null);
      setAdminNotes('');
    },
  });

  const columns: Column<Review>[] = [
    {
      key: 'review',
      header: 'Review',
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-500">{'★'.repeat(r.rating)}</span>
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {r.title || 'Untitled'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)] line-clamp-2">{r.comment || '—'}</p>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      render: (r) => (
        <div className="min-w-0">
          <p className="text-sm text-[var(--color-text-primary)] truncate">{r.product?.name}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">{r.product?.sku}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="min-w-0">
          <p className="text-sm text-[var(--color-text-primary)] truncate">
            {r.user ? `${r.user.firstName} ${r.user.lastName}` : '—'}
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)]">{r.user?.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={statusVariant[r.status] ?? 'default'} size="sm">{r.status}</Badge>,
    },
    {
      key: 'date',
      header: 'Submitted',
      render: (r) => <span className="text-sm text-[var(--color-text-secondary)]">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex justify-end gap-2">
          {r.status !== 'APPROVED' && (
            <Button size="sm" variant="primary" onClick={() => setModerating(r)}>Approve</Button>
          )}
          {r.status !== 'REJECTED' && (
            <Button size="sm" variant="destructive" onClick={() => setModerating(r)}>Reject</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Reviews</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Approve or reject customer reviews</p>
        </div>
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
          ]}
          className="w-44"
        />
      </div>

      {listQuery.error && (
        <Alert variant="error" className="mt-4">
          {listQuery.error instanceof Error ? listQuery.error.message : 'Could not load reviews.'}
        </Alert>
      )}

      <div className="mt-4">
        <Table
          columns={columns}
          data={rows}
          keyExtractor={(r) => r.id}
          loading={listQuery.isLoading}
          emptyMessage="No reviews match this filter."
        />
      </div>

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

      {/* Moderate modal */}
      {moderating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5 shadow-lg">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {moderating.status === 'APPROVED' ? 'Reject review' : 'Moderate review'}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-semibold text-amber-500">{'★'.repeat(moderating.rating)}</span>{' '}
              {moderating.title || 'Untitled'}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{moderating.comment}</p>
            <div className="mt-4 space-y-1">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Admin note (optional)</label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="Visible to admins; e.g. reason for decision"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setModerating(null); setAdminNotes(''); }}>Cancel</Button>
              {moderating.status !== 'APPROVED' && (
                <Button
                  variant="primary"
                  onClick={() => moderateMutation.mutate('APPROVED')}
                  disabled={moderateMutation.isPending}
                >
                  Approve
                </Button>
              )}
              {moderating.status !== 'REJECTED' && (
                <Button
                  variant="destructive"
                  onClick={() => moderateMutation.mutate('REJECTED')}
                  disabled={moderateMutation.isPending}
                >
                  Reject
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
