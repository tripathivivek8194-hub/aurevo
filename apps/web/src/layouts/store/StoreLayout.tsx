import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@aurevo/design-system';
import { ThemeToggle } from '../../components/ThemeToggle';
import { isAdmin, useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { api } from '../../lib/api';
import type { CategorySummary } from '../../lib/storefront';
import { BrandLogo } from '../../components/BrandLogo';
import { openCookieSettings } from '../../components/CookieConsent';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const accountMenuRef = useRef<HTMLDivElement>(null);

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
    setAccountMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    const closeWhenClickedOutside = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', closeWhenClickedOutside);
    return () => window.removeEventListener('mousedown', closeWhenClickedOutside);
  }, [accountMenuOpen]);

  const authenticated = status === 'authenticated' && !!user;

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();

    const q = search.trim();

    if (q) {
      navigate(`/products?q=${encodeURIComponent(q)}`);
      setMobileMenuOpen(false);
    }
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
              className="group flex shrink-0 items-center"
              aria-label="AUREVO home"
            >
              <BrandLogo descriptor="Store" />
            </Link>

            {/* Desktop category navigation */}
            <nav
              className="hidden shrink-0 items-center gap-1 lg:flex"
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
                All
              </NavLink>

              {categories.slice(0, 4).map((cat) => (
                <NavLink
                  key={cat.id}
                  to={`/products?category=${encodeURIComponent(cat.slug)}`}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-full px-3 py-2 text-sm transition-all duration-200 ${
                      isActive
                        ? 'bg-[var(--color-background-hover)] font-medium text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]'
                    }`
                  }
                >
                  {titleCase(cat.name)}
                </NavLink>
              ))}
            </nav>

            {/* Desktop search */}
            <form
              onSubmit={handleSearch}
              className="hidden min-w-0 flex-1 md:block lg:ml-auto"
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
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search AUREVO"
                  aria-label="Search products"
                  className="h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] pl-11 pr-4 text-sm text-[var(--color-text-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-border-focus)]/20"
                />
              </div>
            </form>

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
              <div className="hidden items-center gap-2 lg:flex">
                {authenticated ? (
                  <div ref={accountMenuRef} className="relative">
                    <button
                      type="button"
                      aria-label="Open account menu"
                      aria-expanded={accountMenuOpen}
                      aria-haspopup="menu"
                      onClick={() => setAccountMenuOpen((open) => !open)}
                      className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] py-1.5 pl-2 pr-3 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition-all hover:border-[var(--color-border-focus)] hover:bg-[var(--color-background-hover)]"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-interactive-primary)] text-xs font-bold text-white">
                        {user.firstName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="max-w-24 truncate">{user.firstName}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-[var(--color-text-tertiary)]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </button>

                    {accountMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-2 shadow-2xl"
                      >
                        <div className="border-b border-[var(--color-border)] px-3 py-2.5">
                          <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">
                            {user.email}
                          </p>
                        </div>
                        <NavLink to="/account" role="menuitem" className="mt-1 flex rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]">
                          My account
                        </NavLink>
                        <NavLink to="/account/orders" role="menuitem" className="flex rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]">
                          My orders
                        </NavLink>
                        {isAdmin(user.role) && (
                          <NavLink to="/admin" role="menuitem" className="flex rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-interactive-primary)] transition-colors hover:bg-[var(--color-background-hover)]">
                            Admin dashboard
                          </NavLink>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleLogout()}
                          className="mt-1 flex w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
                        >
                          Log out
                        </button>
                      </div>
                    )}
                  </div>
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
                aria-controls="mobile-menu-panel"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="rounded-full p-2.5 text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)] lg:hidden"
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
            role="menu"
            className="border-t border-[var(--color-border)] bg-[var(--color-background-primary)]/95 p-4 shadow-2xl backdrop-blur-xl lg:hidden"
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
        <form onSubmit={handleSearch}>
          <div className="relative">
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search AUREVO"
              aria-label="Search products"
              className="h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] pl-11 pr-4 text-sm text-[var(--color-text-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-border-focus)]/20"
            />
          </div>
        </form>
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
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            {/* Brand */}
            <div className="max-w-sm">
              <Link to="/" className="inline-flex items-center">
                <BrandLogo descriptor="Store" size="lg" />
              </Link>

              <p className="mt-5 text-sm leading-6 text-[var(--color-text-secondary)]">
                A thoughtfully curated storefront built around useful products,
                trusted supplier catalogs, and a simple shopping experience.
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

            {/* AUREVO */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-primary)]">
                AUREVO
              </h2>

              <ul className="mt-5 space-y-3">
                <li>
                  <Link
                    to="/cart"
                    className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    Your cart
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
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col gap-4 border-t border-[var(--color-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--color-text-tertiary)]">
              © {new Date().getFullYear()} AUREVO. All rights reserved.
            </p>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={openCookieSettings}
                className="text-xs text-[var(--color-text-tertiary)] underline underline-offset-4 transition-colors hover:text-[var(--color-text-primary)]"
              >
                Cookie settings
              </button>
              <p className="text-xs text-[var(--color-text-tertiary)]">Curated. Simple. Yours.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
