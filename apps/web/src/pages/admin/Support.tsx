import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';

interface SupportRequest {
  id: string;
  name: string;
  email: string;
  orderNumber?: string | null;
  message: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  updatedAt: string;
}

export function Support() {
  const queryClient = useQueryClient();
  const requestsQuery = useQuery({
    queryKey: ['admin', 'support-requests'],
    queryFn: () => api.get<SupportRequest[]>('/support/requests').then((response) => response.data),
  });
  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/support/requests/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'support-requests'] }),
  });

  const requests = requestsQuery.data ?? [];
  const openCount = requests.filter((request) => request.status === 'OPEN').length;
  const pageError = requestsQuery.error ?? resolveMutation.error;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Support requests</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Customer messages submitted through the storefront contact form.</p>
        </div>
        <Badge variant={openCount > 0 ? 'warning' : 'success'}>{openCount} open</Badge>
      </div>

      {pageError && (
        <Alert variant="error" className="mt-5">
          {pageError instanceof Error
            ? pageError.message
            : 'The support inbox could not be updated.'}
        </Alert>
      )}

      {requestsQuery.isLoading ? (
        <p className="mt-8 text-sm text-[var(--color-text-secondary)]">Loading support requests…</p>
      ) : requests.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-10 text-center">
          <p className="font-medium text-[var(--color-text-primary)]">No support requests yet</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">New contact-form messages will appear here.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {requests.map((request) => (
            <article key={request.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-[var(--color-text-primary)]">{request.name}</h2>
                    <Badge variant={request.status === 'OPEN' ? 'warning' : 'success'} size="sm">{request.status}</Badge>
                  </div>
                  <a href={`mailto:${request.email}`} className="mt-1 inline-flex text-sm text-[var(--color-interactive-primary)] hover:underline">{request.email}</a>
                  {request.orderNumber && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Order: {request.orderNumber}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--color-text-tertiary)]">{formatDate(request.createdAt)}</p>
                  {request.status === 'OPEN' && (
                    <Button className="mt-3" size="sm" variant="outline" disabled={resolveMutation.isPending} onClick={() => resolveMutation.mutate(request.id)}>
                      Mark resolved
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-5 whitespace-pre-wrap rounded-xl bg-[var(--color-background-primary)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">{request.message}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
