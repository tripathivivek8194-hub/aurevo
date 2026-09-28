import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Skeleton } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { useSeo } from '../../hooks/useSeo';
import { formatMoney, formatDate } from '../../lib/format';
import { orderStatusLabel, type OrderListResponse } from '../../lib/orders';

/* ------------------------------------------------------------------ */
/* Status styling                                                      */
/* ------------------------------------------------------------------ */

function statusTone(
  status: string,
): 'default' | 'info' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'PAID':
    case 'DELIVERED':
      return 'success';

    case 'PENDING':
    case 'PAYMENT_PENDING':
    case 'PROCESSING':
    case 'FULFILLMENT':
    case 'SHIPPED':
      return 'info';

    case 'CANCELLED':
    case 'FAILED':
    case 'RETURNED':
      return 'error';

    case 'REFUNDED':
      return 'warning';

    default:
      return 'default';
  }
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export function MyOrders() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1') || 1;
  const limit = 10;

  const ordersQuery = useQuery({
    queryKey: ['orders', 'me', page],
    queryFn: () =>
      api
        .get<OrderListResponse>('/orders/me', {
          params: {
            page,
            limit,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          },
        })
        .then((r) => r.data),
  });

  useSeo({
    title: 'My Orders | AUREVO',
    description: 'Track and review your AUREVO orders.',
    noindex: true,
  });

  const data = ordersQuery.data;
  const orders = data?.data ?? [];

  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* ------------------------------------------------------------ */}
      {/* Hero                                                          */}
      {/* ------------------------------------------------------------ */}

      <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-6 sm:p-8 lg:p-10">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-white/[0.025] blur-3xl" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
              YOUR AUREVO
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              My orders
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
              Track your purchases, review order details, and keep an eye
              on everything you've ordered from AUREVO.
            </p>

            {typeof data?.meta.total === 'number' && (
              <div className="mt-5 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                {data.meta.total}{' '}
                {data.meta.total === 1 ? 'order' : 'orders'} total
              </div>
            )}
          </div>

          <Link
            to="/account"
            className="shrink-0 text-sm font-medium text-[var(--color-interactive-primary)] transition-opacity hover:opacity-70"
          >
            ← Back to account
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Loading                                                       */}
      {/* ------------------------------------------------------------ */}

      {ordersQuery.isLoading && (
        <div className="mt-8 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5"
            >
              <div className="flex gap-4">
                <Skeleton className="h-20 w-20 shrink-0 rounded-xl" />

                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                  <Skeleton className="h-3 w-32" />
                </div>

                <Skeleton className="hidden h-5 w-24 sm:block" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Error                                                         */}
      {/* ------------------------------------------------------------ */}

      {ordersQuery.error && (
        <Alert variant="error" className="mt-8">
          {ordersQuery.error instanceof Error
            ? ordersQuery.error.message
            : 'Could not load your orders'}
        </Alert>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Empty                                                         */}
      {/* ------------------------------------------------------------ */}

      {data && orders.length === 0 && (
        <div className="mt-8 overflow-hidden rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-background-secondary)] px-6 py-16 text-center sm:px-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] text-2xl text-[var(--color-text-secondary)]">
            +
          </div>

          <p className="mt-6 text-xl font-semibold text-[var(--color-text-primary)]">
            No orders yet
          </p>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
            Your order history will appear here after you make your first
            purchase. Discover something worth keeping from the AUREVO
            collection.
          </p>

          <Link to="/products" className="mt-6 inline-block">
            <Button variant="primary" size="sm">
              Browse products →
            </Button>
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Orders                                                         */}
      {/* ------------------------------------------------------------ */}

      {orders.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                ORDER HISTORY
              </p>

              <h2 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">
                Recent purchases
              </h2>
            </div>

            {data?.meta.totalPages && data.meta.totalPages > 1 && (
              <span className="hidden text-xs text-[var(--color-text-tertiary)] sm:block">
                Page {page} of {data.meta.totalPages}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {orders.map((order) => {
              const itemCount =
                order._count?.items ?? order.items?.length ?? 0;

              const thumb = order.items?.find(
                (item) => item.product?.images?.[0]?.url,
              )?.product?.images?.[0]?.url;

              return (
                <Link
                  key={order.id}
                  to={`/account/orders/${order.id}`}
                  className="group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-border-focus)] hover:shadow-lg"
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                      {/* Product image */}
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--color-background-primary)]">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center">
                            <span className="text-lg font-semibold text-[var(--color-text-primary)]">
                              {itemCount}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-tertiary)]">
                              items
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Main information */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
                            {order.orderNumber}
                          </span>

                          <Badge
                            variant={statusTone(order.status)}
                            size="sm"
                          >
                            {orderStatusLabel(order.status)}
                          </Badge>
                        </div>

                        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                          Placed {formatDate(order.createdAt)}
                        </p>

                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          {itemCount} item
                          {itemCount === 1 ? '' : 's'}
                        </p>
                      </div>

                      {/* Total */}
                      <div className="flex items-center justify-between gap-5 border-t border-[var(--color-border)] pt-4 sm:block sm:border-0 sm:pt-0 sm:text-right">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                            Total
                          </p>

                          <p className="mt-1 text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
                            {formatMoney(order.total)}
                          </p>
                        </div>

                        <span className="text-sm font-medium text-[var(--color-interactive-primary)] transition-transform duration-200 group-hover:translate-x-0.5">
                          View details →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Pagination                                                     */}
      {/* ------------------------------------------------------------ */}

      {data && data.meta.totalPages > 1 && (
        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4 sm:flex-row">
          <button
            type="button"
            onClick={() => goToPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-40 sm:w-auto"
          >
            ← Previous
          </button>

          <span className="text-sm text-[var(--color-text-secondary)]">
            Page{' '}
            <span className="font-medium text-[var(--color-text-primary)]">
              {page}
            </span>{' '}
            of {data.meta.totalPages}
          </span>

          <button
            type="button"
            onClick={() =>
              goToPage(Math.min(data.meta.totalPages, page + 1))
            }
            disabled={page >= data.meta.totalPages}
            className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-40 sm:w-auto"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}