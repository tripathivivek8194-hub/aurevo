import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Input,
  Label,
  Spinner,
} from '@aurevo/design-system';
import { api } from '../../lib/api';
import { useSeo } from '../../hooks/useSeo';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useSeo({
    title: 'Forgot Password | AUREVO',
    description: 'Request a password reset link for your AUREVO account.',
    noindex: true,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong',
      );
    } finally {
      setSubmitting(false);
    }
  };

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
              className="inline-flex w-fit text-2xl font-semibold tracking-[0.22em] text-[var(--color-text-primary)]"
            >
              AUREVO
            </Link>

            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-text-tertiary)]">
                ACCOUNT SECURITY
              </p>

              <h1 className="mt-6 text-5xl font-semibold leading-[1.08] tracking-tight text-[var(--color-text-primary)] xl:text-6xl">
                Get back
                <span className="block">into AUREVO.</span>
              </h1>

              <p className="mt-6 max-w-lg text-base leading-7 text-[var(--color-text-secondary)]">
                Forgot your password? Request a secure reset link and
                continue where you left off.
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
                        d="M16 11V8a4 4 0 10-8 0v3"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 11h14v9H5z"
                      />
                    </svg>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Secure recovery
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      Reset links are time-limited.
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
                        d="M4 7l8 5 8-5"
                      />
                      <rect
                        x="3"
                        y="5"
                        width="18"
                        height="14"
                        rx="2"
                      />
                    </svg>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Check your inbox
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      Follow the instructions in your email.
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.5 12l1.7 1.7 3.5-3.7"
                      />
                    </svg>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Privacy protected
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      Account existence isn't disclosed.
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

        {/* Recovery panel */}
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
                ACCOUNT RECOVERY
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                Forgot your password?
              </h2>

              <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                Enter the email associated with your account and we'll
                send instructions to reset your password.
              </p>
            </div>

            {sent ? (
              <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 shadow-sm sm:p-7">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>

                <h3 className="mt-5 text-lg font-semibold text-[var(--color-text-primary)]">
                  Check your inbox
                </h3>

                <Alert variant="success" className="mt-4">
                  If an account exists for{' '}
                  <span className="font-medium">{email}</span>, a reset
                  link is on its way. It expires in 1 hour.
                </Alert>

                <p className="mt-5 text-sm leading-6 text-[var(--color-text-secondary)]">
                  For security, we don't reveal whether an account
                  exists for a particular email address.
                </p>

                <Link to="/login" className="mt-6 block">
                  <Button variant="outline" className="h-12 w-full">
                    Back to sign in
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 shadow-sm sm:p-7">
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <Alert variant="error">
                      {error}
                    </Alert>
                  )}

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

                  <Button
                    type="submit"
                    variant="primary"
                    className="h-12 w-full"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Spinner size="sm" label="Sending…" />
                    ) : (
                      'Send reset link'
                    )}
                  </Button>
                </form>
              </div>
            )}

            <p className="mt-7 text-center text-sm text-[var(--color-text-secondary)]">
              Remembered your password?{' '}
              <Link
                to="/login"
                className="font-semibold text-[var(--color-interactive-primary)] transition-opacity hover:opacity-75"
              >
                Sign in
              </Link>
            </p>

            {!sent && (
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
                <span>Secure password recovery</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}