import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Skeleton } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatMoney, formatDate } from '../../lib/format';
import { getSessionId } from '../../lib/session';
import { useAuthStore } from '../../stores/auth';
import { useRazorpay } from '../../hooks/useRazorpay';
import { useSeo } from '../../hooks/useSeo';

interface OrderItem {
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product?: {
    name: string;
    slug: string;
    images?: { url: string }[];
  };
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  email: string;
  status: string;
  subtotal: number;
  shippingCost: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  shippingAddress: string;
  notes?: string | null;
  createdAt: string;
  items: OrderItem[];
}

function parseAddress(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PAYMENT_PENDING: 'Awaiting payment',
  PAID: 'Paid',
  PROCESSING: 'Processing',
  FULFILLMENT: 'Being fulfilled',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

function statusClasses(status: string) {
  switch (status) {
    case 'PAID':
    case 'PROCESSING':
    case 'FULFILLMENT':
    case 'SHIPPED':
    case 'DELIVERED':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';

    case 'PAYMENT_PENDING':
    case 'PENDING':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400';

    case 'CANCELLED':
    case 'REFUNDED':
      return 'border-red-500/20 bg-red-500/10 text-red-400';

    default:
      return 'border-[var(--color-border)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)]';
  }
}

export function OrderConfirmation() {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get('orderNumber') ?? '';

  const authed = useAuthStore((s) => s.status === 'authenticated');

  const orderQuery = useQuery({
    queryKey: ['order', orderNumber],
    queryFn: () => {
      const params = authed ? {} : { sessionId: getSessionId() };

      return api
        .get<OrderDetail>(
          `/checkout/number/${encodeURIComponent(orderNumber)}`,
          { params },
        )
        .then((r) => r.data);
    },
    enabled: !!orderNumber,
  });

  const order = orderQuery.data;
  const address = order ? parseAddress(order.shippingAddress) : {};

  useSeo({
    title: order?.orderNumber
      ? `Order ${order.orderNumber} | AUREVO`
      : 'Order Confirmation | AUREVO',
    description: 'Your AUREVO order confirmation and payment status.',
    noindex: true,
  });

  const {
    openCheckout,
    status: paymentStatus,
    error: paymentError,
  } = useRazorpay();

  const [paidJustNow, setPaidJustNow] = useState(
    searchParams.get('paid') === '1',
  );

  const payNow = useCallback(() => {
    if (!order) return;

    setPaidJustNow(false);

    openCheckout({
      orderId: order.id,
      amount: order.total,
      currency: order.currency,
      orderNumber: order.orderNumber,
      sessionId: authed ? undefined : getSessionId(),
      name:
        [address.firstName ?? '', address.lastName ?? '']
          .filter(Boolean)
          .join(' ')
          .trim() || undefined,
      email: order.email,
      phone: (address.phone ?? '').trim() || undefined,
      onSuccess: () => {
        setPaidJustNow(true);
        void orderQuery.refetch();
      },
    }).catch(() => {
      // Payment errors are surfaced through the Razorpay hook state.
    });
  }, [order, authed, address, openCheckout, orderQuery]);

  if (orderQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <Skeleton className="mx-auto h-16 w-16 rounded-full" />
            <Skeleton className="mx-auto mt-6 h-9 w-64" />
            <Skeleton className="mx-auto mt-3 h-5 w-80 max-w-full" />
          </div>

          <div className="mt-10 overflow-hidden rounded-3xl border border-[var(--color-border)]">
            <Skeleton className="h-20 w-full" />
            <div className="space-y-4 p-6">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (orderQuery.error || !order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-8 text-center shadow-sm sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
            AUREVO
          </p>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            We couldn't find that order
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
            {orderNumber
              ? orderQuery.error instanceof Error
                ? orderQuery.error.message
                : 'The order may no longer be available or the link may be invalid.'
              : 'No order number was provided.'}
          </p>

          <Link to="/products" className="mt-8 inline-block">
            <Button variant="outline">Continue shopping</Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[order.status] ?? order.status;
  const hasPaymentIssue =
    order.status === 'PAYMENT_PENDING' && !paidJustNow;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
      {/* Success header */}
      <section className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_50px_rgba(16,185,129,0.12)]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-9 w-9 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
          AUREVO ORDER
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          {paidJustNow ? 'Payment confirmed.' : 'Order placed successfully.'}
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)] sm:text-base">
          Thank you for shopping with AUREVO. Your order confirmation has been
          sent to{' '}
          <span className="font-medium text-[var(--color-text-primary)]">
            {order.email}
          </span>
          .
        </p>
      </section>

      {/* Payment confirmation */}
      {paidJustNow && (
        <div className="mx-auto mt-8 max-w-3xl">
          <Alert variant="success">
            Payment successful — your order is confirmed and is now being
            processed.
          </Alert>
        </div>
      )}

      {/* Payment pending */}
      {hasPaymentIssue && (
        <div className="mx-auto mt-8 max-w-3xl">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 sm:p-6">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>

              <div className="min-w-0">
                <h2 className="font-semibold text-[var(--color-text-primary)]">
                  Payment still pending
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                  Your order has been created, but payment has not been
                  completed yet. You can safely try the payment again below.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order identity */}
      <section className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-primary)] shadow-sm">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-background-secondary)] px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                Order number
              </p>
              <p className="mt-1 font-mono text-base font-semibold tracking-wide text-[var(--color-text-primary)]">
                {order.orderNumber}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClasses(
                  order.status,
                )}`}
              >
                <span className="mr-2 h-1.5 w-1.5 rounded-full bg-current" />
                {statusLabel}
              </span>

              <span className="text-sm text-[var(--color-text-tertiary)]">
                {formatDate(order.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="divide-y divide-[var(--color-border)]">
          {order.items.map((item, idx) => {
            const image = item.product?.images?.[0]?.url;

            return (
              <div
                key={`${item.productName}-${idx}`}
                className="flex gap-4 px-5 py-5 sm:px-7"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] sm:h-24 sm:w-24">
                  {image ? (
                    <img
                      src={image}
                      alt={item.productName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--color-text-tertiary)]">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16l4.5-4.5a1.5 1.5 0 012.12 0L14 14.88l1.38-1.38a1.5 1.5 0 012.12 0L20 16M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold text-[var(--color-text-primary)] sm:text-base">
                      {item.productName}
                    </p>

                    {item.variantName && (
                      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                        {item.variantName}
                      </p>
                    )}

                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                      {item.quantity} × {formatMoney(item.unitPrice)}
                    </p>
                  </div>

                  <p className="shrink-0 text-right text-sm font-semibold text-[var(--color-text-primary)]">
                    {formatMoney(item.totalPrice)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="border-t border-[var(--color-border)] bg-[var(--color-background-secondary)] px-5 py-6 sm:px-7">
          <div className="ml-auto max-w-md space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[var(--color-text-secondary)]">
                Subtotal
              </span>
              <span className="text-[var(--color-text-primary)]">
                {formatMoney(order.subtotal)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-[var(--color-text-secondary)]">
                Shipping
              </span>
              <span className="text-[var(--color-text-primary)]">
                {order.shippingCost === 0
                  ? 'Free'
                  : formatMoney(order.shippingCost)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-[var(--color-text-secondary)]">Tax</span>
              <span className="text-[var(--color-text-primary)]">
                {formatMoney(order.tax)}
              </span>
            </div>

            {order.discount > 0 && (
              <div className="flex items-center justify-between gap-4 text-emerald-400">
                <span>Discount</span>
                <span>-{formatMoney(order.discount)}</span>
              </div>
            )}

            <div className="my-4 border-t border-[var(--color-border)]" />

            <div className="flex items-center justify-between gap-4">
              <span className="text-base font-semibold text-[var(--color-text-primary)]">
                Total
              </span>
              <span className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                {formatMoney(order.total)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Supporting information */}
      <div className="mx-auto mt-6 grid max-w-5xl gap-6 lg:grid-cols-2">
        {/* Shipping address */}
        {Object.keys(address).length > 0 && (
          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-background-secondary)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-[var(--color-text-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21s7-4.5 7-10a7 7 0 10-14 0c0 5.5 7 10 7 10z"
                  />
                  <circle cx="12" cy="11" r="2.5" />
                </svg>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                  Delivery
                </p>
                <h2 className="mt-0.5 text-base font-semibold text-[var(--color-text-primary)]">
                  Shipping address
                </h2>
              </div>
            </div>

            <address className="mt-6 not-italic text-sm leading-6 text-[var(--color-text-secondary)]">
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

              {address.city}, {address.state} {address.postalCode}
              <br />

              {address.country}

              {address.phone && (
                <>
                  <br />
                  <span className="text-[var(--color-text-tertiary)]">
                    Phone:
                  </span>{' '}
                  {address.phone}
                </>
              )}
            </address>
          </section>
        )}

        {/* Order notes */}
        {order.notes && (
          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-background-secondary)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-[var(--color-text-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h8M8 14h5M7 4h10a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3z"
                  />
                </svg>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                  Additional details
                </p>
                <h2 className="mt-0.5 text-base font-semibold text-[var(--color-text-primary)]">
                  Order notes
                </h2>
              </div>
            </div>

            <p className="mt-6 text-sm leading-6 text-[var(--color-text-secondary)]">
              {order.notes}
            </p>
          </section>
        )}
      </div>

      {/* Payment error */}
      {paymentStatus === 'failed' && paymentError && (
        <div className="mx-auto mt-6 max-w-5xl">
          <Alert variant="error">{paymentError}</Alert>
        </div>
      )}

      {/* Actions */}
      <section className="mx-auto mt-10 max-w-5xl">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-6 text-center sm:p-8">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            Thank you for choosing AUREVO.
          </p>

          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--color-text-secondary)]">
            You can continue exploring the collection or complete payment if
            your order is still awaiting payment.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/products">
              <Button variant="outline">Continue shopping</Button>
            </Link>

            {order.status === 'PAYMENT_PENDING' && (
              <Button
                onClick={payNow}
                disabled={
                  paymentStatus === 'creating' ||
                  paymentStatus === 'verifying'
                }
              >
                {paymentStatus === 'creating' ||
                      paymentStatus === 'verifying'
                    ? 'Processing payment…'
                    : 'Pay now'}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <div className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-3">
        <div className="bg-[var(--color-background-primary)] px-5 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
            Secure order
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Your order details are protected
          </p>
        </div>

        <div className="bg-[var(--color-background-primary)] px-5 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
            Confirmation sent
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Check your email for your receipt
          </p>
        </div>

        <div className="bg-[var(--color-background-primary)] px-5 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
            AUREVO
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Curated for everyday living
          </p>
        </div>
      </div>
    </div>
  );
}
