import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@aurevo/design-system';
import { useAuthStore } from '../stores/auth';

/**
 * UX/navigation guard for customer-account routes. The backend enforces the
 * actual permission on every authenticated endpoint; this simply redirects a
 * signed-out visitor to the sign-in page (remembering where they were headed).
 */
export function RequireAuth() {
  const location = useLocation();
  const { initialized, status } = useAuthStore();

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Checking session…" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    );
  }

  return <Outlet />;
}
