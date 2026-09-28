import { FormEvent, useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Input,
  Label,
  Spinner,
} from '@aurevo/design-system';
import { useSeo } from '../../hooks/useSeo';
import { isAdmin, useAuthStore } from '../../stores/auth';
import {
  GoogleSignInButton,
  isGoogleSignInAvailable,
} from '../../components/GoogleSignInButton';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const login = useAuthStore((s) => s.login);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  useSeo({
    title: 'Sign In | AUREVO',
    description: 'Sign in to your AUREVO account.',
    noindex: true,
  });

  const destinationFor = (
    user: Awaited<ReturnType<typeof login>>,
  ) => (from !== '/' ? from : isAdmin(user?.role) ? '/admin' : '/');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await login(email, password);
      navigate(destinationFor(user), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setError(null);
      setGoogleSubmitting(true);

      try {
        const user = await loginWithGoogle(idToken);
        navigate(destinationFor(user), { replace: true });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Google sign-in failed',
        );
      } finally {
        setGoogleSubmitting(false);
      }
    },
    [loginWithGoogle, navigate, from],
  );

  return (
    <div className="min-h-screen bg-[var(--color-background-primary)]">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* Brand panel */}
        <section className="relative hidden overflow-hidden lg:flex">
          <div className="absolute inset-0 bg-[var(--color-background-secondary)]" />

          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/[0.03] blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-white/[0.025] blur-3xl" />

          <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
            <Link
              to="/"
              className="inline-flex w-fit items-center text-2xl font-semibold tracking-[0.22em] text-[var(--color-text-primary)]"
            >
              AUREVO
            </Link>

            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-text-tertiary)]">
                CURATED FOR EVERYDAY LIVING
              </p>

              <h1 className="mt-6 text-5xl font-semibold leading-[1.08] tracking-tight text-[var(--color-text-primary)] xl:text-6xl">
                Welcome back to
                <span className="block">AUREVO.</span>
              </h1>

              <p className="mt-6 max-w-lg text-base leading-7 text-[var(--color-text-secondary)]">
                Your saved products, orders and favourites are waiting for
                you. Sign in and continue where you left off.
              </p>

              <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]/40 p-4 backdrop-blur-sm">
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                    01
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">
                    Curated products
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]/40 p-4 backdrop-blur-sm">
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                    02
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">
                    Simple checkout
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]/40 p-4 backdrop-blur-sm">
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                    03
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">
                    Secure account
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-tertiary)]">
              © AUREVO · Discover something worth keeping.
            </p>
          </div>
        </section>

        {/* Login panel */}
        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:min-h-0 lg:px-12 xl:px-20">
          <div className="w-full max-w-md">
            {/* Mobile brand */}
            <div className="mb-10 lg:hidden">
              <Link
                to="/"
                className="text-xl font-semibold tracking-[0.2em] text-[var(--color-text-primary)]"
              >
                AUREVO
              </Link>
            </div>

            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                YOUR ACCOUNT
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                Sign in
              </h2>

              <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                Welcome back. Enter your details to continue to AUREVO.
              </p>
            </div>

            {error && (
              <Alert variant="error" className="mb-6">
                {error}
              </Alert>
            )}

            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 shadow-sm sm:p-7">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>

                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Password</Label>

                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-[var(--color-interactive-primary)] transition-opacity hover:opacity-75"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="h-12 w-full"
                  disabled={submitting || googleSubmitting}
                >
                  {submitting ? (
                    <Spinner size="sm" label="Signing in…" />
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>

              {isGoogleSignInAvailable && (
                <>
                  <div className="my-6 flex items-center gap-4">
                    <div className="h-px flex-1 bg-[var(--color-border)]" />

                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                      Or continue with
                    </span>

                    <div className="h-px flex-1 bg-[var(--color-border)]" />
                  </div>

                  <div
                    className={
                      googleSubmitting
                        ? 'pointer-events-none opacity-60'
                        : ''
                    }
                  >
                    <GoogleSignInButton
                      onCredential={handleGoogleCredential}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-7 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                New to AUREVO?{' '}
                <Link
                  to="/register"
                  className="font-semibold text-[var(--color-interactive-primary)] transition-opacity hover:opacity-75"
                >
                  Create an account
                </Link>
              </p>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[var(--color-text-tertiary)]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3l7 3v5c0 4.8-3 8.5-7 10-4-1.5-7-5.2-7-10V6l7-3z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.5 12l1.7 1.7 3.5-3.7"
                />
              </svg>
              <span>Secure sign-in</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
