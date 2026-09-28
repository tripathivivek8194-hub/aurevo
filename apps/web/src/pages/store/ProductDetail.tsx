import { useMemo, useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Label,
  Skeleton,
  Textarea,
} from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatMoney, formatDate } from '../../lib/format';
import { useSeo, canonicalFor, jsonLd } from '../../hooks/useSeo';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { ProductCard } from '../../components/store/ProductCard';
import {
  availableQuantity,
  displayPrice,
  isProductAvailable,
  primaryImage,
  type ProductSummary,
  type ProductVariant,
  type ReviewSummary,
} from '../../lib/storefront';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseAttributes(
  raw: ProductVariant['attributes'],
): Record<string, string> {
  if (!raw) return {};

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  return raw as Record<string, string>;
}

function attributeOptions(
  variants: ProductVariant[],
  key: string,
): string[] {
  const vals = new Set<string>();

  for (const variant of variants) {
    const attrs = parseAttributes(variant.attributes);

    if (attrs[key]) {
      vals.add(attrs[key]);
    }
  }

  return [...vals].sort();
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();

  /* ---- data fetches ---- */

  const productQuery = useQuery({
    queryKey: ['store', 'product', slug],
    queryFn: () =>
      api
        .get<ProductSummary>(`/products/${slug}`)
        .then((response) => response.data),
    enabled: !!slug,
  });

  const product = productQuery.data;

  const relatedQuery = useQuery({
    queryKey: ['store', 'related', product?.id],
    queryFn: () =>
      api
        .get<ProductSummary[]>(`/products/${product!.id}/related`, {
          params: { limit: 4 },
        })
        .then((response) => response.data),
    enabled: !!product?.id,
  });

  /* ---- local UI state ---- */

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [selectedVariant, setSelectedVariant] =
    useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);

  const addItem = useCartStore((state) => state.addItem);
  const cartLoading = useCartStore((state) => state.loading);

  const { status, user } = useAuthStore();
  const authenticated = status === 'authenticated' && !!user;

  const queryClient = useQueryClient();

  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewPending, setReviewPending] = useState(false);

  /* ---- SEO ---- */

  const canonical = canonicalFor(`/products/${slug ?? ''}`);

  useSeo({
    title: product?.name
      ? `${product.name} | AUREVO`
      : 'Product | AUREVO',
    description:
      product?.shortDescription ??
      product?.description ??
      undefined,
    canonical,
    ogType: 'product',
    ogImage: product?.images?.[0]?.url,
    noindex: !productQuery.isLoading && !product,
  });

  /* ---- availability & reviews ---- */

  const available = product
    ? isProductAvailable(product)
    : false;

  const stock = product
    ? availableQuantity(product)
    : 0;

  const reviews: ReviewSummary[] =
    (product as any)?.reviews ?? [];

  const reviewCount = product?._count?.reviews ?? 0;

  const wishlistCheck = useQuery({
    queryKey: ['wishlist', 'check', product?.id],
    queryFn: () =>
      api
        .get<{ inWishlist: boolean }>(
          `/wishlist/check/${product!.id}`,
        )
        .then((response) => response.data),
    enabled: authenticated && !!product?.id,
  });

  const saved =
    wishlistCheck.data?.inWishlist ?? inWishlist;

  /* ---- Product structured data ---- */

  const productStructuredData = product
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        ...(canonical
          ? {
              '@id': canonical,
              url: canonical,
            }
          : {}),
        name: product.name,
        description:
          product.shortDescription ??
          product.description,
        image:
          product.images?.map(
            (image: { url: string }) => image.url,
          ) ?? [],
        brand: {
          '@type': 'Brand',
          name: 'AUREVO',
        },
        offers: {
          '@type': 'Offer',
          price: (
            displayPrice(product) / 100
          ).toFixed(2),
          priceCurrency: 'INR',
          availability: available
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        },
        ...(reviews.length > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(
                  (
                    reviews.reduce(
                      (sum, review) =>
                        sum + review.rating,
                      0,
                    ) / reviews.length
                  ).toFixed(1),
                ),
                reviewCount,
              },
            }
          : {}),
      }
    : null;

  /* ---- Variant attributes ---- */

  const attributeKeys = useMemo(() => {
    if (!product?.variants?.length) {
      return [];
    }

    const keys = new Set<string>();

    for (const variant of product.variants) {
      for (const key of Object.keys(
        parseAttributes(variant.attributes),
      )) {
        keys.add(key);
      }
    }

    return [...keys];
  }, [product?.variants]);

  const selectionMap = useMemo(() => {
    if (!selectedVariant) {
      return {};
    }

    return parseAttributes(
      selectedVariant.attributes,
    );
  }, [selectedVariant]);

  const activeVariant =
    selectedVariant ??
    product?.variants?.[0] ??
    null;

  /* ---- images ---- */

  const images = product?.images ?? [];

  const mainImage =
    images[activeImageIdx]?.url ??
    primaryImage(product!);

  /* ---- cart ---- */

  const handleAddToCart = async () => {
    if (!product) return;

    await addItem(
      product.id,
      quantity,
      activeVariant?.id,
    );

    await queryClient.invalidateQueries({
      queryKey: ['cart'],
    });

    setQuantity(1);
  };

  /* ---- wishlist ---- */

  const handleToggleWishlist = async () => {
    if (!product) return;

    if (!authenticated) {
      window.location.assign(
        `/login?from=${encodeURIComponent(
          `/products/${product.slug}`,
        )}`,
      );

      return;
    }

    setWishlistBusy(true);

    try {
      if (saved) {
        await api.delete('/wishlist', {
          data: {
            productId: product.id,
          },
        });

        setInWishlist(false);
      } else {
        await api.post('/wishlist', {
          productId: product.id,
        });

        setInWishlist(true);
      }

      await queryClient.invalidateQueries({
        queryKey: ['wishlist'],
      });

      await queryClient.invalidateQueries({
        queryKey: [
          'wishlist',
          'check',
          product.id,
        ],
      });
    } finally {
      setWishlistBusy(false);
    }
  };

  /* ---- reviews ---- */

  const handleSubmitReview = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (!product) return;

    setReviewError(null);
    setReviewSubmitting(true);

    try {
      await api.post('/reviews', {
        productId: product.id,
        rating: reviewRating,
        title:
          reviewTitle.trim() || undefined,
        content:
          reviewContent.trim() || undefined,
      });

      setReviewPending(true);
      setReviewTitle('');
      setReviewContent('');
      setReviewRating(5);
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : 'Could not submit review',
      );
    } finally {
      setReviewSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Loading                                                           */
  /* ---------------------------------------------------------------- */

  if (productQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <Skeleton className="aspect-square rounded-3xl" />

          <div className="space-y-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-4/5" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Error                                                             */
  /* ---------------------------------------------------------------- */

  if (productQuery.error || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)] text-xl">
            !
          </div>

          <h1 className="mt-5 text-2xl font-semibold text-[var(--color-text-primary)]">
            Product unavailable
          </h1>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
            {productQuery.error instanceof Error
              ? productQuery.error.message
              : 'We could not find this product.'}
          </p>

          <Link
            to="/products"
            className="mt-6 inline-flex"
          >
            <Button variant="primary" size="sm">
              Browse products
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Main                                                              */
  /* ---------------------------------------------------------------- */

  return (
    <div className="bg-[var(--color-background-primary)]">
      {productStructuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(
              productStructuredData,
            ),
          }}
        />
      )}

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]"
        >
          <Link
            to="/"
            className="transition-colors hover:text-[var(--color-text-primary)]"
          >
            Home
          </Link>

          <span>/</span>

          <Link
            to="/products"
            className="transition-colors hover:text-[var(--color-text-primary)]"
          >
            Products
          </Link>

          {product.category && (
            <>
              <span>/</span>

              <Link
                to={`/products?category=${encodeURIComponent(
                  product.category.slug,
                )}`}
                className="transition-colors hover:text-[var(--color-text-primary)]"
              >
                {titleCase(
                  product.category.name,
                )}
              </Link>
            </>
          )}

          <span>/</span>

          <span className="max-w-[220px] truncate text-[var(--color-text-secondary)]">
            {product.name}
          </span>
        </nav>
      </div>

      {/* Product hero */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)] lg:gap-16">
          {/* -------------------------------------------------------- */}
          {/* Gallery                                                   */}
          {/* -------------------------------------------------------- */}

          <section>
            <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
              <div className="aspect-square">
                {mainImage ? (
                  <img
                    src={mainImage}
                    alt={
                      images[activeImageIdx]?.alt ??
                      product.name
                    }
                    loading="eager"
                    className="h-full w-full object-cover transition-transform duration-500"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
                    No image available
                  </div>
                )}
              </div>

              {!available && (
                <div className="absolute left-4 top-4">
                  <Badge variant="error" size="sm">
                    Out of stock
                  </Badge>
                </div>
              )}

              {available && stock < 10 && (
                <div className="absolute left-4 top-4 rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)]/90 px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] shadow-sm backdrop-blur">
                  Only {stock} left
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() =>
                      setActiveImageIdx(index)
                    }
                    aria-label={`View image ${index + 1}`}
                    className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-200 ${
                      index === activeImageIdx
                        ? 'border-[var(--color-interactive-primary)] shadow-md'
                        : 'border-[var(--color-border)] opacity-70 hover:border-[var(--color-text-tertiary)] hover:opacity-100'
                    }`}
                  >
                    <img
                      src={image.url}
                      alt={image.alt ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* -------------------------------------------------------- */}
          {/* Product information                                      */}
          {/* -------------------------------------------------------- */}

          <section className="lg:pt-2">
            <div className="max-w-xl">
              {product.category && (
                <Link
                  to={`/products?category=${encodeURIComponent(
                    product.category.slug,
                  )}`}
                  className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-interactive-primary)] transition-colors hover:opacity-80"
                >
                  {titleCase(
                    product.category.name,
                  )}
                </Link>
              )}

              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-4xl lg:text-5xl">
                {product.name}
              </h1>

              {/* Rating */}
              {reviewCount > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  <div
                    className="flex text-sm text-amber-500"
                    aria-hidden="true"
                  >
                    ★★★★★
                  </div>

                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {reviewCount} review
                    {reviewCount === 1
                      ? ''
                      : 's'}
                  </span>
                </div>
              )}

              {/* Price */}
              <div className="mt-6 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                  {formatMoney(
                    displayPrice(product),
                  )}
                </span>

                {product.compareAtPrice &&
                  product.compareAtPrice >
                    displayPrice(product) && (
                    <>
                      <span className="text-base text-[var(--color-text-tertiary)] line-through">
                        {formatMoney(
                          product.compareAtPrice,
                        )}
                      </span>

                      <span className="rounded-full bg-[var(--color-background-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--color-interactive-primary)]">
                        Save{' '}
                        {Math.round(
                          ((product.compareAtPrice -
                            displayPrice(
                              product,
                            )) /
                            product.compareAtPrice) *
                            100,
                        )}
                        %
                      </span>
                    </>
                  )}
              </div>

              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                Inclusive of applicable taxes
              </p>

              {/* Description */}
              {(product.shortDescription ??
                product.description) && (
                <div className="mt-7 border-t border-[var(--color-border)] pt-6">
                  <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                    {product.shortDescription ??
                      product.description}
                  </p>
                </div>
              )}

              {/* Variant selectors */}
              {attributeKeys.length > 0 && (
                <div className="mt-7 space-y-6 border-t border-[var(--color-border)] pt-6">
                  {attributeKeys.map((key) => {
                    const options =
                      attributeOptions(
                        product.variants,
                        key,
                      );

                    if (!options.length) {
                      return null;
                    }

                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-[var(--color-text-primary)]">
                            {titleCase(key)}
                          </label>

                          {selectionMap[key] && (
                            <span className="text-xs text-[var(--color-text-tertiary)]">
                              {selectionMap[key]}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {options.map((value) => {
                            const isSelected =
                              selectionMap[key] ===
                              value;

                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  const match =
                                    product.variants.find(
                                      (variant) => {
                                        const attrs =
                                          parseAttributes(
                                            variant.attributes,
                                          );

                                        return (
                                          attrs[key] ===
                                          value
                                        );
                                      },
                                    );

                                  if (match) {
                                    setSelectedVariant(
                                      match,
                                    );
                                  }
                                }}
                                className={`rounded-full border px-4 py-2 text-sm transition-all duration-200 ${
                                  isSelected
                                    ? 'border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-background-primary)]'
                                    : 'border-[var(--color-border)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-primary)] hover:text-[var(--color-text-primary)]'
                                }`}
                              >
                                {value}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Purchase area */}
              <div className="mt-7 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  {/* Quantity */}
                  <div className="flex h-12 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)]">
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((current) =>
                          Math.max(1, current - 1),
                        )
                      }
                      disabled={!available}
                      aria-label="Decrease quantity"
                      className="flex h-12 w-10 items-center justify-center text-lg text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-40"
                    >
                      −
                    </button>

                    <span className="w-8 text-center text-sm font-medium text-[var(--color-text-primary)]">
                      {quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((current) =>
                          current + 1,
                        )
                      }
                      disabled={!available}
                      aria-label="Increase quantity"
                      className="flex h-12 w-10 items-center justify-center text-lg text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>

                  <Button
                    onClick={handleAddToCart}
                    disabled={
                      !available || cartLoading
                    }
                    className="h-12 flex-1 rounded-full"
                  >
                    {cartLoading
                      ? 'Adding…'
                      : available
                        ? 'Add to cart'
                        : 'Out of stock'}
                  </Button>

                  {/* Wishlist */}
                  <button
                    type="button"
                    onClick={
                      handleToggleWishlist
                    }
                    disabled={wishlistBusy}
                    aria-pressed={saved}
                    aria-label={
                      saved
                        ? 'Remove from wishlist'
                        : 'Add to wishlist'
                    }
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all ${
                      saved
                        ? 'border-[var(--color-interactive-primary)] bg-[var(--color-interactive-primary)]/10 text-[var(--color-interactive-primary)]'
                        : 'border-[var(--color-border)] bg-[var(--color-background-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-primary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill={
                        saved
                          ? 'currentColor'
                          : 'none'
                      }
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                      />
                    </svg>
                  </button>
                </div>

                {available && stock < 10 && (
                  <p className="mt-3 text-center text-xs text-[var(--color-text-tertiary)]">
                    Only {stock} left in stock
                  </p>
                )}
              </div>

              {/* Trust strip */}
              <div className="mt-6 grid grid-cols-3 divide-x divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
                <div className="px-3 py-4 text-center">
                  <p className="text-sm">✓</p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Secure checkout
                  </p>
                </div>

                <div className="px-3 py-4 text-center">
                  <p className="text-sm">↻</p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Easy support
                  </p>
                </div>

                <div className="px-3 py-4 text-center">
                  <p className="text-sm">◆</p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Curated products
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ---------------------------------------------------------- */}
        {/* Reviews                                                     */}
        {/* ---------------------------------------------------------- */}

        <section className="mt-20 border-t border-[var(--color-border)] pt-12 lg:mt-24 lg:pt-16">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-interactive-primary)]">
                Customer feedback
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
                Reviews
              </h2>

              <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--color-text-secondary)]">
                See what other customers think about this
                product.
              </p>

              {reviewCount > 0 && (
                <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5">
                  <div className="text-3xl font-semibold text-[var(--color-text-primary)]">
                    {(
                      reviews.reduce(
                        (sum, review) =>
                          sum + review.rating,
                        0,
                      ) / reviews.length
                    ).toFixed(1)}
                  </div>

                  <div className="mt-1 text-amber-500">
                    ★★★★★
                  </div>

                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Based on {reviewCount} review
                    {reviewCount === 1
                      ? ''
                      : 's'}
                  </p>
                </div>
              )}
            </div>

            <div>
              {/* Write review */}
              {authenticated && (
                <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    Share your experience
                  </h3>

                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Your feedback helps other customers.
                  </p>

                  {reviewPending && (
                    <Alert
                      variant="success"
                      className="mt-4"
                    >
                      Thanks for your review! It will
                      appear once approved by our team.
                    </Alert>
                  )}

                  {reviewError && (
                    <Alert
                      variant="error"
                      className="mt-4"
                    >
                      {reviewError}
                    </Alert>
                  )}

                  <form
                    onSubmit={handleSubmitReview}
                    className="mt-6 space-y-5"
                  >
                    <fieldset>
                      <legend className="text-sm font-medium text-[var(--color-text-primary)]">
                        Your rating
                      </legend>

                      <div
                        className="mt-2 flex gap-1"
                        role="radiogroup"
                        aria-label="Rating 1 to 5 stars"
                      >
                        {Array.from({
                          length: 5,
                        }).map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            role="radio"
                            aria-checked={
                              reviewRating ===
                              index + 1
                            }
                            onClick={() =>
                              setReviewRating(
                                index + 1,
                              )
                            }
                            className={`text-2xl transition-transform hover:scale-110 ${
                              reviewRating >=
                              index + 1
                                ? 'text-amber-500'
                                : 'text-[var(--color-text-tertiary)]'
                            }`}
                            aria-label={`${index + 1} star${
                              index === 0
                                ? ''
                                : 's'
                            }`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="review-title"
                        className="text-sm font-medium text-[var(--color-text-primary)]"
                      >
                        Title (optional)
                      </Label>

                      <input
                        id="review-title"
                        type="text"
                        maxLength={200}
                        value={reviewTitle}
                        onChange={(event) =>
                          setReviewTitle(
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-border-focus)]/20"
                        placeholder="Summarize your experience"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="review-content"
                        className="text-sm font-medium text-[var(--color-text-primary)]"
                      >
                        Your review
                      </Label>

                      <Textarea
                        id="review-content"
                        required
                        maxLength={2000}
                        value={reviewContent}
                        onChange={(event) =>
                          setReviewContent(
                            event.target.value,
                          )
                        }
                        rows={4}
                        placeholder="Share your experience with this product…"
                      />
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={
                        reviewSubmitting ||
                        !reviewContent.trim()
                      }
                    >
                      {reviewSubmitting
                        ? 'Submitting…'
                        : 'Submit review'}
                    </Button>
                  </form>
                </div>
              )}

              {/* Existing reviews */}
              <div className="mt-6 space-y-4">
                {reviews.map((review) => (
                  <article
                    key={review.id}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className="text-sm text-amber-500"
                        aria-label={`${review.rating} out of 5 stars`}
                      >
                        {Array.from({
                          length: 5,
                        }).map((_, index) => (
                          <span key={index}>
                            {index < review.rating
                              ? '★'
                              : '☆'}
                          </span>
                        ))}
                      </div>

                      {review.user && (
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {review.user.firstName}{' '}
                          {review.user.lastName}
                        </span>
                      )}

                      <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
                        {formatDate(
                          review.createdAt,
                        )}
                      </span>
                    </div>

                    {review.title && (
                      <h3 className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
                        {review.title}
                      </h3>
                    )}

                    {(review.content ??
                      review.comment) && (
                      <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                        {review.content ??
                          review.comment}
                      </p>
                    )}
                  </article>
                ))}

                {reviews.length === 0 &&
                  !reviewPending && (
                    <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        No reviews yet.
                      </p>

                      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                        Be the first to share your
                        experience.
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Related products                                            */}
        {/* ---------------------------------------------------------- */}

        {relatedQuery.data &&
          relatedQuery.data.length > 0 && (
            <section className="mt-20 border-t border-[var(--color-border)] pt-12 lg:mt-24 lg:pt-16">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-interactive-primary)]">
                    Keep exploring
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-3xl">
                    You might also like
                  </h2>
                </div>

                <Link
                  to="/products"
                  className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                >
                  View all →
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6">
                {relatedQuery.data.map(
                  (relatedProduct) => (
                    <ProductCard
                      key={relatedProduct.id}
                      product={relatedProduct}
                    />
                  ),
                )}
              </div>
            </section>
          )}
      </main>
    </div>
  );
}