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
  { label: 'Categories', to: '/admin/categories', built: true },
  { label: 'Analytics', to: '/admin/analytics', built: true },
  { label: 'Inventory', to: '/admin/inventory', built: true },
  { label: 'Settings', to: '/admin/settings', built: true },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // The whole admin area is behind auth and must never be indexed.
  useSeo({
    title: 'Admin | AUREVO',
    noindex: true,
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-[var(--color-background-primary)]">
      {/* Skip to content — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-md focus:bg-[var(--color-interactive-primary)] focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-background-secondary)] flex flex-col">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <div className="text-lg font-semibold tracking-tight">AUREVO</div>
          <div className="text-xs text-[var(--color-text-secondary)]">Admin</div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              title={s.built ? undefined : 'Not implemented yet'}
              className={({ isActive }) =>
                [
                  'flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
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
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[var(--color-border)] flex items-center justify-end px-5 gap-3">
          <ThemeToggle />
          <div className="text-sm text-[var(--color-text-secondary)]">
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
        <main id="main-content" className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
