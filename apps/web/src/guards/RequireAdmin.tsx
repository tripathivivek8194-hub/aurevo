import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@aurevo/design-system';
import { useAuthStore, isAdmin } from '../stores/auth';

export function RequireAdmin() {
  const location = useLocation();
  const { initialized, status, user } = useAuthStore();

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Checking session…" />
      </div>
    );
  }

  // UX/navigation guard only. The backend enforces ADMIN on every admin
  // endpoint; redirecting here is purely so a customer never sees admin UI.
  if (status !== 'authenticated' || !isAdmin(user?.role ?? null)) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
