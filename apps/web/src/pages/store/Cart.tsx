import { Link, useNavigate } from 'react-router-dom';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Alert, Button, Skeleton } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useSeo } from '../../hooks/useSeo';
import { useCartStore } from '../../stores/cart';
import { getSessionId } from '../../lib/session';
import { useAuthStore } from '../../stores/auth';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface CartProduct {
  name: string;
  slug: string;
  sku: string;
  images: {
    url: string;
    alt?: string | null;
    isPrimary?: boolean;
  }[];
  inventory: {
    quantity: number;
    reservedQuantity: number;
    trackQuantity: boolean;
  }[];
}

interface CartVariant {
  name: string;
  sku: string;
  price: number;
  inventory: {
    quantity: number;
    reservedQuantity: number;
    trackQuantity: boolean;
  }[];
}

interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  priceSnapshot: number;
  product: CartProduct;
  variant: CartVariant | null;
}

interface CartResponse {
  id: string;
  items: CartItem[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function sessionParams(): { sessionId?: string } {
  const authed =
    useAuthStore.getState().status ===
    'authenticated';

  return authed
    ? {}
    : { sessionId: getSessionId() };
}

function itemImage(item: CartItem): string | null {
  return item.product?.images?.[0]?.url ?? null;
}

function itemLineTotal(item: CartItem): number {
  return item.priceSnapshot * item.quantity;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function Cart() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { refresh: refreshCartCount } =
    useCartStore();

  const authStatus = useAuthStore(
    (state) => state.status,
  );

  /* ---- fetch cart ---- */

  const cartQuery = useQuery({
    queryKey: ['cart', authStatus],
    enabled: authStatus !== 'unknown',
    queryFn: () =>
      api
        .get<CartResponse>('/cart', {
          params: sessionParams(),
        })
        .then((response) => response.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const cart = cartQuery.data;
  const items = cart?.items ?? [];

  const subtotal = items.reduce(
    (sum, item) =>
      sum + itemLineTotal(item),
    0,
  );

  const itemCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  useSeo({
    title: 'Shopping Cart | AUREVO',
    description:
      'Your AUREVO shopping bag — review items and continue to a secure checkout.',
    noindex: true,
  });

  /* ---- mutations ---- */

  const updateQty = useMutation({
    mutationFn: ({
      itemId,
      quantity,
    }: {
      itemId: string;
      quantity: number;
    }) =>
      api.patch(
        `/cart/items/${itemId}`,
        { quantity },
        { params: sessionParams() },
      ),

    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['cart'],
      });

      void refreshCartCount();
    },
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) =>
      api.delete(`/cart/items/${itemId}`, {
        params: sessionParams(),
      }),

    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['cart'],
      });

      void refreshCartCount();
    },
  });

  const busy =
    updateQty.isPending ||
    removeItem.isPending;

  /* ---------------------------------------------------------------- */
  /* Loading                                                           */
  /* ---------------------------------------------------------------- */

  // The query is disabled while authentication restores. Treat that state as
  // loading so a persisted guest cart never flashes the empty-cart screen.
  if (authStatus === 'unknown' || cartQuery.isPending) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-2xl">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-10 w-64" />
          <Skeleton className="mt-3 h-5 w-32" />
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map(
              (_, index) => (
                <Skeleton
                  key={index}
                  className="h-36 w-full rounded-2xl"
                />
              ),
            )}
          </div>

          <Skeleton className="h-80 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Error                                                             */
  /* ---------------------------------------------------------------- */

  if (cartQuery.error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)] text-lg">
            !
          </div>

          <h1 className="mt-5 text-2xl font-semibold text-[var(--color-text-primary)]">
            We couldn't load your cart
          </h1>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
            {cartQuery.error instanceof Error
              ? cartQuery.error.message
              : 'Something went wrong while loading your cart.'}
          </p>

          <Button
            variant="primary"
            size="sm"
            className="mt-6"
            onClick={() =>
              void cartQuery.refetch()
            }
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Empty cart                                                       */
  /* ---------------------------------------------------------------- */

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-interactive-primary)]">
            Your AUREVO bag
          </p>

          <div className="mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-9 w-9 text-[var(--color-text-secondary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
              />
            </svg>
          </div>

          <h1 className="mt-7 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-4xl">
            Your cart is waiting.
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
            You haven't added anything yet. Explore
            the collection and find something worth
            keeping.
          </p>

          <Link
            to="/products"
            className="mt-7 inline-flex"
          >
            <Button
              variant="primary"
              size="sm"
            >
              Explore the collection →
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Cart with items                                                   */
  /* ---------------------------------------------------------------- */

  return (
    <div className="bg-[var(--color-background-primary)]">
      {/* Header */}
      <section className="border-b border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-interactive-primary)]">
            Your AUREVO bag
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-4xl">
                Shopping cart
              </h1>

              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {itemCount} item
                {itemCount === 1 ? '' : 's'} selected
              </p>
            </div>

            <Link
              to="/products"
              className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              Continue shopping →
            </Link>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          {/* -------------------------------------------------------- */}
          {/* Items                                                      */}
          {/* -------------------------------------------------------- */}

          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                Your items
              </h2>

              <span className="text-xs text-[var(--color-text-tertiary)]">
                {items.length} product
                {items.length === 1
                  ? ''
                  : 's'}
              </span>
            </div>

            <div className="space-y-4">
              {items.map((item) => {
                const image = itemImage(item);
                const lineTotal =
                  itemLineTotal(item);

                return (
                  <article
                    key={item.id}
                    className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4 transition-all duration-200 hover:border-[var(--color-border-focus)] sm:p-5"
                  >
                    <div className="flex gap-4 sm:gap-5">
                      {/* Product image */}
                      <Link
                        to={`/products/${item.product.slug}`}
                        className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--color-background-primary)] sm:h-32 sm:w-32"
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={item.product.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                            No image
                          </div>
                        )}
                      </Link>

                      {/* Product information */}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              to={`/products/${item.product.slug}`}
                              className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-interactive-primary)] sm:text-base"
                            >
                              {item.product.name}
                            </Link>

                            {item.variant ? (
                              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                                {item.variant.name}
                              </p>
                            ) : (
                              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                                {item.product.sku}
                              </p>
                            )}
                          </div>

                          {/* Desktop price */}
                          <span className="hidden shrink-0 text-base font-semibold text-[var(--color-text-primary)] sm:block">
                            {formatMoney(lineTotal)}
                          </span>
                        </div>

                        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                          {/* Quantity */}
                          <div>
                            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                              Quantity
                            </p>

                            <div className="flex h-9 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)]">
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    item.quantity <= 1
                                  ) {
                                    removeItem.mutate(
                                      item.id,
                                    );
                                  } else {
                                    updateQty.mutate({
                                      itemId:
                                        item.id,
                                      quantity:
                                        item.quantity -
                                        1,
                                    });
                                  }
                                }}
                                disabled={busy}
                                className="flex h-9 w-9 items-center justify-center text-base text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-40"
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>

                              <span className="w-7 text-center text-xs font-semibold text-[var(--color-text-primary)]">
                                {item.quantity}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  updateQty.mutate({
                                    itemId: item.id,
                                    quantity:
                                      item.quantity +
                                      1,
                                  })
                                }
                                disabled={busy}
                                className="flex h-9 w-9 items-center justify-center text-base text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-40"
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="block text-base font-semibold text-[var(--color-text-primary)] sm:hidden">
                              {formatMoney(lineTotal)}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                removeItem.mutate(
                                  item.id,
                                )
                              }
                              disabled={removeItem.isPending}
                              className="mt-1 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors hover:text-red-500 disabled:opacity-40"
                            >
                              {removeItem.isPending
                                ? 'Removing…'
                                : 'Remove'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* -------------------------------------------------------- */}
          {/* Order summary                                              */}
          {/* -------------------------------------------------------- */}

          <aside>
            <div className="lg:sticky lg:top-24">
              <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
                <div className="border-b border-[var(--color-border)] p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                    Checkout
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
                    Order summary
                  </h2>
                </div>

                <div className="p-6">
                  <dl className="space-y-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[var(--color-text-secondary)]">
                        Subtotal
                      </dt>

                      <dd className="font-medium text-[var(--color-text-primary)]">
                        {formatMoney(subtotal)}
                      </dd>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-[var(--color-text-secondary)]">
                        Shipping
                      </dt>

                      <dd className="max-w-[150px] text-right text-xs leading-5 text-[var(--color-text-tertiary)]">
                        Calculated at checkout
                      </dd>
                    </div>
                  </dl>

                  <div className="my-5 border-t border-[var(--color-border)]" />

                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        Estimated total
                      </p>

                      <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                        Final amount shown at checkout
                      </p>
                    </div>

                    <p className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                      {formatMoney(subtotal)}
                    </p>
                  </div>

                  <Button
                    className="mt-6 h-12 w-full rounded-full"
                    onClick={() =>
                      navigate('/checkout')
                    }
                  >
                    Proceed to checkout →
                  </Button>

                  <div className="mt-4 flex items-center justify-center gap-2 text-center text-[10px] text-[var(--color-text-tertiary)]">
                    <span aria-hidden="true">✓</span>
                    <span>
                      Secure payment through Razorpay
                    </span>
                  </div>
                </div>
              </div>

              {/* Small reassurance card */}
              <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                      Secure payment
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-tertiary)]">
                      Your payment is processed securely.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                      Need help?
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-tertiary)]">
                      We're here if you need us.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
