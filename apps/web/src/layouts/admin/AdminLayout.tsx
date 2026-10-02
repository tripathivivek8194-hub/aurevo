import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Dropdown } from '@aurevo/design-system';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useSeo } from '../../hooks/useSeo';
import { useAuthStore, isAdmin } from '../../stores/auth';
import { initialsof } from '../../lib/format';

interface NavSection {
  label: string;
  to: string;
  built: boolean;
  end?: boolean;
}

const sections: NavSection[] = [
  { label: 'Dashboard', to: '/admin', end: true, built: true },
  { label: 'Orders', to: '/admin/orders', built: true },
  { label: 'Products', to: '/admin/products', built: true },
  { label: 'Customers', to: '/admin/customers', built: true },
  { label: 'Suppliers', to: '/admin/suppliers', built: true },
  { label: 'Reviews', to: '/admin/reviews', built: true },
  { label: 'Categories', to: '/admin/categories', built: true },
  { label: 'Analytics', to: '/admin/analytics', built: true },
  { label: 'Inventory', to: '/admin/inventory', built: true },
  { label: 'Settings', to: '/admin/settings', built: true },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  // The whole admin area is behind auth and must never be indexed.
  useSeo({
    title: 'Admin | AUREVO',
    noindex: true,
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const renderNavigation = () => (
    <nav className="flex-1 overflow-y-auto p-3 space-y-1">
      {sections.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          end={s.end}
          title={s.built ? undefined : 'Not implemented yet'}
          className={({ isActive }) =>
            [
              'flex min-h-11 items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors',
              isActive
                ? 'bg-[var(--color-interactive-primary)] text-white'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-background-hover)]',
            ].join(' ')
          }
        >
          <span>{s.label}</span>
          {!s.built && <Badge variant="warning" size="sm">soon</Badge>}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-[100dvh] bg-[var(--color-background-primary)] lg:flex">
      {/* Skip to content — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-md focus:bg-[var(--color-interactive-primary)] focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-background-secondary)] lg:flex">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <div className="text-lg font-semibold tracking-tight">AUREVO</div>
          <div className="text-xs text-[var(--color-text-secondary)]">Admin</div>
        </div>
        {renderNavigation()}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
            aria-label="Close admin menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative flex h-full w-[min(19rem,86vw)] flex-col border-r border-[var(--color-border)] bg-[var(--color-background-secondary)] shadow-2xl">
            <div className="flex min-h-16 items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <div>
                <div className="text-lg font-semibold tracking-tight">AUREVO</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Admin</div>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)]"
                aria-label="Close admin menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {renderNavigation()}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col lg:ml-60">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-background-primary)]/95 px-3 backdrop-blur sm:px-5">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-primary)] hover:bg-[var(--color-background-hover)] lg:hidden"
            aria-label="Open admin menu"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="mr-auto text-sm font-semibold lg:hidden">AUREVO Admin</span>
          <ThemeToggle />
          <div className="hidden max-w-32 truncate text-sm text-[var(--color-text-secondary)] sm:block">
            {user ? `${user.firstName} ${user.lastName}` : ''}
          </div>
          {user && isAdmin(user.role) && (
            <Dropdown
              align="right"
              trigger={
                <Avatar fallback={initialsof(user.firstName, user.lastName)} size="sm" tabIndex={0} />
              }
              items={[
                { label: 'Sign out', value: 'logout', danger: true },
              ]}
              onSelect={(v) => {
                if (v === 'logout') void handleLogout();
              }}
            />
          )}
        </header>
        <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
