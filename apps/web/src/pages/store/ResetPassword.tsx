import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Input,
  Label,
  Spinner,
} from '@aurevo/design-system';
import { api } from '../../lib/api';
import { useSeo } from '../../hooks/useSeo';
import { PasswordInput } from '../../components/PasswordInput';

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useSeo({
    title: 'Reset Password | AUREVO',
    description: 'Set a new password for your AUREVO account.',
    noindex: true,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(
        'This reset link is missing its token. Use the full link from your email.',
      );
      return;
    }

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
      await api.post('/auth/reset-password', {
        token,
        password,
        confirmPassword: confirm,
      });

      navigate('/login', {
        replace: true,
        state: { resetDone: true },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
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
                A fresh start
                <span className="block">for your account.</span>
              </h1>

              <p className="mt-6 max-w-lg text-base leading-7 text-[var(--color-text-secondary)]">
                Choose a new password and get back to discovering products
                worth keeping.
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
                      Secure reset
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      Your reset link is time-limited.
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
                      Account protected
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      Your new password replaces the old one.
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

        {/* Reset panel */}
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

            {!token ? (
              <>
                <div className="mb-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                    ACCOUNT RECOVERY
                  </p>

                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                    Invalid reset link
                  </h1>

                  <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                    This password reset link is missing the required
                    security token.
                  </p>
                </div>

                <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 shadow-sm sm:p-7">
                  <Alert variant="error">
                    This reset link is missing its token.
                  </Alert>

                  <Link to="/forgot-password" className="mt-6 block">
                    <Button variant="primary" className="h-12 w-full">
                      Request a new link
                    </Button>
                  </Link>

                  <Link to="/login" className="mt-3 block">
                    <Button variant="outline" className="h-12 w-full">
                      Back to sign in
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                    ACCOUNT RECOVERY
                  </p>

                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                    Set a new password
                  </h1>

                  <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                    Choose a strong password with at least 8 characters.
                  </p>
                </div>

                <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 shadow-sm sm:p-7">
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                      <Alert variant="error">
                        {error}
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="password">New password</Label>

                      <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
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
                      <Label htmlFor="confirm">
                        Confirm new password
                      </Label>

                      <PasswordInput
                        id="confirm"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
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
                        <Spinner size="sm" label="Resetting…" />
                      ) : (
                        'Reset password'
                      )}
                    </Button>
                  </form>
                </div>

                <p className="mt-7 text-center text-sm text-[var(--color-text-secondary)]">
                  Remember your password?{' '}
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
                  <span>Secure password recovery</span>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
