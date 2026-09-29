import { useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@aurevo/design-system';
import { ThemeToggle } from '../../components/ThemeToggle';
import { isAdmin, useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { displayPrice, type CategorySummary, type ProductList } from '../../lib/storefront';
import { trackStoreSession } from '../../lib/analytics';

/**
 * Customer-facing storefront shell: sticky header (brand, category nav, search,
 * auth links) + footer. Routes render into <Outlet />. This is the layout every
 * public store page shares.
 */
export function StoreLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const showBackButton = location.pathname !== '/';

  const { status, user, logout } = useAuthStore();
  const { count, refresh, mergeSessionIntoUser } = useCartStore();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categories, setCategories] = useState<CategorySummary[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 220);

    return () => window.clearTimeout(timer);
  }, [search]);

  const suggestionsQuery = useQuery({
    queryKey: ['store', 'search-suggestions', debouncedSearch],
    queryFn: () =>
      api
        .get<ProductList>('/products', {
          params: {
            search: debouncedSearch,
            status: 'ACTIVE',
            sortBy: 'createdAt',
            sortOrder: 'desc',
            limit: 5,
          },
        })
        .then((response) => response.data),
    enabled: debouncedSearch.length >= 2,
    staleTime: 60 * 1000,
  });

  const suggestions = suggestionsQuery.data?.data ?? [];

  useEffect(() => {
    trackStoreSession();
  }, []);

  // Load cart count whenever auth status changes.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (status === 'authenticated') {
        await mergeSessionIntoUser();

        if (!cancelled) {
          await refresh();
        }
      } else if (!cancelled) {
        await refresh();
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [status, refresh, mergeSessionIntoUser]);

  // Fetch top-level categories for header/footer navigation.
  useEffect(() => {
    let cancelled = false;

    async function fetchCats() {
      try {
        const data = await api.get<CategorySummary[]>('/categories/tree');

        if (!cancelled) {
          setCategories(data.data);
        }
      } catch {
        // Silently ignore; navigation will still show All Products.
      }
    }

    void fetchCats();

    return () => {
      cancelled = true;
    };
  }, []);

  // Close mobile navigation whenever the route changes.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        document.getElementById('store-menu-toggle')?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (location.pathname !== '/' || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView();
  }, [location.pathname, location.hash]);

  const authenticated = status === 'authenticated' && !!user;

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();

    const q = search.trim();

    if (q) {
      navigate(`/products?q=${encodeURIComponent(q)}`);
      setMobileMenuOpen(false);
      setSearchOpen(false);
      setActiveSuggestion(-1);
    }
  };

  const selectSuggestion = (slug: string) => {
    navigate(`/products/${slug}`);
    setSearchOpen(false);
    setActiveSuggestion(-1);
    setMobileMenuOpen(false);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSearchOpen(false);
      setActiveSuggestion(-1);
      return;
    }

    if (!suggestions.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSuggestion((current) =>
        current >= suggestions.length - 1 ? 0 : current + 1,
      );
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSuggestion((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
    }

    if (event.key === 'Enter' && activeSuggestion >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeSuggestion].slug);
    }
  };

  const renderSearch = (variant: 'desktop' | 'mobile') => {
    const resultId = `store-search-results-${variant}`;
    const showResults = searchOpen && search.trim().length >= 2;

    return (
      <form
        onSubmit={handleSearch}
        className={variant === 'desktop' ? 'hidden min-w-0 flex-1 md:block 2xl:ml-auto' : ''}
      >
        <div className="relative mx-auto max-w-xl">
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
              />
            </svg>
          </span>

          <input
            role="combobox"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchOpen(true);
              setActiveSuggestion(-1);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search AUREVO"
            aria-label="Search products"
            aria-autocomplete="list"
            aria-controls={resultId}
            aria-expanded={showResults}
            aria-activedescendant={
              activeSuggestion >= 0
                ? `${resultId}-${activeSuggestion}`
                : undefined
            }
            className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] pl-11 pr-4 text-sm text-[var(--color-text-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-border-focus)]/20"
          />

          {showResults && (
            <div
              id={resultId}
              role="listbox"
              aria-label="Product suggestions"
              className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-2 shadow-2xl"
            >
              {suggestionsQuery.isLoading ? (
                <p className="px-3 py-3 text-sm text-[var(--color-text-secondary)]" role="status">
                  Searching products…
                </p>
              ) : suggestions.length ? (
                <>
                  {suggestions.map((product, index) => (
                    <button
                      id={`${resultId}-${index}`}
                      key={product.id}
                      type="button"
                      role="option"
                      aria-selected={activeSuggestion === index}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(product.slug)}
                      className={`flex min-h-11 w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left transition-colors ${
                        activeSuggestion === index
                          ? 'bg-[var(--color-background-hover)]'
                          : 'hover:bg-[var(--color-background-hover)]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">
                          {product.name}
                        </span>
                        {product.category?.name && (
                          <span className="mt-0.5 block truncate text-xs text-[var(--color-text-tertiary)]">
                            {product.category.name}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">
                        {formatMoney(displayPrice(product))}
                      </span>
                    </button>
                  ))}

                  <button
                    type="submit"
                    className="mt-1 flex min-h-11 w-full items-center rounded-xl border-t border-[var(--color-border)] px-3 pt-3 text-left text-sm font-medium text-[var(--color-interactive-primary)] hover:opacity-75"
                  >
                    View all results for “{search.trim()}”
                  </button>
                </>
              ) : (
                <p className="px-3 py-3 text-sm text-[var(--color-text-secondary)]" role="status">
                  No matching products yet.
                </p>
              )}
            </div>
          )}
        </div>
      </form>
    );
  };

  const handleLogout = async () => {
    useCartStore.getState().clear();

    await logout();

    void refresh();

    setMobileMenuOpen(false);
    navigate('/');
  };

  const titleCase = (value: string) =>
    value.replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background-primary)]">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[9999] focus:rounded-md focus:bg-[var(--color-interactive-primary)] focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-background-primary)]/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex min-h-[4.5rem] items-center gap-3 sm:gap-5">
            {/* Brand */}
            <Link
              to="/"
              className="group flex shrink-0 items-center gap-2"
              aria-label="AUREVO home"
            >
              <span className="text-xl font-bold tracking-[-0.04em] text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-interactive-primary)] sm:text-2xl">
                AUREVO
              </span>

              <span className="hidden border-l border-[var(--color-border)] pl-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] sm:block">
                Store
              </span>
            </Link>

            {/* Desktop category navigation */}
            <nav
              className="hidden shrink-0 items-center gap-1 2xl:flex"
              aria-label="Primary navigation"
            >
              <NavLink
                to="/products"
                className={({ isActive }) =>
                  `rounded-full px-3 py-2 text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]'
                  }`
                }
              >
                Shop all
              </NavLink>

              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]">
                  Categories
                  <span className="transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
                </summary>
                <div className="absolute left-0 top-[calc(100%+0.65rem)] z-50 w-[28rem] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-3 shadow-2xl">
                  <div className="grid grid-cols-2 gap-1">
                    {categories.map((cat) => (
                      <Link
                        key={cat.id}
                        to={`/products?category=${encodeURIComponent(cat.slug)}`}
                        onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open');
                        }}
                        className="rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]"
                      >
                        {titleCase(cat.name)}
                      </Link>
                    ))}
                  </div>
                </div>
              </details>

              <Link to="/#featured" className="rounded-full px-3 py-2 text-sm text-[var(--color-text-secondary)]">Featured</Link>
              <Link to="/#why-aurevo" className="rounded-full px-3 py-2 text-sm text-[var(--color-text-secondary)]">Why AUREVO</Link>
              <Link to="/account/orders" className="rounded-full px-3 py-2 text-sm text-[var(--color-text-secondary)]">My orders</Link>

            </nav>

            {/* Desktop search */}
            {renderSearch('desktop')}

            {/* Header actions */}
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <ThemeToggle />

              {/* Cart */}
              <Link
                to="/cart"
                aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
                className="group relative rounded-full p-2.5 text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 transition-transform group-hover:scale-105"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm12.75 0a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"
                  />
                </svg>

                {count > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-interactive-primary)] px-1 text-[10px] font-bold text-white ring-2 ring-[var(--color-background-primary)]">
                    {count}
                  </span>
                )}
              </Link>

              {/* Wishlist */}
              {authenticated && (
                <Link
                  to="/account/wishlist"
                  aria-label="Wishlist"
                  className="hidden rounded-full p-2.5 text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)] sm:block"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                    />
                  </svg>
                </Link>
              )}

              {/* Desktop account actions */}
              <div className="hidden items-center gap-2 md:flex">
                {authenticated ? (
                  <>
                    {isAdmin(user?.role) && (
                      <NavLink
                        to="/admin"
                        className={({ isActive }) =>
                          `rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-[var(--color-background-hover)] text-[var(--color-interactive-primary)]'
                              : 'text-[var(--color-interactive-primary)] hover:bg-[var(--color-background-hover)]'
                          }`
                        }
                      >
                        Admin
                      </NavLink>
                    )}

                    <NavLink
                      to="/account"
                      className={({ isActive }) =>
                        `rounded-full px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-text-primary)]'
                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]'
                        }`
                      }
                    >
                      Account
                    </NavLink>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLogout}
                    >
                      Log out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/login')}
                    >
                      Sign in
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate('/register')}
                    >
                      Create account
                    </Button>
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <button
                type="button"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                id="store-menu-toggle"
                aria-controls="mobile-menu-panel"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="rounded-full p-2.5 text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)] md:hidden"
              >
                {mobileMenuOpen ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 6l12 12M18 6 6 18"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 7h16M4 12h16M4 17h16"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div
            id="mobile-menu-panel"
            className="border-t border-[var(--color-border)] bg-[var(--color-background-primary)]/95 max-h-[calc(100dvh-4.5rem)] overflow-y-auto p-4 shadow-2xl backdrop-blur-xl md:hidden"
          >
            <div className="mx-auto max-w-7xl">
              {/* Navigation */}
              <nav className="space-y-1" aria-label="Mobile navigation">
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Shop
                </p>

                <NavLink
                  to="/products"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-all ${
                      isActive
                        ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]'
                    }`
                  }
                >
                  <span>All products</span>
                  <span className="text-[var(--color-text-tertiary)]">→</span>
                </NavLink>

                {categories.map((cat) => (
                  <NavLink
                    key={cat.id}
                    to={`/products?category=${encodeURIComponent(cat.slug)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-all ${
                        isActive
                          ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]'
                      }`
                    }
                  >
                    <span>{titleCase(cat.name)}</span>
                    <span className="text-[var(--color-text-tertiary)]">→</span>
                  </NavLink>
                ))}
              </nav>

              {/* Account */}
              <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Account
                </p>

                {authenticated ? (
                  <div className="space-y-1">
                    {isAdmin(user?.role) && (
                      <NavLink
                        to="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-all ${
                            isActive
                              ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-interactive-primary)]'
                              : 'text-[var(--color-interactive-primary)] hover:bg-[var(--color-background-hover)]'
                          }`
                        }
                      >
                        <span>Admin dashboard</span>
                        <span>→</span>
                      </NavLink>
                    )}

                    <NavLink
                      to="/account"
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-all ${
                          isActive
                            ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-text-primary)]'
                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]'
                        }`
                      }
                    >
                      <span>My account</span>
                      <span className="text-[var(--color-text-tertiary)]">→</span>
                    </NavLink>

                    <NavLink
                      to="/account/wishlist"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <span>Wishlist</span>
                      <span className="text-[var(--color-text-tertiary)]">→</span>
                    </NavLink>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void handleLogout();
                      }}
                      className="mt-2 w-full"
                    >
                      Log out
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        navigate('/login');
                      }}
                      className="w-full"
                    >
                      Sign in
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        navigate('/register');
                      }}
                      className="w-full"
                    >
                      Create account
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Mobile search */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-background-primary)] px-4 pb-3 pt-2 md:hidden">
        {renderSearch('mobile')}
      </div>

      {/* Main content */}
      <main id="main-content" className="flex-1">
        {showBackButton && (
          <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] shadow-sm transition-all duration-200 hover:-translate-x-0.5 hover:border-[var(--color-border-focus)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)] active:scale-95"
            >
              <span
                className="text-base leading-none transition-transform duration-200 group-hover:-translate-x-0.5"
                aria-hidden="true"
              >
                ←
              </span>
              <span>Back</span>
            </button>
          </div>
        )}

        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-background-secondary)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
          {/* Main footer */}
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-[1.45fr_1fr_1fr_1fr_1fr]">
            {/* Brand */}
            <div className="col-span-2 max-w-sm lg:col-span-1">
              <Link to="/" className="inline-flex items-center gap-2">
                <span className="text-2xl font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">
                  AUREVO
                </span>

                <span className="border-l border-[var(--color-border)] pl-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Store
                </span>
              </Link>

              <p className="mt-5 text-sm leading-6 text-[var(--color-text-secondary)]">
                Little finds for a better everyday. Explore useful accessories
                and thoughtful additions, at your own pace.
              </p>

              <Link
                to="/products"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-interactive-primary)]"
              >
                Explore the collection
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            {/* Shop */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-primary)]">
                Shop
              </h2>

              <ul className="mt-5 space-y-3">
                <li>
                  <Link
                    to="/products"
                    className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    All products
                  </Link>
                </li>

                {categories.slice(0, 4).map((cat) => (
                  <li key={cat.id}>
                    <Link
                      to={`/products?category=${encodeURIComponent(cat.slug)}`}
                      className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                    >
                      {titleCase(cat.name)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Account */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-primary)]">
                Account
              </h2>

              <ul className="mt-5 space-y-3">
                {authenticated ? (
                  <>
                    <li>
                      <Link
                        to="/account"
                        className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        My account
                      </Link>
                    </li>

                    <li>
                      <Link
                        to="/account/orders"
                        className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        My orders
                      </Link>
                    </li>

                    <li>
                      <Link
                        to="/account/wishlist"
                        className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        Wishlist
                      </Link>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <Link
                        to="/login"
                        className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        Sign in
                      </Link>
                    </li>

                    <li>
                      <Link
                        to="/register"
                        className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        Create account
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Discover */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-primary)]">
                Discover
              </h2>

              <ul className="mt-5 space-y-3">
                <li>
                  <Link
                    to="/about"
                    className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    About AUREVO
                  </Link>
                </li>
                <li>
                  <Link
                    to="/#why-aurevo"
                    className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    Why AUREVO
                  </Link>
                </li>

                {authenticated && (
                  <li>
                    <Link
                      to="/account/wishlist"
                      className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                    >
                      Saved items
                    </Link>
                  </li>
                )}

                <li>
                  <Link
                    to="/products"
                    className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    Browse collection
                  </Link>
                </li>
              </ul>
            </div>

            {/* Customer care */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-primary)]">
                Customer care
              </h2>

              <ul className="mt-5 space-y-3">
                <li>
                  <Link to="/contact" className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
                    Contact support
                  </Link>
                </li>
                <li>
                  <Link to="/help/shipping" className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
                    Shipping information
                  </Link>
                </li>
                <li>
                  <Link to="/help/returns" className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
                    Returns & refunds
                  </Link>
                </li>
                <li>
                  <Link to="/help/privacy" className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
                    Privacy notice
                  </Link>
                </li>
                <li>
                  <Link to="/help/terms" className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
                    Terms of use
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col gap-4 border-t border-[var(--color-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--color-text-tertiary)]">
              © {new Date().getFullYear()} AUREVO. All rights reserved.
            </p>

            <p className="text-xs text-[var(--color-text-tertiary)]">
              Payments with Razorpay · Prices in INR
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
