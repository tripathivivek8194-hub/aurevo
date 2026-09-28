import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Skeleton } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { useSeo } from '../../hooks/useSeo';
import { formatMoney, formatDate } from '../../lib/format';
import {
  isOrderCancellable,
  orderStatusLabel,
  paymentStatus,
  PAYMENT_STATUS_LABELS,
  parseAddress,
  type OrderDetail,
} from '../../lib/orders';

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
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
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

function LifecycleRow({
  label,
  time,
  last = false,
}: {
  label: string;
  time?: string | null;
  last?: boolean;
}) {
  return (
    <div className="relative flex gap-3">
      {!last && (
        <span className="absolute left-[5px] top-3 h-full w-px bg-[var(--color-border)]" />
      )}

      <span
        className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
          time
            ? 'border-[var(--color-background-primary)] bg-[var(--color-interactive-primary)]'
            : 'border-[var(--color-border)] bg-[var(--color-background-secondary)]'
        }`}
      />

      <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pb-4">
        <span
          className={`text-sm ${
            time
              ? 'font-medium text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-tertiary)]'
          }`}
        >
          {label}
        </span>

        {time && (
          <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">
            {formatDate(time)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  /* -------------------------------------------------------------- */
  /* Fetch order                                                     */
  /* -------------------------------------------------------------- */

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () =>
      api.get<OrderDetail>(`/orders/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  useSeo({
    title: 'Order Details | AUREVO',
    description: 'Review a past AUREVO order — status, items, and shipping.',
    noindex: true,
  });

  const order = orderQuery.data;
  const payment = paymentStatus(order ?? ({} as OrderDetail));

  /* -------------------------------------------------------------- */
  /* Cancel order                                                    */
  /* -------------------------------------------------------------- */

  const cancelMutation = useMutation({
    mutationFn: () =>
      api.post(`/orders/${id}/cancel`, {
        reason: cancelReason.trim() || undefined,
      }),

    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['order', id],
      });

      void queryClient.invalidateQueries({
        queryKey: ['orders', 'me'],
      });

      setCancelOpen(false);
      setCancelReason('');
      setCancelError(null);
    },

    onError: (err: any) => {
      setCancelError(
        err?.message ?? 'Could not cancel this order.',
      );
    },
  });

  /* -------------------------------------------------------------- */
  /* Loading                                                         */
  /* -------------------------------------------------------------- */

  if (orderQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-5 h-10 w-72" />

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-[520px] w-full rounded-3xl" />
          <div className="space-y-6">
            <Skeleton className="h-64 w-full rounded-3xl" />
            <Skeleton className="h-48 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- */
  /* Error                                                           */
  /* -------------------------------------------------------------- */

  if (orderQuery.error || !order) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-8 sm:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
            ORDER
          </p>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            Order unavailable
          </h1>

          <Alert variant="error" className="mt-6 max-w-xl">
            {orderQuery.error instanceof Error
              ? orderQuery.error.message
              : 'Order not found or you do not have access to it.'}
          </Alert>

          <Link
            to="/account/orders"
            className="mt-6 inline-flex text-sm font-medium text-[var(--color-interactive-primary)] transition-opacity hover:opacity-70"
          >
            ← Back to my orders
          </Link>
        </div>
      </div>
    );
  }

  const address = parseAddress(order.shippingAddress);
  const cancellable = isOrderCancellable(order.status);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* ------------------------------------------------------------ */}
      {/* Header                                                        */}
      {/* ------------------------------------------------------------ */}

      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-6 sm:p-8">
        <Link
          to="/account/orders"
          className="text-sm font-medium text-[var(--color-interactive-primary)] transition-opacity hover:opacity-70"
        >
          ← Back to my orders
        </Link>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
              ORDER DETAILS
            </p>

            <h1 className="mt-2 break-all text-2xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
              <span className="font-normal text-[var(--color-text-secondary)]">
                Order{' '}
              </span>
              <span className="font-mono">{order.orderNumber}</span>
            </h1>

            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Placed {formatDate(order.createdAt)}
            </p>

            <p className="mt-1 break-all text-xs text-[var(--color-text-tertiary)]">
              {order.email}
            </p>
          </div>

          <div className="shrink-0">
            <Badge
              variant={statusTone(order.status)}
              size="sm"
            >
              {orderStatusLabel(order.status)}
            </Badge>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Cancellation                                                   */}
      {/* ------------------------------------------------------------ */}

      {cancellable && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
          {!cancelOpen ? (
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Need to change your order?
                </p>

                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  This order can still be cancelled before it ships.
                </p>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setCancelOpen(true)}
              >
                Cancel order
              </Button>
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Cancel this order?
              </p>

              <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                Cancellation may not be reversible once submitted.
              </p>

              <textarea
                value={cancelReason}
                onChange={(event) =>
                  setCancelReason(event.target.value)
                }
                rows={3}
                placeholder="Reason (optional)"
                className="mt-4 w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-background-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
              />

              {cancelError && (
                <p className="mt-2 text-xs text-red-500">
                  {cancelError}
                </p>
              )}

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCancelOpen(false);
                    setCancelError(null);
                  }}
                  disabled={cancelMutation.isPending}
                >
                  Keep order
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending
                    ? 'Cancelling…'
                    : 'Confirm cancellation'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Main grid                                                      */}
      {/* ------------------------------------------------------------ */}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ========================================================== */}
        {/* LEFT COLUMN                                                  */}
        {/* ========================================================== */}

        <div className="space-y-6">
          {/* -------------------------------------------------------- */}
          {/* Items                                                      */}
          {/* -------------------------------------------------------- */}

          <section className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
            <div className="flex items-end justify-between gap-4 border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  PURCHASE
                </p>

                <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                  Items
                </h2>
              </div>

              <span className="text-xs text-[var(--color-text-tertiary)]">
                {order.items.length}{' '}
                {order.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="divide-y divide-[var(--color-border)]">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 p-5 sm:p-6"
                >
                  {/* Image */}
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[var(--color-background-primary)] sm:h-24 sm:w-24">
                    {item.product?.images?.[0]?.url ? (
                      <img
                        src={item.product.images[0].url}
                        alt={item.productName}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                        No image
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    {item.product?.slug ? (
                      <Link
                        to={`/products/${item.product.slug}`}
                        className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-interactive-primary)]"
                      >
                        {item.productName}
                      </Link>
                    ) : (
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--color-text-primary)]">
                        {item.productName}
                      </p>
                    )}

                    {item.variantName && (
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        {item.variantName}
                      </p>
                    )}

                    <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                      SKU: {item.productSku}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
                      <span>
                        Qty {item.quantity}
                      </span>

                      <span aria-hidden="true">·</span>

                      <span>
                        {formatMoney(item.unitPrice)} each
                      </span>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {formatMoney(item.totalPrice)}
                    </p>

                    <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                      {item.quantity} ×{' '}
                      {formatMoney(item.unitPrice)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* -------------------------------------------------------- */}
          {/* Tracking                                                   */}
          {/* -------------------------------------------------------- */}

          {order.shipments.length > 0 && (
            <section className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
              <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  DELIVERY
                </p>

                <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                  Tracking
                </h2>
              </div>

              <div className="divide-y divide-[var(--color-border)]">
                {order.shipments.map((shipment) => (
                  <div
                    key={shipment.id}
                    className="p-5 sm:p-6"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        {shipment.carrier && (
                          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {shipment.carrier}
                          </span>
                        )}

                        {shipment.trackingNumber && (
                          <span className="rounded-lg bg-[var(--color-background-primary)] px-2.5 py-1 font-mono text-xs text-[var(--color-text-secondary)]">
                            {shipment.trackingNumber}
                          </span>
                        )}

                        <Badge variant="info" size="sm">
                          {shipment.status}
                        </Badge>
                      </div>

                      {shipment.trackingUrl && (
                        <a
                          href={shipment.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-[var(--color-interactive-primary)] hover:opacity-70"
                        >
                          Track shipment →
                        </a>
                      )}
                    </div>

                    {shipment.trackingEvents.length > 0 && (
                      <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                        <div className="space-y-4">
                          {shipment.trackingEvents.map((event) => (
                            <div
                              key={event.id}
                              className="flex gap-3"
                            >
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-interactive-primary)]" />

                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-[var(--color-text-primary)]">
                                  {event.description}
                                </p>

                                {(event.location || event.status) && (
                                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                                    {[
                                      event.location,
                                      event.status,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                )}
                              </div>

                              <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">
                                {formatDate(event.timestamp)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ========================================================== */}
        {/* RIGHT COLUMN                                                 */}
        {/* ========================================================== */}

        <div className="space-y-6">
          {/* -------------------------------------------------------- */}
          {/* Summary                                                    */}
          {/* -------------------------------------------------------- */}

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              TOTAL
            </p>

            <div className="mt-2 flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Order summary
              </h2>

              <span className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                {formatMoney(order.total)}
              </span>
            </div>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-secondary)]">
                  Subtotal
                </dt>
                <dd className="text-[var(--color-text-primary)]">
                  {formatMoney(order.subtotal)}
                </dd>
              </div>

              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-secondary)]">
                  Shipping
                </dt>
                <dd className="text-[var(--color-text-primary)]">
                  {order.shippingCost === 0
                    ? 'Free'
                    : formatMoney(order.shippingCost)}
                </dd>
              </div>

              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-secondary)]">
                  Tax
                </dt>
                <dd className="text-[var(--color-text-primary)]">
                  {formatMoney(order.tax)}
                </dd>
              </div>

              {order.discount > 0 && (
                <div className="flex justify-between gap-4 text-green-600">
                  <dt>Discount</dt>
                  <dd>-{formatMoney(order.discount)}</dd>
                </div>
              )}

              <div className="border-t border-[var(--color-border)] pt-4">
                <div className="flex items-center justify-between gap-4">
                  <dt className="font-semibold text-[var(--color-text-primary)]">
                    Total
                  </dt>

                  <dd className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                    {formatMoney(order.total)}
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          {/* -------------------------------------------------------- */}
          {/* Payment                                                    */}
          {/* -------------------------------------------------------- */}

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              TRANSACTION
            </p>

            <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
              Payment
            </h2>

            <div className="mt-4">
              <Badge
                variant={
                  payment === 'CAPTURED'
                    ? 'success'
                    : payment === 'FAILED'
                      ? 'error'
                      : 'info'
                }
                size="sm"
              >
                {payment === 'NONE'
                  ? 'No payment yet'
                  : PAYMENT_STATUS_LABELS[payment] ?? payment}
              </Badge>
            </div>

            {order.payments.length > 0 && (
              <div className="mt-5 space-y-3 border-t border-[var(--color-border)] pt-4">
                {order.payments.map((paymentRecord) => (
                  <div
                    key={paymentRecord.id}
                    className="flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="text-[var(--color-text-secondary)]">
                      {paymentRecord.provider}
                      {paymentRecord.method
                        ? ` · ${paymentRecord.method}`
                        : ''}
                    </span>

                    <span className="font-medium text-[var(--color-text-primary)]">
                      {formatMoney(paymentRecord.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* -------------------------------------------------------- */}
          {/* Shipping address                                           */}
          {/* -------------------------------------------------------- */}

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              DELIVERY TO
            </p>

            <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
              Shipping address
            </h2>

            <address className="mt-4 not-italic text-sm leading-6 text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">
                {address.firstName} {address.lastName}
              </span>
              <br />

              {address.company && (
                <>
                  {address.company}
                  <br />
                </>
              )}

              {address.address1}
              <br />

              {address.address2 && (
                <>
                  {address.address2}
                  <br />
                </>
              )}

              {address.city}, {address.state}{' '}
              {address.postalCode}
              <br />

              {address.country}

              {address.phone && (
                <>
                  <br />
                  <span className="text-xs">
                    Phone: {address.phone}
                  </span>
                </>
              )}
            </address>
          </section>

          {/* -------------------------------------------------------- */}
          {/* Lifecycle                                                   */}
          {/* -------------------------------------------------------- */}

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              PROGRESS
            </p>

            <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
              Order status
            </h2>

            <div className="mt-5">
              <LifecycleRow
                label="Order placed"
                time={order.createdAt}
              />

              <LifecycleRow
                label="Payment received"
                time={order.paidAt}
              />

              <LifecycleRow
                label="Order shipped"
                time={order.shippedAt}
              />

              <LifecycleRow
                label="Delivered"
                time={order.deliveredAt}
                last
              />
            </div>
          </section>

          {/* -------------------------------------------------------- */}
          {/* Notes                                                       */}
          {/* -------------------------------------------------------- */}

          {order.notes && (
            <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                NOTE
              </p>

              <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                Order notes
              </h2>

              <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                {order.notes}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}