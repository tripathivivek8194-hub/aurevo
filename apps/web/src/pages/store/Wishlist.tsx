import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Skeleton } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatMoney, formatDate } from '../../lib/format';
import {
  displayPrice,
  isProductAvailable,
  availabilityLabel,
  primaryImage,
  type ProductSummary,
} from '../../lib/storefront';
import { useSeo } from '../../hooks/useSeo';

interface WishlistItem {
  id: string;
  productId: string;
  variantId?: string | null;
  product: ProductSummary;
  createdAt: string;
}

interface Wishlist {
  id: string;
  items: WishlistItem[];
}

export function Wishlist() {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useSeo({
    title: 'My Wishlist | AUREVO',
    description: 'Products you have saved for later.',
    noindex: true,
  });

  const query = useQuery({
    queryKey: ['wishlist'],
    queryFn: () =>
      api.get<Wishlist>('/wishlist').then((r) => r.data),
  });

  const items = query.data?.items ?? [];

  const handleRemove = async (item: WishlistItem) => {
    setRemoving(item.id);
    setNotice(null);

    try {
      await api.delete('/wishlist', {
        data: {
          productId: item.productId,
          variantId: item.variantId ?? undefined,
        },
      });

      queryClient.setQueryData<Wishlist>(['wishlist'], (old) =>
        old
          ? {
              ...old,
              items: old.items.filter((i) => i.id !== item.id),
            }
          : old,
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Could not remove item',
      );
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* ------------------------------------------------------------ */}
      {/* Header                                                        */}
      {/* ------------------------------------------------------------ */}

      <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-6 sm:p-8 lg:p-10">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-white/[0.025] blur-3xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
              SAVED FOR LATER
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              My wishlist
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
              Keep the pieces you love close. Your saved products will
              stay here until you're ready to make them yours.
            </p>

            {query.data && (
              <div className="mt-5 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                {items.length}{' '}
                {items.length === 1 ? 'saved item' : 'saved items'}
              </div>
            )}
          </div>

          <Link
            to="/products"
            className="shrink-0 text-sm font-medium text-[var(--color-interactive-primary)] transition-opacity hover:opacity-70"
          >
            Continue shopping →
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Notice                                                        */}
      {/* ------------------------------------------------------------ */}

      {notice && (
        <Alert variant="error" className="mt-6">
          {notice}
        </Alert>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Loading                                                       */}
      {/* ------------------------------------------------------------ */}

      {query.isLoading && (
        <div className="mt-8 grid grid-cols-1 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4 sm:p-5"
            >
              <div className="flex gap-4">
                <Skeleton className="h-24 w-24 shrink-0 rounded-2xl" />

                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>

                <Skeleton className="hidden h-9 w-20 sm:block" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Error                                                         */}
      {/* ------------------------------------------------------------ */}

      {query.error && !query.isLoading && (
        <div className="mt-8 rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-8">
          <p className="text-lg font-semibold text-[var(--color-text-primary)]">
            We couldn't load your wishlist
          </p>

          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {query.error instanceof Error
              ? query.error.message
              : 'Something went wrong while loading your saved products.'}
          </p>

          <Button
            variant="outline"
            size="sm"
            className="mt-5"
            onClick={() => query.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Empty                                                         */}
      {/* ------------------------------------------------------------ */}

      {!query.isLoading &&
        !query.error &&
        items.length === 0 && (
          <div className="mt-8 overflow-hidden rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-background-secondary)] px-6 py-16 text-center sm:px-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] text-2xl text-[var(--color-text-secondary)]">
              ♡
            </div>

            <p className="mt-6 text-xl font-semibold text-[var(--color-text-primary)]">
              Your wishlist is empty
            </p>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
              Save products you love and they'll appear here, ready
              whenever you're ready to come back.
            </p>

            <Link to="/products" className="mt-6 inline-block">
              <Button variant="primary">
                Discover products →
              </Button>
            </Link>
          </div>
        )}

      {/* ------------------------------------------------------------ */}
      {/* Wishlist                                                       */}
      {/* ------------------------------------------------------------ */}

      {!query.isLoading &&
        !query.error &&
        items.length > 0 && (
          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  YOUR COLLECTION
                </p>

                <h2 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">
                  Saved products
                </h2>
              </div>

              <Link
                to="/products"
                className="hidden text-sm font-medium text-[var(--color-interactive-primary)] hover:opacity-70 sm:block"
              >
                Shop all →
              </Link>
            </div>

            <div className="space-y-4">
              {items.map((item) => {
                const product = item.product;
                const image = primaryImage(product);
                const available = isProductAvailable(product);

                return (
                  <article
                    key={item.id}
                    className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-border-focus)] hover:shadow-lg"
                  >
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                      {/* Product image */}
                      <Link
                        to={`/products/${product.slug}`}
                        className="relative h-28 w-full shrink-0 overflow-hidden rounded-2xl bg-[var(--color-background-primary)] sm:h-28 sm:w-28"
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={product.name}
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
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start gap-2">
                          <Link
                            to={`/products/${product.slug}`}
                            className="line-clamp-2 text-base font-semibold leading-6 text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-interactive-primary)]"
                          >
                            {product.name}
                          </Link>

                          {!available && (
                            <Badge variant="error" size="sm">
                              Out of stock
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
                            {formatMoney(displayPrice(product))}
                          </span>

                          {available && (
                            <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
                              {availabilityLabel(product)}
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                          Saved {formatDate(item.createdAt)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 gap-2 sm:flex-col">
                        <Link
                          to={`/products/${product.slug}`}
                          className="flex-1 sm:flex-none"
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                          >
                            View product
                          </Button>
                        </Link>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(item)}
                          disabled={removing === item.id}
                          className="flex-1 sm:flex-none"
                        >
                          {removing === item.id
                            ? 'Removing…'
                            : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
}
