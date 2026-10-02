import { FormEvent, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Input,
  Label,
  Spinner,
} from '@aurevo/design-system';
import { api } from '../../lib/api';
import { useSeo } from '../../hooks/useSeo';
import { BrandLogo } from '../../components/BrandLogo';
import { useAuthStore } from '../../stores/auth';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { PasswordInput } from '../../components/PasswordInput';

/**
 * Customer registration.
 * Creates the account server-side, then signs the new
 * user in automatically and sends them to the storefront home.
 */
export function Register() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useSeo({
    title: 'Create Account | AUREVO',
    description:
      'Create your AUREVO account to track orders and check out faster.',
    noindex: true,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      await api.post('/auth/register', {
        firstName,
        lastName,
        email,
        password,
      });

      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Registration failed',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setError(null);
      setGoogleSubmitting(true);

      try {
        await loginWithGoogle(idToken);
        navigate('/', { replace: true });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Google sign-up failed',
        );
      } finally {
        setGoogleSubmitting(false);
      }
    },
    [loginWithGoogle, navigate],
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
              className="inline-flex w-fit items-center"
            >
              <BrandLogo size="lg" />
            </Link>

            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-text-tertiary)]">
                CURATED FOR EVERYDAY LIVING
              </p>

              <h1 className="mt-6 text-5xl font-semibold leading-[1.08] tracking-tight text-[var(--color-text-primary)] xl:text-6xl">
                Make AUREVO
                <span className="block">yours.</span>
              </h1>

              <p className="mt-6 max-w-lg text-base leading-7 text-[var(--color-text-secondary)]">
                Create your account for a smoother shopping experience,
                faster checkout and easy access to your orders.
              </p>

              <div className="mt-10 space-y-3">
                <div className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]/40 p-4 backdrop-blur-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.04]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-[var(--color-text-secondary)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Faster checkout
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      Keep your details ready for your next order.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]/40 p-4 backdrop-blur-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.04]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-[var(--color-text-secondary)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 5h16v14H4z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 9h8M8 13h5"
                      />
                    </svg>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Track your orders
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      Keep your purchases organised in one place.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]/40 p-4 backdrop-blur-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.04]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-[var(--color-text-secondary)]"
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
                    </svg>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Secure account
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      Your account stays protected.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-tertiary)]">
              © AUREVO · Discover something worth keeping.
            </p>
          </div>
        </section>

        {/* Registration panel */}
        <section className="flex min-h-[100dvh] items-center justify-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10 lg:min-h-0 lg:px-12 xl:px-20">
          <div className="w-full max-w-md">
            {/* Mobile brand */}
            <div className="mb-10 lg:hidden">
              <Link
                to="/"
                className="inline-flex items-center"
              >
                <BrandLogo />
              </Link>
            </div>

            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                JOIN AUREVO
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                Create your account
              </h2>

              <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                Set up your account and start discovering products worth
                keeping.
              </p>
            </div>

            {error && (
              <Alert variant="error" className="mb-6">
                {error}
              </Alert>
            )}

            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 shadow-sm sm:p-7">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>

                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>

                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-12"
                    />
                  </div>
                </div>

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
                  <Label htmlFor="password">Password</Label>

                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    required
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12"
                  />

                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Use at least 8 characters.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>

                  <PasswordInput
                    id="confirm"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="h-12"
                  />
                </div>

                <div className="pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    className="h-12 w-full"
                    disabled={submitting || googleSubmitting}
                  >
                    {submitting ? (
                      <Spinner size="sm" label="Creating account…" />
                    ) : (
                      'Create account'
                    )}
                  </Button>
                </div>
              </form>

              <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-[var(--color-border)]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  Or sign up with
                </span>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>

              <div className={googleSubmitting ? 'pointer-events-none opacity-60' : ''}>
                <GoogleSignInButton
                  label="signup_with"
                  onCredential={handleGoogleCredential}
                />
              </div>
            </div>

            <p className="mt-7 text-center text-sm text-[var(--color-text-secondary)]">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-[var(--color-interactive-primary)] transition-opacity hover:opacity-75"
              >
                Sign in
              </Link>
            </p>

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
              <span>Secure account creation</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
