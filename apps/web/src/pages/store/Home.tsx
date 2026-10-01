import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Button, Skeleton } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { useSeo, canonicalFor, jsonLd } from '../../hooks/useSeo';
import { ProductCard } from '../../components/store/ProductCard';
import type { CategorySummary, ProductSummary } from '../../lib/storefront';

export function Home() {
  const featuredQuery = useQuery({
    queryKey: ['store', 'featured'],
    queryFn: () =>
      api.get<ProductSummary[]>('/products/featured').then((r) => r.data),
  });

  const categoriesQuery = useQuery({
    queryKey: ['store', 'categories'],
    queryFn: () =>
      api.get<CategorySummary[]>('/categories').then((r) => r.data),
  });

  useSeo({
    title: 'AUREVO | Online Shopping Store',
    description:
      'AUREVO is an online shopping store offering a curated selection of products from trusted suppliers. Browse products, compare prices, and shop securely.',
  });

  const origin = canonicalFor('');

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'AUREVO',
        ...(origin
          ? {
              '@id': origin,
              url: origin,
              logo: `${origin}aurevo-logo.png`,
            }
          : {}),
      },
      {
        '@type': 'WebSite',
        name: 'AUREVO',
        alternateName: ['AUREVO Store', 'aurevo.buzz'],
        ...(origin
          ? {
              url: origin,
              potentialAction: {
                '@type': 'SearchAction',
                target: `${origin}products?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            }
          : {}),
      },
    ],
  };

  return (
    <div className="overflow-hidden">
      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(structuredData),
        }}
      />

      {/* =========================================================
          HERO
      ========================================================= */}
      <section className="relative border-b border-[var(--color-border)] bg-[var(--color-background-secondary)]">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-[var(--color-interactive-primary)]/10 blur-3xl" />
          <div className="absolute right-0 top-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)]/70 px-4 py-2 text-xs font-medium tracking-widest text-[var(--color-text-secondary)] backdrop-blur">
              CURATED FOR EVERYDAY LIVING
            </div>

            <h1 className="text-5xl font-bold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-6xl lg:text-7xl">
              Discover something
              <span className="block text-[var(--color-interactive-primary)]">
                worth keeping.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
              Explore a carefully curated collection from trusted supplier
              catalogs — thoughtfully selected, simply presented, and ready
              when you are.
            </p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/products">
                <Button className="w-full sm:w-auto">
                  Explore collection
                </Button>
              </Link>

              <Link
                to="/products"
                className="inline-flex w-full items-center justify-center rounded-md border border-[var(--color-border-primary)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-background-hover)] sm:w-auto"
              >
                Browse categories
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          TRUST STRIP
      ========================================================= */}
      <section className="border-b border-[var(--color-border)]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-[var(--color-border)] px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="flex items-center gap-3 py-5 md:px-6 md:first:pl-0">
            <span className="text-lg">✓</span>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Secure checkout
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Protected payments
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-5 md:px-6">
            <span className="text-lg">✦</span>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Curated products
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Selected from supplier catalogs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-5 md:px-6 md:last:pr-0">
            <span className="text-lg">→</span>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Simple shopping
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Browse, choose, checkout
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          CATEGORIES
      ========================================================= */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-interactive-primary)]">
              Explore
            </p>

            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              Shop by category
            </h2>
          </div>

          <Link
            to="/products"
            className="hidden text-sm font-medium text-[var(--color-interactive-primary)] hover:underline sm:block"
          >
            View all →
          </Link>
        </div>

        {categoriesQuery.isLoading && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {categoriesQuery.error && (
          <Alert variant="error" className="mt-6">
            {categoriesQuery.error instanceof Error
              ? categoriesQuery.error.message
              : 'Could not load categories'}
          </Alert>
        )}

        {categoriesQuery.data && categoriesQuery.data.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categoriesQuery.data.map((category, index) => (
              <Link
                key={category.id}
                to={`/products?category=${encodeURIComponent(category.slug)}`}
                className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-border-focus)] hover:bg-[var(--color-background-hover)]"
              >
                <div className="flex min-h-20 flex-col justify-between">
                  <span className="text-xs font-medium tracking-widest text-[var(--color-text-tertiary)]">
                    0{index + 1}
                  </span>

                  <div className="mt-5 flex items-end justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)] sm:text-base">
                      {category.name.replace(/\b\w/g, (char) =>
                        char.toUpperCase(),
                      )}
                    </span>

                    <span className="text-lg text-[var(--color-text-tertiary)] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[var(--color-interactive-primary)]">
                      →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <Link
          to="/products"
          className="mt-6 block text-center text-sm font-medium text-[var(--color-interactive-primary)] hover:underline sm:hidden"
        >
          View all products →
        </Link>
      </section>

      {/* =========================================================
          FEATURED PRODUCTS
      ========================================================= */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-background-secondary)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-interactive-primary)]">
                AUREVO selection
              </p>

              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                Featured products
              </h2>
            </div>

            <Link
              to="/products"
              className="text-sm font-medium text-[var(--color-interactive-primary)] hover:underline"
            >
              View all →
            </Link>
          </div>

          {featuredQuery.isLoading && (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="aspect-[4/5] w-full rounded-2xl"
                />
              ))}
            </div>
          )}

          {featuredQuery.error && (
            <Alert variant="error" className="mt-8">
              {featuredQuery.error instanceof Error
                ? featuredQuery.error.message
                : 'Could not load featured products'}
            </Alert>
          )}

          {featuredQuery.data && featuredQuery.data.length === 0 && (
            <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-10 text-center">
              <p className="font-medium text-[var(--color-text-primary)]">
                No featured products yet.
              </p>

              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                Check back soon or{' '}
                <Link
                  to="/products"
                  className="font-medium text-[var(--color-interactive-primary)] hover:underline"
                >
                  browse all products
                </Link>
                .
              </p>
            </div>
          )}

          {featuredQuery.data && featuredQuery.data.length > 0 && (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {featuredQuery.data.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =========================================================
          FINAL CTA
      ========================================================= */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-[var(--color-interactive-primary)]/10 blur-3xl" />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-interactive-primary)]">
              Keep exploring
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              Find your next favourite.
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)] sm:text-base">
              Browse the full AUREVO collection and discover products selected
              for modern everyday living.
            </p>

            <div className="mt-7">
              <Link to="/products">
                <Button>Shop all products</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
