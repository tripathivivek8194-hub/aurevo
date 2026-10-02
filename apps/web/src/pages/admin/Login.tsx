import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Spinner } from '@aurevo/design-system';
import { useSeo } from '../../hooks/useSeo';
import { useAuthStore, isAdmin } from '../../stores/auth';
import { PasswordInput } from '../../components/PasswordInput';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  useSeo({
    title: 'Admin Sign In | AUREVO',
    noindex: true,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      // The backend is the authority on role. We only steer the UX from here.
      if (!isAdmin(user.role)) {
        setError('This account does not have admin access.');
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-background-primary)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-8">
      <Card variant="elevated" className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h1">AUREVO Admin</CardTitle>
          <CardDescription>Sign in with your administrator account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="error">{error}</Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@store.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="pt-1">
              <Button type="submit" variant="primary" className="h-12 w-full" disabled={submitting}>
                {submitting ? <Spinner size="sm" label="Signing in…" /> : 'Sign in'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
