import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  { label: 'Support', to: '/admin/support', built: true },
  { label: 'Categories', to: '/admin/categories', built: true },
  { label: 'Analytics', to: '/admin/analytics', built: true },
  { label: 'Inventory', to: '/admin/inventory', built: true },
  { label: 'Settings', to: '/admin/settings', built: true },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // The whole admin area is behind auth and must never be indexed.
  useSeo({
    title: 'Admin | AUREVO',
    noindex: true,
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navigation = (mobile = false) => (
    <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Admin navigation">
      {sections.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          end={s.end}
          onClick={() => mobile && setMobileNavOpen(false)}
          title={s.built ? undefined : 'Not implemented yet'}
          className={({ isActive }) =>
            [
              'flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors',
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
    <div className="min-h-screen bg-[var(--color-background-primary)] md:flex">
      {/* Skip to content — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-md focus:bg-[var(--color-interactive-primary)] focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-background-secondary)] md:flex md:flex-col">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <div className="text-lg font-semibold tracking-tight">AUREVO</div>
          <div className="text-xs text-[var(--color-text-secondary)]">Admin</div>
        </div>
        {navigation()}
      </aside>

      {/* Mobile drawer */}
      <aside
        aria-hidden={!mobileNavOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--color-border)] bg-[var(--color-background-secondary)] shadow-xl transition-transform duration-200 md:hidden ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <div className="text-lg font-semibold tracking-tight">AUREVO</div>
            <div className="text-xs text-[var(--color-text-secondary)]">Admin</div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-md p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-background-hover)]"
            aria-label="Close menu"
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>
        {navigation(true)}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[var(--color-border)] flex items-center justify-between px-3 sm:px-5 gap-3">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-2 text-[var(--color-text-primary)] hover:bg-[var(--color-background-hover)]"
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span className="text-sm font-semibold tracking-tight">AUREVO Admin</span>
          </div>
          <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden text-sm text-[var(--color-text-secondary)] sm:block">
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
          </div>
        </header>
        <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
