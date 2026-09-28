import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Checkbox, Dropdown, Input, Label, Modal, ConfirmModal, Select, Spinner, Switch, Table, Textarea,
} from '@aurevo/design-system';
import type { Column } from '@aurevo/design-system';
import { api, ApiError } from '../../lib/api';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  AliExpressConnectionStatus,
  AliExpressConnectResponse,
  CJDropshippingConnectionStatus,
  CJDropshippingImportJobResult,
  SupplierCapabilityStatus,
} from '@aurevo/shared/types';

const CALLBACK_PATH = '/api/suppliers/aliexpress/callback';

const capabilityStatusVariant: Record<SupplierCapabilityStatus, 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
  SUPPORTED: 'success',
  NOT_AUTHORIZED: 'warning',
  NOT_CONFIGURED: 'default',
  NOT_PERMITTED: 'error',
  UNSUPPORTED: 'outline',
  UNVERIFIED: 'info',
  API_ERROR: 'error',
};

/** Client-side mirror of the backend callback validation (defence in depth). */
function isValidCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    return u.pathname === CALLBACK_PATH;
  } catch {
    return false;
  }
}

interface FormState {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
}

const EMPTY_FORM: FormState = { appKey: '', appSecret: '', callbackUrl: '' };

export function Suppliers() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'suppliers', 'aliexpress', 'status'],
    queryFn: () =>
      api.get<AliExpressConnectionStatus>('/suppliers/aliexpress/status').then((r) => r.data),
  });

  const { data: cjStatus } = useQuery({
    queryKey: ['admin', 'suppliers', 'cjdropshipping', 'status'],
    queryFn: () =>
      api.get<CJDropshippingConnectionStatus>('/suppliers/cjdropshipping/status').then((r) => r.data),
  });

  // Supplier directory — all suppliers (non-AliExpress/CJ integration suppliers)
  const suppliersQuery = useQuery({
    queryKey: ['admin', 'suppliers'],
    queryFn: () => api.get<Array<{ id: string; name: string; code: string; contact?: string; notes?: string; isActive: boolean; syncEnabled: boolean; _count?: { products: number } }>>('/suppliers').then((r) => r.data),
    staleTime: 30_000,
    retry: 1,
  });

  /** Persist credentials. The App Secret is sent once over HTTPS and is never
   * returned — on success we clear the form so it isn't retained in state. */
  const configureMutation = useMutation({
    mutationFn: (payload: { appKey?: string; appSecret?: string; callbackUrl?: string }) =>
      api
        .post<AliExpressConnectionStatus>('/suppliers/aliexpress/config', payload)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'aliexpress', 'status'] });
      setEditing(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
  });

  const connectMutation = useMutation({
    mutationFn: () =>
      api.get<AliExpressConnectResponse>('/suppliers/aliexpress/connect').then((r) => r.data),
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      api
        .post<{ success: boolean; message: string }>('/suppliers/aliexpress/verify')
        .then((r) => r.data),
    onSuccess: (res) => {
      if (!res.success) {
        // Failed verification — still show the result; no fabricated success.
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'aliexpress', 'status'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      api
        .post<{ success: boolean; message: string }>('/suppliers/aliexpress/disconnect')
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'aliexpress', 'status'] });
    },
  });

  const handleConnect = () => {
    connectMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.state === 'READY' && res.authorizationUrl) {
          window.open(res.authorizationUrl, '_blank', 'noopener,noreferrer');
        }
      },
    });
  };

  const handleVerify = () => verifyMutation.mutate(undefined);
  const handleDisconnect = () => disconnectMutation.mutate(undefined);

  const handleOpenEdit = () => {
    setFormError(null);
    setEditing(true);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload: { appKey?: string; appSecret?: string; callbackUrl?: string } = {};
    if (form.appKey.trim()) payload.appKey = form.appKey.trim();
    if (form.appSecret.trim()) payload.appSecret = form.appSecret.trim();
    if (form.callbackUrl.trim()) {
      const url = form.callbackUrl.trim();
      if (!isValidCallbackUrl(url)) {
        setFormError(
          `Callback URL must be a stable HTTPS URL ending in ${CALLBACK_PATH} (no http, no localhost).`,
        );
        return;
      }
      payload.callbackUrl = url;
    }
    if (Object.keys(payload).length === 0) {
      setFormError('Enter at least one field to update.');
      return;
    }
    configureMutation.mutate(payload);
  };

  const configured = data?.configured ?? false;
  const openByDefault = Boolean(data) && data?.state === 'NOT_CONFIGURED';
  const showForm = editing || openByDefault;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Manage supplier integrations and vendor directory
        </p>
      </header>

      {/* Supplier Directory */}
      <SupplierDirectory data={suppliersQuery.data} isLoading={suppliersQuery.isLoading} />

      {/* Connection status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle as="h2">AliExpress</CardTitle>
              <CardDescription>{statusDescription(data?.state)}</CardDescription>
            </div>
            {data && (
              <Badge variant={statusVariant(data.state)}>{statusLabel(data.state)}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError ? (
            <Alert variant="error">
              {error instanceof Error ? error.message : 'Failed to load status'}
            </Alert>
          ) : isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner label="Loading connection status…" />
            </div>
          ) : data ? (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-[var(--color-text-secondary)]">App Key</dt>
                <dd className="text-right font-mono">{data.appKeyMasked ?? '—'}</dd>
                <dt className="text-[var(--color-text-secondary)]">App Secret configured</dt>
                <dd className="text-right">{data.hasAppSecret ? 'Yes' : 'No'}</dd>
                <dt className="text-[var(--color-text-secondary)]">Callback URL configured</dt>
                <dd className="text-right">{data.hasCallbackUrl ? 'Yes' : 'No'}</dd>
                <dt className="text-[var(--color-text-secondary)]">Access token stored</dt>
                <dd className="text-right">{data.hasAccessToken ? 'Yes' : 'No'}</dd>
                <dt className="text-[var(--color-text-secondary)]">Token expires</dt>
                <dd className="text-right">{data.tokenExpiresAt ?? '—'}</dd>
                <dt className="text-[var(--color-text-secondary)]">Last verified</dt>
                <dd className="text-right">{data.lastVerifiedAt ?? 'Never'}</dd>
              </dl>

              {data.message && (
                <Alert variant={data.connected ? 'success' : data.state === 'ERROR' ? 'error' : 'info'}>
                  {data.message}
                </Alert>
              )}

              {verifyMutation.isError && (
                <Alert variant="error">
                  {verifyMutation.error instanceof Error ? verifyMutation.error.message : 'Verification failed'}
                </Alert>
              )}
              {connectMutation.isError && (
                <Alert variant="error">
                  {connectMutation.error instanceof Error ? connectMutation.error.message : 'Failed to prepare authorization'}
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {!configured && data.state === 'NOT_CONFIGURED' && (
                  <Button variant="primary" onClick={handleOpenEdit}>
                    Configure AliExpress
                  </Button>
                )}
                {configured && !data.hasAccessToken && (
                  <>
                    <Button variant="primary" onClick={handleConnect} disabled={connectMutation.isPending}>
                      {connectMutation.isPending ? 'Preparing…' : 'Authorize with AliExpress'}
                    </Button>
                    <Button variant="ghost" onClick={handleOpenEdit}>
                      Edit configuration
                    </Button>
                  </>
                )}
                {configured && data.hasAccessToken && !data.connected && (
                  <>
                    <Button variant="primary" onClick={handleVerify} disabled={verifyMutation.isPending}>
                      {verifyMutation.isPending ? 'Verifying…' : 'Verify against API'}
                    </Button>
                    <Button variant="ghost" onClick={handleOpenEdit}>
                      Edit configuration
                    </Button>
                  </>
                )}
                {data.connected && (
                  <>
                    <Button variant="secondary" onClick={handleVerify} disabled={verifyMutation.isPending}>
                      {verifyMutation.isPending ? 'Re-verifying…' : 'Re-verify'}
                    </Button>
                    <Button variant="ghost" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                      {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                    </Button>
                    <Button variant="ghost" onClick={handleOpenEdit}>
                      Edit configuration
                    </Button>
                  </>
                )}
              </div>

              {/* Capabilities table */}
              <div className="border-t border-[var(--color-border)] pt-4">
                <h3 className="text-sm font-medium mb-3">Capabilities</h3>
                <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                  Capabilities are only reported as available after a real AliExpress API call
                  succeeds — nothing is assumed.
                </p>
                <Table
                  data={data.capabilities}
                  keyExtractor={(c) => c.operation}
                  emptyMessage="No capabilities reported."
                  columns={[
                    { key: 'operation', header: 'Operation', render: (c) => <code>{c.operation}</code> },
                    { key: 'label', header: 'Label', render: (c) => c.label },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (c) => (
                        <Badge variant={capabilityStatusVariant[c.status] ?? 'default'}>
                          {c.status}
                        </Badge>
                      ),
                    },
                    {
                      key: 'note',
                      header: 'Note',
                      render: (c) => <span className="text-sm text-[var(--color-text-secondary)]">{c.note ?? '—'}</span>,
                    },
                  ]}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Import AliExpress catalog — only when the connection is verified */}
      {data?.connected && (
        <ErrorBoundary>
          <ImportCatalogCard />
        </ErrorBoundary>
      )}

      {/* Configure AliExpress */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Configure AliExpress</CardTitle>
            <CardDescription>
              Reuse your existing AliExpress Open Platform app (e.g. &quot;Calm Shop&quot;). Enter its
              credentials below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="info">
              <strong>Callback URL requirement:</strong> this must be a stable, publicly reachable{' '}
              <strong>HTTPS</strong> URL and must end exactly in{' '}
              <code>{CALLBACK_PATH}</code>. http and localhost are not accepted. Register the{' '}
              <em>exact same</em> URL as the app&apos;s Redirect/Callback URL in the AliExpress Open
              Platform console, or OAuth authorization will fail.
            </Alert>
            <Alert variant="info">
              The App Secret is stored server-side, encrypted, and is never shown again or sent back
              to this page. If you leave a field blank it is kept unchanged.
            </Alert>

            {formError && <Alert variant="error">{formError}</Alert>}
            {configureMutation.isError && (
              <Alert variant="error">
                {configureMutation.error instanceof Error
                  ? configureMutation.error.message
                  : 'Failed to save configuration'}
              </Alert>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <Input
                label="AliExpress App Key"
                value={form.appKey}
                onChange={(e) => setForm((f) => ({ ...f, appKey: e.target.value }))}
                placeholder={data?.appKeyMasked ? `${data.appKeyMasked} (leave blank to keep)` : 'Enter App Key'}
                autoComplete="off"
                fullWidth
              />
              <Input
                label="AliExpress App Secret"
                type="password"
                value={form.appSecret}
                onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
                placeholder={data?.hasAppSecret ? '•••••••• (leave blank to keep)' : 'Enter App Secret'}
                autoComplete="new-password"
                fullWidth
              />
              <Input
                label="AliExpress Callback URL"
                value={form.callbackUrl}
                onChange={(e) => setForm((f) => ({ ...f, callbackUrl: e.target.value }))}
                placeholder={`https://…${CALLBACK_PATH}`}
                autoComplete="off"
                fullWidth
                helperText={`Must be HTTPS and end with ${CALLBACK_PATH}.`}
              />
              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" loading={configureMutation.isPending}>
                  {configureMutation.isPending ? 'Saving…' : 'Save configuration'}
                </Button>
                {editing && (
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* CJdropshipping connection */}
      <CJConnectionCard />

      {/* CJdropshipping catalog import — only when the CJ connection has a token */}
      {cjStatus?.connected && (
        <ErrorBoundary>
          <CJImportCatalogCard />
        </ErrorBoundary>
      )}
    </div>
  );
}

interface ImportFeedSummary {
  feedName: string;
  country: string;
  categoryId?: string;
  productNum?: number;
}
interface ImportFeedsResponse {
  configured: boolean;
  feeds: ImportFeedSummary[];
  error?: string;
}
interface ImportCategoryOption {
  id: string;
  name: string;
  slug: string;
}
interface ImportPreviewProduct {
  productId: string;
  title: string;
  images: string[];
  priceAmount?: number;
  priceCurrency?: string;
}
interface ImportPreviewResponse {
  products: ImportPreviewProduct[];
  totalRecordCount: number;
  page: number;
  pageSize: number;
  currency?: string;
  error?: string;
}
interface ImportResultResponse {
  imported: number;
  skipped: number;
  scanned: number;
  enrichedVariants: number;
  enrichFailed: number;
  feedName: string;
  country: string;
  categoryId: string;
}

/** Resumable job state returned by the job endpoints (safe fields only). */
interface ImportJobResponse {
  id: string;
  feedName: string;
  country: string;
  categoryId: string;
  perRunLimit: number;
  currency: string;
  enrich: boolean;
  mode: 'update' | 'skip';
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  nextPage: number;
  isFeedFinished: boolean;
  processedCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  enrichedVariantCount: number;
  enrichFailedCount: number;
  failedIds: string[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

const IMPORT_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'BRL'];

function formatImportPrice(amount?: number, currency = 'USD'): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Safe number formatter for job counters — never crashes on a missing field. */
function fmt(counter: number | null | undefined): string {
  return (typeof counter === 'number' && Number.isFinite(counter) ? counter : 0).toLocaleString();
}

/**
 * A job is only usable when it actually carries its record identity and resume
 * cursor. The response envelope (`{success,data}`) or any partial/stale object
 * has neither — treating it as a real job rendered `Page NaN` with no action
 * buttons. Anything invalid resolves to `null` so the Start button shows.
 */
function asUsableJob<T extends { id?: unknown; nextPage?: unknown }>(value: T | null | undefined): T | null {
  return value && typeof value.id === 'string' && typeof value.nextPage === 'number' ? value : null;
}

/**
 * Resumable, page-by-page AliExpress catalog importer (admin-only API).
 * Reads the feeds list live, previews one page before committing, then imports
 * real products from a feed as DRAFT into one selected AUREVO category. Each
 * "Start"/"Continue" advances exactly one feed page and persists the cursor, so
 * an interrupted import resumes where it left off.
 */
function ImportCatalogCard() {
  const queryClient = useQueryClient();
  const [feedName, setFeedName] = useState('');
  const [country, setCountry] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [perRunLimit, setPerRunLimit] = useState('25');
  const [currency, setCurrency] = useState('INR');
  const [enrich, setEnrich] = useState(false);
  const [mode, setMode] = useState<'update' | 'skip'>('update');

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<ImportCategoryOption[]>('/categories').then((r) => r.data),
  });

  const feedsQuery = useQuery({
    queryKey: ['admin', 'suppliers', 'aliexpress', 'feeds'],
    queryFn: () =>
      api.get<ImportFeedsResponse>('/suppliers/aliexpress/catalog/feeds').then((r) => r.data),
  });
  const feeds = feedsQuery.data?.feeds ?? [];

  const handleFeed = (name: string) => {
    setFeedName(name);
    // The API always resolves a country per feed (inferred from the feed name,
    // US fallback). Derive it directly so a stale feeds cache can never leave a
    // previous feed's country attached to this one — a mismatched country makes
    // the feed read back empty.
    const feed = feeds.find((f) => f.feedName === name);
    setCountry(feed?.country || 'US');
  };

  const preview = useQuery({
    queryKey: ['admin', 'suppliers', 'aliexpress', 'preview', feedName, country, perRunLimit, currency],
    queryFn: () =>
      api
        .get<ImportPreviewResponse>('/suppliers/aliexpress/catalog/preview', {
          params: { feedName, country, page: 1, pageSize: perRunLimit, currency },
        })
        .then((r) => r.data),
    enabled: Boolean(feedName && country),
  });

  // Latest job for this feed+country+category — the UI picks up where a prior
  // run left off. Polls only while RUNNING (transient between advances).
  const jobKey = ['admin', 'suppliers', 'aliexpress', 'job', feedName, country, categoryId];
  const latestJob = useQuery({
    queryKey: jobKey,
    queryFn: () =>
      api
        .get<ImportJobResponse | null>('/suppliers/aliexpress/catalog/jobs/latest', {
          params: { feedName, country, categoryId },
        })
        .then((r) => r.data),
    enabled: Boolean(feedName && country && categoryId),
    refetchInterval: (q) => (q.state.data?.status === 'RUNNING' ? 2000 : false),
  });
  const job = asUsableJob(latestJob.data);

  const refreshAfterRun = () => {
    queryClient.invalidateQueries({ queryKey: jobKey });
    queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'aliexpress', 'preview'] });
  };

  // Start = create job, then advance its first page.
  const startMutation = useMutation({
    mutationFn: async () => {
      const created = await api
        .post<ImportJobResponse>('/suppliers/aliexpress/catalog/jobs', {
          feedName,
          country,
          categoryId,
          perRunLimit: Number(perRunLimit) || 25,
          currency,
          enrich,
          mode,
        })
        .then((r) => r.data);
      const usable = asUsableJob(created);
      if (!usable) {
        throw new Error('Import job was created but returned no usable job id — check the API response.');
      }
      return api
        .post<ImportJobResponse>(`/suppliers/aliexpress/catalog/jobs/${usable.id}/advance`)
        .then((r) => r.data);
    },
    onSuccess: refreshAfterRun,
  });

  const advanceMutation = useMutation({
    mutationFn: (id: string) =>
      api
        .post<ImportJobResponse>(`/suppliers/aliexpress/catalog/jobs/${id}/advance`)
        .then((r) => r.data),
    onSuccess: refreshAfterRun,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api
        .post<ImportJobResponse>(`/suppliers/aliexpress/catalog/jobs/${id}/cancel`)
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobKey }),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) =>
      api
        .post<ImportJobResponse>(`/suppliers/aliexpress/catalog/jobs/${id}/retry`)
        .then((r) => r.data),
    onSuccess: refreshAfterRun,
  });

  const jobBusy =
    startMutation.isPending || advanceMutation.isPending || cancelMutation.isPending || retryMutation.isPending;
  const canStart = Boolean(feedName && country && categoryId) && !job && !jobBusy;

  const categories = categoriesQuery.data ?? [];
  const hasNoCategories = categories.length === 0 && !categoriesQuery.isLoading;

  let disabledReason = '';
  if (!feedName) {
    disabledReason = 'Select a feed to start importing';
  } else if (!country) {
    disabledReason = 'Enter or select a country to start importing';
  } else if (!categoryId) {
    disabledReason = hasNoCategories
      ? 'Create a category first in Admin > Categories'
      : 'Select a category to start importing';
  } else if (jobBusy) {
    disabledReason = 'Import operation is in progress';
  }

  const statusVariant: Record<ImportJobResponse['status'], 'default' | 'success' | 'warning' | 'error' | 'info'> = {
    PENDING: 'default',
    RUNNING: 'info',
    PAUSED: 'info',
    COMPLETED: 'success',
    CANCELLED: 'warning',
    FAILED: 'error',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Import AliExpress catalog</CardTitle>
        <CardDescription>
          Reads real products from a featured AliExpress feed (granted DS API) and imports them as
          DRAFT into one AUREVO category. Each run advances one page and persists the cursor, so an
          interrupted import resumes where it left off. Nothing is fabricated and no affiliate API
          is used.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasNoCategories && (
          <Alert variant="warning">
            No categories found. Create a category in{' '}
            <Link to="/admin/categories" className="font-medium underline hover:text-[var(--color-text-primary)]">
              Admin &gt; Categories
            </Link>{' '}
            before importing products.
          </Alert>
        )}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Select
              label="Feed"
              value={feedName}
              onChange={(e) => handleFeed(e.target.value)}
              placeholder={
                feedsQuery.isLoading
                  ? 'Loading feeds…'
                  : feedsQuery.data?.error ?? 'Select a featured feed'
              }
              options={feeds.slice(0, 300).map((f) => ({
                value: f.feedName,
                label: `${f.feedName} · ${f.country || '?'}${
                  f.productNum != null ? ` · ${f.productNum.toLocaleString()} products` : ''
                }`,
              }))}
              fullWidth
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="c-country">Country</Label>
            <Input
              id="c-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="BR"
              aria-label="Feed country"
            />
          </div>
          <div>
            <Select
              label="AUREVO category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="Select category"
              options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              fullWidth
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="c-limit">Products per run (max 50)</Label>
            <Input
              id="c-limit"
              type="number"
              min={1}
              max={50}
              value={perRunLimit}
              onChange={(e) => setPerRunLimit(e.target.value)}
            />
          </div>
          <div>
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={IMPORT_CURRENCIES.map((c) => ({ value: c, label: c }))}
              fullWidth
            />
          </div>
          <div>
            <Select
              label="Existing products"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'update' | 'skip')}
              options={[
                { value: 'update', label: 'Update price & images' },
                { value: 'skip', label: 'Skip existing' },
              ]}
              fullWidth
            />
          </div>
          <div className="flex items-end pb-2">
            <Checkbox
              id="c-enrich"
              label="Backfill SKUs/variants"
              checked={enrich}
              onChange={(v) => setEnrich(v)}
            />
          </div>
        </div>

        {/* Job status & actions */}
        <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
          {latestJob.isLoading && jobKey && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Spinner size="sm" /> Loading import progress…
            </div>
          )}

          {job && (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={statusVariant[job.status]}>{job.status}</Badge>
              <span className="text-sm text-[var(--color-text-secondary)]">
                Page {Math.max(job.nextPage - 1, 0)}
                {!job.isFeedFinished && ` → next ${job.nextPage}`} ·{' '}
                {fmt(job.processedCount)} processed
                {job.errorCount > 0 && ` · ${job.errorCount} failed`}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {(job.status === 'PENDING' || job.status === 'PAUSED') && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => advanceMutation.mutate(job.id)}
                      disabled={jobBusy}
                    >
                      {advanceMutation.isPending ? 'Importing…' : 'Continue (next page)'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelMutation.mutate(job.id)}
                      disabled={jobBusy}
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {job.status === 'RUNNING' && <Spinner label="Importing…" />}
                {job.errorCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retryMutation.mutate(job.id)}
                    disabled={jobBusy || job.status === 'RUNNING'}
                  >
                    {retryMutation.isPending ? 'Retrying…' : `Retry ${job.errorCount} failed`}
                  </Button>
                )}
              </span>
            </div>
          )}

          {job && (
            <div className="grid gap-2 sm:grid-cols-5 text-sm">
              <div className="rounded border border-[var(--color-border)] p-2">
                <div className="text-[var(--color-text-secondary)] text-xs">Imported</div>
                <div className="font-medium tabular-nums">{fmt(job.importedCount)}</div>
              </div>
              <div className="rounded border border-[var(--color-border)] p-2">
                <div className="text-[var(--color-text-secondary)] text-xs">Updated</div>
                <div className="font-medium tabular-nums">{fmt(job.updatedCount)}</div>
              </div>
              <div className="rounded border border-[var(--color-border)] p-2">
                <div className="text-[var(--color-text-secondary)] text-xs">Skipped</div>
                <div className="font-medium tabular-nums">{fmt(job.skippedCount)}</div>
              </div>
              <div className="rounded border border-[var(--color-border)] p-2">
                <div className="text-[var(--color-text-secondary)] text-xs">Failed</div>
                <div className="font-medium tabular-nums">{fmt(job.errorCount)}</div>
              </div>
              <div className="rounded border border-[var(--color-border)] p-2">
                <div className="text-[var(--color-text-secondary)] text-xs">SKU variants</div>
                <div className="font-medium tabular-nums">{fmt(job.enrichedVariantCount)}</div>
              </div>
            </div>
          )}

          {job?.status === 'COMPLETED' && (
            <Alert variant="success">
              Import complete — {fmt(job.importedCount)} imported,{' '}
              {fmt(job.updatedCount)} updated, {fmt(job.skippedCount)} skipped
              {job.errorCount > 0 && `, ${job.errorCount} failed`}. New products are DRAFT — review and
              publish them from the Products page.
            </Alert>
          )}
          {job?.status === 'FAILED' && (
            <Alert variant="error">
              {job.errorMessage ||
                'Import failed. Check the AliExpress connection and re-authorize if needed.'}
            </Alert>
          )}
          {job?.status === 'CANCELLED' && (
            <Alert variant="warning">
              Import cancelled at page {Math.max(job.nextPage - 1, 0)} ({fmt(job.processedCount)}{' '}
              processed). Start a new job to import more.
            </Alert>
          )}
          {job?.failedIds && job.failedIds.length > 0 && (
            <div className="text-xs text-[var(--color-text-secondary)]">
              Failed product IDs:{' '}
              {job.failedIds.slice(0, 20).map((id) => (
                <code key={id} className="mr-1">
                  {id}
                </code>
              ))}
              {job.failedIds.length > 20 && `… +${job.failedIds.length - 20} more`}
            </div>
          )}

          {!job && !latestJob.isLoading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div title={!canStart ? disabledReason : undefined} className="inline-block">
                  <Button variant="primary" onClick={() => startMutation.mutate()} disabled={!canStart}>
                    {startMutation.isPending ? 'Starting…' : 'Start import (first page)'}
                  </Button>
                </div>
                {startMutation.isError && (
                  <span className="text-sm text-[var(--color-danger)]">
                    {startMutation.error instanceof Error ? startMutation.error.message : 'Start failed'}
                  </span>
                )}
              </div>
              {!canStart && disabledReason && (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {disabledReason}
                </p>
              )}
            </div>
          )}
          {startMutation.isError && !job && (
            <Alert variant="error">
              {startMutation.error instanceof Error ? startMutation.error.message : 'Import failed'}
            </Alert>
          )}
          {advanceMutation.isError && (
            <Alert variant="error">
              {advanceMutation.error instanceof Error ? advanceMutation.error.message : 'Advance failed'}
            </Alert>
          )}
          {preview.data?.error && <Alert variant="error">{preview.data.error}</Alert>}
        </div>

        <div className="border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Preview — page 1 before import</h3>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {preview.data?.totalRecordCount != null &&
                `${preview.data.totalRecordCount.toLocaleString()} products in feed`}
            </span>
          </div>
          {preview.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner label="Loading preview…" />
            </div>
          ) : (
            <Table
              data={preview.data?.products ?? []}
              keyExtractor={(p) => p.productId}
              emptyMessage="Select a feed and country to preview its first page."
              columns={[
                {
                  key: 'image',
                  header: '',
                  render: (p) =>
                    p.images[0] ? (
                      <img src={p.images[0]} alt="" className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">—</span>
                    ),
                },
                { key: 'title', header: 'Product', render: (p) => <span className="font-medium">{p.title}</span> },
                { key: 'price', header: 'Price', render: (p) => formatImportPrice(p.priceAmount, currency) },
                { key: 'id', header: 'AliExpress ID', render: (p) => <code>{p.productId}</code> },
              ]}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// CJdropshipping UI — mirrors the AliExpress patterns above
// ============================================================

type CJState = CJDropshippingConnectionStatus['state'];

function cjStateInfo(state: CJState | undefined): StatusBadge {
  switch (state) {
    case 'NOT_CONFIGURED':
      return {
        label: 'Not configured',
        variant: 'warning',
        description: 'The CJ API Key is missing — configure it below.',
      };
    case 'DISCONNECTED':
      return {
        label: 'Configured · not authorized',
        variant: 'default',
        description: 'Credentials are configured but no access token has been obtained yet.',
      };
    case 'READY':
      return {
        label: 'Configured · unverified',
        variant: 'info',
        description: 'Credentials configured but not yet verified against the live CJ API.',
      };
    case 'CONNECTED':
      return {
        label: 'Connected · verified',
        variant: 'success',
        description: 'Access token is active and verified against the live CJ API.',
      };
    case 'ERROR':
      return {
        label: 'Error',
        variant: 'error',
        description: 'An error occurred during authorization or verification.',
      };
    default:
      return { label: 'Unknown', variant: 'default', description: '' };
  }
}

interface CJFormState {
  apiKey: string;
}

const CJ_EMPTY_FORM: CJFormState = { apiKey: '' };

/** CJ Connection card — status, configure, verify, disconnect. */
function CJConnectionCard() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CJFormState>(CJ_EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'suppliers', 'cjdropshipping', 'status'],
    queryFn: () =>
      api.get<CJDropshippingConnectionStatus>('/suppliers/cjdropshipping/status').then((r) => r.data),
  });

  const configureMutation = useMutation({
    mutationFn: (payload: { apiKey?: string }) =>
      api
        .post<CJDropshippingConnectionStatus>('/suppliers/cjdropshipping/config', payload)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'cjdropshipping', 'status'] });
      setEditing(false);
      setForm(CJ_EMPTY_FORM);
      setFormError(null);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      api
        .post<{ success: boolean; message: string }>('/suppliers/cjdropshipping/verify')
        .then((r) => r.data),
    onSuccess: (res) => {
      setVerifyResult(res);
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'cjdropshipping', 'status'] });
    },
    onError: (err) => {
      setVerifyResult({
        success: false,
        message: err instanceof Error ? err.message : 'Verification failed.',
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      api
        .post<{ success: boolean; message: string }>('/suppliers/cjdropshipping/disconnect')
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'cjdropshipping', 'status'] });
    },
  });

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const payload: { apiKey?: string } = {};
    if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
    if (Object.keys(payload).length === 0) {
      setFormError('Enter the CJ API Key.');
      return;
    }
    configureMutation.mutate(payload);
  };

  const stateBadge = cjStateInfo(data?.state);

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle as="h2">CJdropshipping</CardTitle>
            <CardDescription>{stateBadge.description}</CardDescription>
          </div>
          {data && <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError ? (
          <Alert variant="error">
            {error instanceof Error ? error.message : 'Failed to load CJ status'}
          </Alert>
        ) : isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner label="Loading CJ status…" />
          </div>
        ) : data ? (
          <>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-[var(--color-text-secondary)]">API Key</dt>
              <dd className="text-right font-mono">{data.apiKeyMasked ?? '—'}</dd>
              <dt className="text-[var(--color-text-secondary)]">Access token stored</dt>
              <dd className="text-right">{data.hasAccessToken ? 'Yes' : 'No'}</dd>
              <dt className="text-[var(--color-text-secondary)]">Token expires</dt>
              <dd className="text-right">{data.tokenExpiresAt ?? '—'}</dd>
              <dt className="text-[var(--color-text-secondary)]">Last verified</dt>
              <dd className="text-right">{data.lastVerifiedAt ?? 'Never'}</dd>
            </dl>

            {verifyResult && (
              <Alert variant={verifyResult.success ? 'success' : 'error'}>
                {verifyResult.message}
              </Alert>
            )}
            {configureMutation.isError && (
              <Alert variant="error">
                {configureMutation.error instanceof Error ? configureMutation.error.message : 'Save failed'}
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!data.configured && (
                <Button variant="primary" onClick={() => { setFormError(null); setEditing(true); }}>
                  Configure CJdropshipping
                </Button>
              )}
              {data.configured && !data.hasAccessToken && (
                <Button variant="primary" onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
                  {verifyMutation.isPending ? 'Connecting…' : 'Connect to CJ'}
                </Button>
              )}
              {data.configured && data.hasAccessToken && (
                <>
                  <Button variant="secondary" onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
                    {verifyMutation.isPending ? 'Re-verifying…' : 'Re-verify'}
                  </Button>
                  <Button variant="ghost" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                    {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </>
              )}
              <Button variant="ghost" onClick={() => { setFormError(null); setEditing(true); }}>
                Edit configuration
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
    {editing && <CJConfigureForm onDone={() => setEditing(false)} />}
    </>
  );
}

/** CJ configure/edit form — rendered below the connection card when editing. */
function CJConfigureForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CJFormState>(CJ_EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const configureMutation = useMutation({
    mutationFn: (payload: { apiKey?: string }) =>
      api
        .post<CJDropshippingConnectionStatus>('/suppliers/cjdropshipping/config', payload)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'cjdropshipping', 'status'] });
      onDone();
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const payload: { apiKey?: string } = {};
    if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
    if (Object.keys(payload).length === 0) {
      setFormError('Enter the CJ API Key.');
      return;
    }
    configureMutation.mutate(payload);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Configure CJdropshipping</CardTitle>
        <CardDescription>
          Enter your CJ API Key. It is encrypted at rest and never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {formError && <Alert variant="error">{formError}</Alert>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cj-api-key">CJ API Key</Label>
            <Input
              id="cj-api-key"
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((s) => ({ ...s, apiKey: e.target.value }))}
              placeholder="Paste your CJ API Key from the CJ Apps section"
            />
            <p className="text-xs text-[var(--color-text-secondary)]">
              Get it from the CJ Apps section (developers.cjdropshipping.com). It looks like{' '}
              <code>CJUserNum@api@…</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" type="submit" disabled={configureMutation.isPending}>
              {configureMutation.isPending ? 'Saving…' : 'Save CJ API Key'}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            {configureMutation.isSuccess && (
              <span className="text-sm text-[var(--color-success)]">Saved.</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface CJSearchProduct {
  productId: string;
  title: string;
  images: string[];
  priceAmount: number | null;
  priceCurrency: string;
  variants: Array<{ skuCode: string; skuPrice: number | null; stock?: number | null }>;
}

interface CJSearchResponse {
  configured: boolean;
  products: CJSearchProduct[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}

interface CJCategoryOption {
  id: string;
  name: string;
}

const CJ_IMPORT_CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'];

function formatCJImportPrice(amount?: number | null, currency = 'USD'): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
  } catch { return `${amount} ${currency}`; }
}

/**
 * CJdropshipping catalog importer — search-driven, page-by-page, resumable.
 * Mirrors the AliExpress ImportCatalogCard but uses keyword/category search
 * instead of a fixed feed list.
 */
function CJImportCatalogCard() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [cjCategoryId, setCJCategoryId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [perRunLimit, setPerRunLimit] = useState('25');
  const [currency, setCurrency] = useState('USD');
  const [mode, setMode] = useState<'update' | 'skip'>('update');

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/categories').then((r) => r.data),
  });

  const cjCategoriesQuery = useQuery({
    queryKey: ['admin', 'suppliers', 'cjdropshipping', 'catalog-categories'],
    queryFn: () =>
      api.get<{ configured: boolean; categories: CJCategoryOption[]; error?: string }>(
        '/suppliers/cjdropshipping/catalog/categories',
      ).then((r) => r.data),
  });

  const preview = useQuery({
    queryKey: ['admin', 'suppliers', 'cjdropshipping', 'preview', searchQuery, cjCategoryId, perRunLimit],
    queryFn: () =>
      api.get<CJSearchResponse>('/suppliers/cjdropshipping/catalog/search', {
        params: { query: searchQuery || undefined, cjCategoryId: cjCategoryId || undefined, page: 1, pageSize: perRunLimit },
      }).then((r) => r.data),
    enabled: Boolean(searchQuery || cjCategoryId),
  });

  // Build a stable source string for the job
  const source = searchQuery.trim() || `cj-cat-${cjCategoryId}`;

  const jobKey = ['admin', 'suppliers', 'cjdropshipping', 'job', source, categoryId];
  const latestJob = useQuery({
    queryKey: jobKey,
    queryFn: () =>
      api.get<CJDropshippingImportJobResult | null>('/suppliers/cjdropshipping/catalog/jobs/latest', {
        params: { source, categoryId },
      }).then((r) => r.data),
    enabled: Boolean(source && categoryId),
    refetchInterval: (q) => (q.state.data?.status === 'RUNNING' ? 2000 : false),
  });
  const job = asUsableJob(latestJob.data);

  const refreshAfterRun = () => {
    queryClient.invalidateQueries({ queryKey: jobKey });
    queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'cjdropshipping', 'preview'] });
  };

  const startMutation = useMutation({
    mutationFn: async () => {
      const created = await api
        .post<CJDropshippingImportJobResult>('/suppliers/cjdropshipping/catalog/jobs', {
          source,
          categoryId,
          perRunLimit: Number(perRunLimit) || 25,
          currency,
          mode,
        })
        .then((r) => r.data);
      const usable = asUsableJob(created);
      if (!usable) {
        throw new Error('Import job was created but returned no usable job id — check the API response.');
      }
      return api
        .post<CJDropshippingImportJobResult>(`/suppliers/cjdropshipping/catalog/jobs/${usable.id}/advance`)
        .then((r) => r.data);
    },
    onSuccess: refreshAfterRun,
  });

  const advanceMutation = useMutation({
    mutationFn: (id: string) =>
      api
        .post<CJDropshippingImportJobResult>(`/suppliers/cjdropshipping/catalog/jobs/${id}/advance`)
        .then((r) => r.data),
    onSuccess: refreshAfterRun,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api
        .post<CJDropshippingImportJobResult>(`/suppliers/cjdropshipping/catalog/jobs/${id}/cancel`)
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobKey }),
  });

  const jobBusy = startMutation.isPending || advanceMutation.isPending || cancelMutation.isPending;
  const canStart = Boolean(source && categoryId) && !job && !jobBusy;

  const categories = categoriesQuery.data ?? [];
  const hasNoCategories = categories.length === 0 && !categoriesQuery.isLoading;

  let disabledReason = '';
  if (!source) {
    disabledReason = 'Enter a search keyword or select a CJ category';
  } else if (!categoryId) {
    disabledReason = hasNoCategories
      ? 'Create a category first in Admin > Categories'
      : 'Select a category to start importing';
  } else if (jobBusy) {
    disabledReason = 'Import operation is in progress';
  }

  const jobStatusVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
    PENDING: 'default', RUNNING: 'info', PAUSED: 'info',
    COMPLETED: 'success', CANCELLED: 'warning', FAILED: 'error',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Import CJdropshipping catalog</CardTitle>
        <CardDescription>
          Search the CJ catalog by keyword or category, preview results, then import page-by-page as
          DRAFT into one AUREVO category. Each run advances one page and persists the cursor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasNoCategories && (
          <Alert variant="warning">
            No categories found. Create a category in{' '}
            <Link to="/admin/categories" className="font-medium underline hover:text-[var(--color-text-primary)]">
              Admin &gt; Categories
            </Link>{' '}
            before importing products.
          </Alert>
        )}
        {/* Search + target category */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2 space-y-1">
            <Label htmlFor="cj-search-query">Search keyword</Label>
            <Input
              id="cj-search-query"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. phone case, LED lights…"
            />
          </div>
          <div>
            <Select
              label="CJ category (optional)"
              value={cjCategoryId}
              onChange={(e) => { setCJCategoryId(e.target.value); if (e.target.value) setSearchQuery(''); }}
              placeholder={cjCategoriesQuery.isLoading ? 'Loading…' : 'All categories'}
              options={(cjCategoriesQuery.data?.categories ?? []).map((c) => ({
                value: c.id, label: c.name,
              }))}
              fullWidth
            />
          </div>
          <div>
            <Select
              label="AUREVO category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder={categoriesQuery.isLoading ? 'Loading…' : 'Select category'}
              options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              fullWidth
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="cj-per-run">Page size</Label>
            <Input
              id="cj-per-run"
              type="number"
              min={1} max={50}
              value={perRunLimit}
              onChange={(e) => setPerRunLimit(e.target.value)}
            />
          </div>
          <div>
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={CJ_IMPORT_CURRENCIES.map((c) => ({ value: c, label: c }))}
              fullWidth
            />
          </div>
          <div>
            <Select
              label="On duplicate"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'update' | 'skip')}
              options={[{ value: 'update', label: 'Update existing' }, { value: 'skip', label: 'Skip existing' }]}
              fullWidth
            />
          </div>
        </div>

        {cjCategoriesQuery.data?.error && (
          <Alert variant="error">{cjCategoriesQuery.data.error}</Alert>
        )}

        {/* Job progress */}
        {job && (
          <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Import job</span>
              <Badge variant={jobStatusVariant[job.status] ?? 'default'}>{job.status}</Badge>
              <span className="text-sm text-[var(--color-text-secondary)]">
                Page {job.nextPage - 1} · {fmt(job.processedCount)} processed
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div className="text-center"><span className="block text-lg font-semibold">{fmt(job.importedCount)}</span><span className="text-[var(--color-text-secondary)]">imported</span></div>
              <div className="text-center"><span className="block text-lg font-semibold">{fmt(job.updatedCount)}</span><span className="text-[var(--color-text-secondary)]">updated</span></div>
              <div className="text-center"><span className="block text-lg font-semibold">{fmt(job.skippedCount)}</span><span className="text-[var(--color-text-secondary)]">skipped</span></div>
              <div className="text-center"><span className="block text-lg font-semibold text-[var(--color-danger)]">{fmt(job.errorCount)}</span><span className="text-[var(--color-text-secondary)]">errors</span></div>
            </div>
            {job.errorMessage && <Alert variant="error">{job.errorMessage}</Alert>}
            <div className="flex flex-wrap gap-2">
              {['PENDING', 'PAUSED'].includes(job.status) && (
                <Button
                  variant="primary"
                  onClick={() => advanceMutation.mutate(job.id)}
                  disabled={jobBusy}
                  style={{ cursor: jobBusy ? 'not-allowed' : 'pointer' }}
                >
                  {advanceMutation.isPending ? 'Advancing…' : 'Continue (next page)'}
                </Button>
              )}
              {['PENDING', 'PAUSED', 'RUNNING'].includes(job.status) && (
                <Button
                  variant="ghost"
                  onClick={() => cancelMutation.mutate(job.id)}
                  disabled={cancelMutation.isPending}
                  style={{ cursor: cancelMutation.isPending ? 'not-allowed' : 'pointer' }}
                >
                  Cancel
                </Button>
              )}
              {job.status === 'COMPLETED' && (
                <span className="text-sm text-[var(--color-success)]">All pages imported.</span>
              )}
            </div>
          </div>
        )}

        {!job && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div title={!canStart ? disabledReason : undefined} className="inline-block">
                <Button
                  variant="primary"
                  onClick={() => startMutation.mutate()}
                  disabled={!canStart}
                  style={{ cursor: canStart ? 'pointer' : 'not-allowed' }}
                >
                  {startMutation.isPending ? 'Starting…' : 'Start import (first page)'}
                </Button>
              </div>
              {startMutation.isError && (
                <span className="text-sm text-[var(--color-danger)]">
                  {startMutation.error instanceof Error ? startMutation.error.message : 'Start failed'}
                </span>
              )}
            </div>
            {!canStart && disabledReason && (
              <p className="text-xs text-[var(--color-text-secondary)]">
                {disabledReason}
              </p>
            )}
          </div>
        )}
        {startMutation.isError && (
          <Alert variant="error">
            {startMutation.error instanceof Error ? startMutation.error.message : 'Start failed'}
          </Alert>
        )}

        {/* Preview table */}
        <div className="border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Preview — first page before import</h3>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {preview.data?.total != null && `${preview.data.total.toLocaleString()} products found`}
            </span>
          </div>
          {preview.isLoading ? (
            <div className="flex justify-center py-6"><Spinner label="Loading preview…" /></div>
          ) : (
            <Table
              data={preview.data?.products ?? []}
              keyExtractor={(p) => p.productId}
              emptyMessage="Enter a search term or select a CJ category to preview."
              columns={[
                {
                  key: 'image', header: '',
                  render: (p: CJSearchProduct) =>
                    p.images[0] ? (
                      <img src={p.images[0]} alt="" className="w-10 h-10 object-cover rounded" />
                    ) : <span className="text-[var(--color-text-secondary)]">—</span>,
                },
                { key: 'title', header: 'Product', render: (p: CJSearchProduct) => <span className="font-medium">{p.title}</span> },
                { key: 'price', header: 'Price', render: (p: CJSearchProduct) => formatCJImportPrice(p.priceAmount, p.priceCurrency) },
                { key: 'id', header: 'CJ ID', render: (p: CJSearchProduct) => <code>{p.productId}</code> },
              ]}
            />
          )}
        </div>
        {preview.data?.error && <Alert variant="error">{preview.data.error}</Alert>}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Supplier Directory — manual vendor CRUD + linked product mgmt
// ============================================================

interface SupplierItem {
  id: string;
  name: string;
  code: string;
  contact?: string | null;
  notes?: string | null;
  isActive: boolean;
  syncEnabled: boolean;
  _count?: { products: number };
}

interface SupplierDetail {
  id: string;
  name: string;
  code: string;
  contact?: string | null;
  notes?: string | null;
  isActive: boolean;
  syncEnabled: boolean;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  apiConfig?: Record<string, any> | null;
  products: Array<{ id: string; name: string; sku: string; status: string; basePrice: number }>;
  supplierProducts: Array<{
    id: string;
    supplierProductId: string;
    supplierVariantId?: string | null;
    productId: string;
    variantId?: string | null;
    product: { id: string; name: string; sku: string; status: string };
    syncStatus: string;
  }>;
  _count: { products: number; supplierProducts: number };
}

interface SupplierDirectoryProps {
  data: SupplierItem[] | undefined;
  isLoading: boolean;
}

function SupplierDirectory({ data, isLoading }: SupplierDirectoryProps) {
  const queryClient = useQueryClient();
  const [showDetail, setShowDetail] = useState<SupplierDetail | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierItem | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
      setDeletingSupplier(null);
    },
  });

  const detailQuery = useQuery({
    queryKey: ['admin', 'suppliers', 'detail', showDetail?.id],
    queryFn: () => api.get<SupplierDetail>(`/suppliers/${showDetail!.id}`).then((r) => r.data),
    enabled: Boolean(showDetail?.id),
  });

  const columns: Column<SupplierItem>[] = [
    { key: 'name', header: 'Name', render: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'code', header: 'Code', render: (s) => <code className="text-xs">{s.code}</code> },
    { key: 'contact', header: 'Contact', render: (s) => <span className="text-sm text-[var(--color-text-secondary)]">{s.contact || '—'}</span> },
    { key: 'notes', header: 'Notes', render: (s) => <span className="text-sm text-[var(--color-text-secondary)] truncate max-w-[200px] inline-block">{s.notes || '—'}</span> },
    { key: 'products', header: 'Products', render: (s) => <span className="tabular-nums">{s._count?.products ?? 0}</span>, align: 'right' as const },
    {
      key: 'status', header: 'Status', render: (s) => (
        <div className="flex items-center gap-1">
          <Badge variant={s.isActive ? 'success' : 'outline'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>
          {s.syncEnabled && <Badge variant="info">Sync</Badge>}
        </div>
      ),
    },
    {
      key: 'actions', header: '', align: 'right' as const, render: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setShowDetail(s as any)}>
            View Details
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditingSupplier(s)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeletingSupplier(s)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle as="h2">Supplier Directory</CardTitle>
            <CardDescription>
              Manage manual vendors and link products to suppliers
            </CardDescription>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            Add Supplier
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner label="Loading suppliers…" />
          </div>
        ) : (
          <Table
            data={data ?? []}
            keyExtractor={(s) => s.id}
            columns={columns}
            emptyMessage="No suppliers found. Add your first supplier above."
            hoverable
          />
        )}
      </CardContent>

      <SupplierFormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {editingSupplier && (
        <SupplierFormModal
          isOpen={Boolean(editingSupplier)}
          onClose={() => setEditingSupplier(null)}
          supplier={editingSupplier}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(deletingSupplier)}
        onClose={() => setDeletingSupplier(null)}
        onConfirm={() => { if (deletingSupplier) deleteMutation.mutate(deletingSupplier.id); }}
        title={`Delete supplier "${deletingSupplier?.name ?? ''}"?`}
        description="This cannot be undone. Suppliers with linked products cannot be deleted."
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />

      {showDetail && (
        <SupplierDetailModal
          isOpen={Boolean(showDetail)}
          onClose={() => setShowDetail(null)}
          data={detailQuery.data}
          isLoading={detailQuery.isLoading}
        />
      )}
    </Card>
  );
}

// --- Create / Edit Supplier Modal ---

interface SupplierFormProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: SupplierItem;
}

interface SupplierFormState {
  name: string;
  code: string;
  contact?: string;
  notes?: string;
  isActive: boolean;
  syncEnabled: boolean;
}

const SUPPLIER_EMPTY_FORM: SupplierFormState = { name: '', code: '', contact: '', notes: '', isActive: true, syncEnabled: false };

function SupplierFormModal({ isOpen, onClose, supplier }: SupplierFormProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(supplier);
  const [form, setForm] = useState<SupplierFormState>(
    supplier
      ? { name: supplier.name, code: supplier.code, contact: supplier.contact ?? '', notes: supplier.notes ?? '', isActive: supplier.isActive, syncEnabled: supplier.syncEnabled }
      : SUPPLIER_EMPTY_FORM,
  );

  useEffect(() => {
    if (supplier) {
      setForm({ name: supplier.name, code: supplier.code, contact: supplier.contact ?? '', notes: supplier.notes ?? '', isActive: supplier.isActive, syncEnabled: supplier.syncEnabled });
    } else {
      setForm(SUPPLIER_EMPTY_FORM);
    }
  }, [supplier]);

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/suppliers', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
      onClose();
      setForm(SUPPLIER_EMPTY_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<SupplierFormState>) =>
      api.patch(`/suppliers/${supplier!.id}`, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || (!isEditing && !form.code.trim())) return;

    if (isEditing) {
      const { code, ...rest } = form;
      updateMutation.mutate({ ...rest, name: rest.name.trim(), contact: rest.contact?.trim() || undefined, notes: rest.notes?.trim() || undefined });
    } else {
      createMutation.mutate({ ...form, name: form.name.trim(), code: form.code.trim(), contact: form.contact?.trim() || undefined, notes: form.notes?.trim() || undefined });
    }
  };

  const mutationError = createMutation.error ?? updateMutation.error;
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit supplier — ${supplier?.name}` : 'Add supplier'}
      description="Manual vendor suppliers are used for product catalog linking and order fulfillment tracking."
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          {mutationError && (
            <span className="text-sm text-[var(--color-status-error)]">
              {mutationError instanceof Error ? mutationError.message : 'Save failed'}
            </span>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={isPending || !form.name.trim() || (!isEditing && !form.code.trim())}>
              {isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create supplier'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Acme Imports"
          required
          fullWidth
        />
        <Input
          label="Code"
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          placeholder="e.g. ACME (unique identifier)"
          disabled={isEditing}
          required={!isEditing}
          fullWidth
          helperText={isEditing ? 'Code cannot be changed after creation.' : 'Unique code for this supplier (e.g. ACME).'}
        />
        <Input
          label="Contact"
          value={form.contact}
          onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
          placeholder="Email, phone, or URL"
          fullWidth
        />
        <Textarea
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Internal notes about this supplier"
          fullWidth
        />
        <div className="flex items-center gap-6">
          <Switch
            label="Active"
            checked={form.isActive}
            onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          />
          <Switch
            label="Sync enabled"
            checked={form.syncEnabled}
            onChange={(v) => setForm((f) => ({ ...f, syncEnabled: v }))}
          />
        </div>
      </form>
    </Modal>
  );
}

// --- Supplier Detail Modal ---

interface SupplierDetailProps {
  isOpen: boolean;
  onClose: () => void;
  data: SupplierDetail | undefined;
  isLoading: boolean;
}

function SupplierDetailModal({ isOpen, onClose, data, isLoading }: SupplierDetailProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [linkFeedback, setLinkFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search all products (admin catalog) to find candidates for linking
  const productsQuery = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; sku: string; status: string; supplierId?: string | null }>>('/admin/products').then((r) => r.data),
    staleTime: 60_000,
  });

  const linkMutation = useMutation({
    mutationFn: ({ supplierId, productId }: { supplierId: string; productId: string }) =>
      api.post(`/suppliers/${supplierId}/link-product`, { productId }).then((r) => r.data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'detail', vars.supplierId] });
      setSelectedProductId('');
      setSearchQuery('');
      setLinkFeedback({ type: 'success', message: 'Product linked successfully.' });
    },
    onError: (err: any) => {
      setLinkFeedback({ type: 'error', message: err?.response?.data?.message ?? err?.message ?? 'Link failed.' });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ supplierId, productId }: { supplierId: string; productId: string }) =>
      api.post(`/suppliers/${supplierId}/unlink-product`, { productId }).then((r) => r.data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', 'detail', vars.supplierId] });
      setLinkFeedback({ type: 'success', message: 'Product unlinked.' });
    },
    onError: (err: any) => {
      setLinkFeedback({ type: 'error', message: err?.response?.data?.message ?? err?.message ?? 'Unlink failed.' });
    },
  });

  // All products from the admin catalog (for the search/selector)
  const allProducts = productsQuery.data ?? [];

  // Linked product IDs (from the detail's products[] — direct supplierId link)
  const linkedProductIds = new Set((data?.products ?? []).map((p) => p.id));

  // Filter products for the search: not already linked to this supplier
  const filteredProducts = allProducts
    .filter((p) => !linkedProductIds.has(p.id))
    .filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={data ? `${data.name} (${data.code})` : 'Supplier details'}
      description="Overview and linked product management for this supplier."
      size="xl"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading supplier details…" />
        </div>
      ) : !data ? (
        <p className="text-sm text-[var(--color-text-secondary)] py-6">No data available.</p>
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--color-text-secondary)]">Contact</span>
              <p className="mt-0.5 font-medium">{data.contact || '—'}</p>
            </div>
            <div>
              <span className="text-[var(--color-text-secondary)]">Status</span>
              <div className="mt-0.5 flex items-center gap-1">
                <Badge variant={data.isActive ? 'success' : 'outline'}>{data.isActive ? 'Active' : 'Inactive'}</Badge>
                {data.syncEnabled && <Badge variant="info">Sync</Badge>}
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-[var(--color-text-secondary)]">Notes</span>
              <p className="mt-0.5">{data.notes || '—'}</p>
            </div>
            <div>
              <span className="text-[var(--color-text-secondary)]">Products (direct link)</span>
              <p className="mt-0.5 font-medium">{data._count.products}</p>
            </div>
            <div>
              <span className="text-[var(--color-text-secondary)]">Supplier products (fine-grained mapping)</span>
              <p className="mt-0.5 font-medium">{data._count.supplierProducts}</p>
            </div>
          </div>

          {data.apiConfig && Object.keys(data.apiConfig).length > 0 && (
            <div>
              <span className="text-sm text-[var(--color-text-secondary)]">Config (masked)</span>
              <pre className="mt-1 p-3 rounded bg-[var(--color-background-secondary)] text-xs font-mono overflow-auto max-h-40">
                {JSON.stringify(data.apiConfig, null, 2)}
              </pre>
            </div>
          )}

          {/* Linked Products — direct supplierId link */}
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Linked products ({data.products.length})
            </h3>
            {data.products.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No products are linked to this supplier yet.</p>
            ) : (
              <div className="border border-[var(--color-border-primary)] rounded-lg overflow-hidden">
                <Table
                  data={data.products}
                  keyExtractor={(p) => p.id}
                  compact
                  columns={[
                    { key: 'name', header: 'Product', render: (p) => <span className="font-medium">{p.name}</span> },
                    { key: 'sku', header: 'SKU', render: (p) => <code className="text-xs">{p.sku}</code> },
                    {
                      key: 'status', header: 'Status', render: (p) => (
                        <Badge variant={p.status === 'ACTIVE' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'outline'}>
                          {p.status}
                        </Badge>
                      ),
                    },
                    {
                      key: 'unlink', header: '', align: 'right' as const, width: '100px', render: (p) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setLinkFeedback(null); unlinkMutation.mutate({ supplierId: data.id, productId: p.id }); }}
                          disabled={unlinkMutation.isPending}
                        >
                          {unlinkMutation.isPending ? '…' : 'Unlink'}
                        </Button>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>

          {/* Fine-grained SupplierProduct mappings */}
          {data.supplierProducts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">
                Fine-grained mappings ({data.supplierProducts.length})
              </h3>
              <div className="border border-[var(--color-border-primary)] rounded-lg overflow-hidden">
                <Table
                  data={data.supplierProducts}
                  keyExtractor={(sp) => sp.id}
                  compact
                  columns={[
                    { key: 'supplierProductId', header: 'Supplier Product ID', render: (sp) => <code className="text-xs">{sp.supplierProductId}</code> },
                    { key: 'productName', header: 'Linked Product', render: (sp) => <span className="font-medium">{sp.product.name}</span> },
                    { key: 'productSku', header: 'SKU', render: (sp) => <code className="text-xs">{sp.product.sku}</code> },
                    { key: 'syncStatus', header: 'Sync', render: (sp) => <Badge variant="default">{sp.syncStatus}</Badge> },
                  ]}
                />
              </div>
            </div>
          )}

          {/* Link product section */}
          <div className="border-t border-[var(--color-border-primary)] pt-4">
            <h3 className="text-sm font-semibold mb-2">Link a product to this supplier</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-3">
              Search the product catalog and select a product to set its supplier association.
            </p>

            {linkFeedback && (
              <Alert variant={linkFeedback.type} className="mb-3">
                {linkFeedback.message}
              </Alert>
            )}

            <div className="space-y-3">
              <Input
                label="Search products"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedProductId(''); setLinkFeedback(null); }}
                placeholder="Type a product name or SKU…"
                fullWidth
              />

              {searchQuery.trim() && filteredProducts.length > 0 && (
                <div className="border border-[var(--color-border-primary)] rounded-lg max-h-56 overflow-y-auto divide-y divide-[var(--color-border-primary)]">
                  {filteredProducts.slice(0, 30).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--color-background-secondary)] transition-colors ${selectedProductId === p.id ? 'bg-[var(--color-interactive-primary)]/10 ring-1 ring-inset ring-[var(--color-interactive-primary)]' : ''}`}
                      onClick={() => { setSelectedProductId(p.id); setLinkFeedback(null); }}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-[var(--color-text-secondary)]">{p.sku}</span>
                      <Badge variant={p.status === 'ACTIVE' ? 'success' : 'outline'} className="ml-2">{p.status}</Badge>
                    </button>
                  ))}
                  {filteredProducts.length > 30 && (
                    <div className="px-4 py-2 text-xs text-[var(--color-text-secondary)]">
                      … +{filteredProducts.length - 30} more results. Refine your search.
                    </div>
                  )}
                </div>
              )}

              {searchQuery.trim() && filteredProducts.length === 0 && (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  No unlinked products match "{searchQuery}".
                </p>
              )}

              <Button
                variant="primary"
                size="sm"
                disabled={!selectedProductId || linkMutation.isPending}
                onClick={() => { if (selectedProductId) { setLinkFeedback(null); linkMutation.mutate({ supplierId: data.id, productId: selectedProductId }); } }}
              >
                {linkMutation.isPending ? 'Linking…' : 'Link selected product'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

type State = AliExpressConnectionStatus['state'];
type StatusVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';
type StatusBadge = { label: string; variant: StatusVariant; description: string };

function stateInfo(state: State | undefined): StatusBadge {
  switch (state) {
    case 'NOT_CONFIGURED':
      return {
        label: 'Not configured',
        variant: 'warning',
        description: 'App Key, App Secret or HTTPS callback URL are missing — configure them below.',
      };
    case 'DISCONNECTED':
      return {
        label: 'Configured · not authorized',
        variant: 'default',
        description: 'Credentials are configured but the seller has not authorized yet.',
      };
    case 'READY':
      return {
        label: 'Configured · unverified',
        variant: 'info',
        description: 'Authorized but not yet confirmed against the live AliExpress API.',
      };
    case 'CONNECTED':
      return {
        label: 'Connected · verified',
        variant: 'success',
        description: 'Authorized and verified against the live AliExpress API.',
      };
    case 'ERROR':
      return {
        label: 'Error',
        variant: 'error',
        description: 'An error occurred during authorization or verification.',
      };
    default:
      return { label: 'Unknown', variant: 'default', description: '' };
  }
}

function statusLabel(state: State | undefined): string {
  return stateInfo(state).label;
}

function statusVariant(state: State | undefined): StatusVariant {
  return stateInfo(state).variant;
}

function statusDescription(state: State | undefined): string {
  return stateInfo(state).description;
}
