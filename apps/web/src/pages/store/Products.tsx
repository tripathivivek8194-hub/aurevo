import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Skeleton } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { useSeo, canonicalFor, jsonLd } from '../../hooks/useSeo';
import { ProductCard } from '../../components/store/ProductCard';
import type { CategorySummary, ProductSummary } from '../../lib/storefront';

type ProductsResponse = {
  data: ProductSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

const PAGE_SIZE = 12;

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function Products() {
  const [searchParams, setSearchParams] = useSearchParams();

  const categorySlug = searchParams.get('category') ?? '';
  const query = searchParams.get('q') ?? '';
  const sort = searchParams.get('sort') ?? 'newest';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () =>
      api
        .get<CategorySummary[]>('/categories')
        .then((response) => response.data),
    staleTime: 5 * 60 * 1000,
  });

  const categories = categoriesQuery.data ?? [];

  const selectedCategory = categories.find(
    (category) => category.slug === categorySlug,
  );

  const sortMap: Record<string, string> = {
    newest: 'createdAt:desc',
    oldest: 'createdAt:asc',
    price_low: 'price:asc',
    price_high: 'price:desc',
    name: 'name:asc',
  };

  const productsQuery = useQuery({
    queryKey: [
      'products',
      {
        category: selectedCategory?.id ?? '',
        q: query,
        sort,
        page,
      },
    ],
    queryFn: () =>
      api
        .get<ProductsResponse>('/products', {
          params: {
            categoryId: selectedCategory?.id || undefined,
            q: query || undefined,
            sort: sortMap[sort] ?? sortMap.newest,
            page,
            pageSize: PAGE_SIZE,
          },
        })
        .then((response) => response.data),
  });

  const products = productsQuery.data?.data ?? [];
  const total = productsQuery.data?.meta.total ?? 0;
  const totalPages = productsQuery.data?.meta.totalPages ?? 1;

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);

    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    if (key !== 'page') {
      next.set('page', '1');
    }

    setSearchParams(next);
  };

  useSeo({
    title: selectedCategory
      ? `${titleCase(selectedCategory.name)} | AUREVO`
      : query
        ? `Search: ${query} | AUREVO`
        : 'Shop All Products | AUREVO',
    description:
      'Explore the AUREVO collection of thoughtfully selected products.',
  canonical: canonicalFor(
    `/products${
      categorySlug
        ? `?category=${encodeURIComponent(categorySlug)}`
        : query
          ? `?q=${encodeURIComponent(query)}`
          : ''
    }`,
  ),
});
  return (
    <div className="bg-[var(--color-background-primary)]">
      {/* Page header */}
      <section className="border-b border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-interactive-primary)]">
              The AUREVO collection
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-5xl lg:text-6xl">
              {selectedCategory
                ? titleCase(selectedCategory.name)
                : query
                  ? `Results for â€œ${query}â€`
                  : 'Discover something worth keeping.'}
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
              Explore products selected for usefulness, everyday living, and
              simple shopping.
            </p>
          </div>

          {/* Active filters */}
          {(query || selectedCategory) && (
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Filtering by
              </span>

              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => setParam('category')}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-focus)]"
                >
                  {titleCase(selectedCategory.name)} Ã—
                </button>
              )}

              {query && (
                <button
                  type="button"
                  onClick={() => setParam('q')}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-focus)]"
                >
                  â€œ{query}â€ Ã—
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSearchParams(new URLSearchParams());
                }}
                className="px-2 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Mobile category navigation */}
        <div className="mb-8 lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              Browse categories
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setParam('category')}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-all ${
                !categorySlug
                  ? 'border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-background-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              All
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setParam('category', category.slug)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-all ${
                  categorySlug === category.slug
                    ? 'border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-background-primary)]'
                    : 'border-[var(--color-border)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {titleCase(category.name)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Browse
                </p>

                <h2 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                  Categories
                </h2>

                <nav className="mt-5 space-y-1">
                  <button
                    type="button"
                    onClick={() => setParam('category')}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                      !categorySlug
                        ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <span>All products</span>
                    {!categorySlug && <span>âœ“</span>}
                  </button>

                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setParam('category', category.slug)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                        categorySlug === category.slug
                          ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      <span>{titleCase(category.name)}</span>
                      {categorySlug === category.slug && <span>âœ“</span>}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </aside>

          {/* Product area */}
          <section>
            {/* Toolbar */}
            <div className="mb-6 flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {productsQuery.isLoading
                    ? 'Finding productsâ€¦'
                    : `${total} product${total === 1 ? '' : 's'}`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label
                  htmlFor="product-sort"
                  className="text-xs font-medium text-[var(--color-text-tertiary)]"
                >
                  Sort
                </label>

                <select
                  id="product-sort"
                  value={sort}
                  onChange={(event) => setParam('sort', event.target.value)}
                  className="h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-4 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-border-focus)]"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="price_low">Price: Low to high</option>
                  <option value="price_high">Price: High to low</option>
                  <option value="name">Name: Aâ€“Z</option>
                </select>
              </div>
            </div>

            {/* Error */}
            {productsQuery.isError && (
              <Alert variant="error" className="mb-6">
                We couldn't load the products right now. Please try again.
              </Alert>
            )}

            {/* Loading */}
            {productsQuery.isLoading && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]"
                  >
                    <Skeleton className="aspect-[4/5] w-full" />

                    <div className="space-y-3 p-4 sm:p-5">
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-5 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty */}
            {!productsQuery.isLoading &&
              !productsQuery.isError &&
              products.length === 0 && (
                <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-background-secondary)] px-6 py-16 text-center sm:px-10">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background-primary)] text-2xl">
                    âŒ•
                  </div>

                  <h2 className="mt-5 text-xl font-semibold text-[var(--color-text-primary)]">
                    Nothing matched this search.
                  </h2>

                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
                    Try another search or browse the full collection to find
                    something that catches your eye.
                  </p>

                  <Link to="/products" className="mt-6 inline-block">
                    <Button variant="primary" size="sm">
                      Browse all products
                    </Button>
                  </Link>
                </div>
              )}

            {/* Products */}
            {!productsQuery.isLoading &&
              !productsQuery.isError &&
              products.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:gap-x-6 xl:grid-cols-4">
                    {products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--color-border)] pt-6 sm:flex-row">
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        Page {page} of {totalPages}
                      </p>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page <= 1}
                          onClick={() =>
                            setParam('page', String(Math.max(1, page - 1)))
                          }
                        >
                          â† Previous
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages}
                          onClick={() =>
                            setParam(
                              'page',
                              String(Math.min(totalPages, page + 1)),
                            )
                          }
                        >
                          Next â†’
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
          </section>
        </div>
      </div>
    </div>
  );
}
