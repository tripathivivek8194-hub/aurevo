import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Spinner,
} from '@aurevo/design-system';
import { api } from '../../lib/api';
import { useSeo } from '../../hooks/useSeo';

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<
    'verifying' | 'success' | 'error'
  >('verifying');

  const [message, setMessage] = useState<string | null>(null);
  const ran = useRef(false);

  useSeo({
    title: 'Verify Email | AUREVO',
    description: 'Confirm your AUREVO email address.',
    noindex: true,
  });

  useEffect(() => {
    // React StrictMode can mount effects twice during development.
    // Keep the verification request to a single network call.
    if (ran.current || !token) {
      if (!token) {
        setStatus('error');
        setMessage('This verification link is missing or incomplete.');
      }

      return;
    }

    ran.current = true;

    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setStatus('success');
        setMessage('Your email has been verified.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(
          err instanceof Error
            ? err.message
            : 'Verification failed',
        );
      });
  }, [token]);

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[var(--color-background-primary)]">
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-white/[0.025] blur-3xl"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-white/[0.02] blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          {/* Brand */}
          <div className="mb-8 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-75"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] text-sm font-bold tracking-[0.15em] text-[var(--color-text-primary)]">
                A
              </span>

              <span className="text-lg font-semibold tracking-[0.22em] text-[var(--color-text-primary)]">
                AUREVO
              </span>
            </Link>
          </div>

          {/* Card */}
          <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] shadow-2xl">
            <div className="p-6 sm:p-8">
              {/* Status icon */}
              <div className="flex justify-center">
                {status === 'verifying' && (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]">
                    <Spinner
                      size="sm"
                      label="Verifying…"
                    />
                  </div>
                )}

                {status === 'success' && (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] text-2xl text-[var(--color-text-primary)]">
                    ✓
                  </div>
                )}

                {status === 'error' && (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] text-2xl text-[var(--color-text-primary)]">
                    !
                  </div>
                )}
              </div>

              {/* Heading */}
              <div className="mt-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
                  ACCOUNT SECURITY
                </p>

                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
                  {status === 'verifying'
                    ? 'Verifying your email'
                    : status === 'success'
                      ? 'Email verified'
                      : 'Verification unsuccessful'}
                </h1>

                <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                  {status === 'verifying'
                    ? 'We’re securely checking your verification link. This should only take a moment.'
                    : status === 'success'
                      ? 'Your AUREVO account is now verified and ready to use.'
                      : 'We couldn’t complete the email verification for this link.'}
                </p>
              </div>

              {/* Verifying */}
              {status === 'verifying' && (
                <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5">
                  <div className="flex items-center justify-center gap-3">
                    <Spinner
                      size="sm"
                      label="Verifying…"
                    />

                    <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                      Verifying your email…
                    </span>
                  </div>
                </div>
              )}

              {/* Success */}
              {status === 'success' && (
                <div className="mt-8 space-y-4">
                  <Alert variant="success">
                    {message}
                  </Alert>

                  <Link
                    to="/account"
                    className="block"
                  >
                    <Button
                      variant="primary"
                      className="w-full"
                    >
                      Go to my account
                    </Button>
                  </Link>

                  <Link
                    to="/"
                    className="block text-center text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    Continue shopping
                  </Link>
                </div>
              )}

              {/* Error */}
              {status === 'error' && (
                <div className="mt-8 space-y-5">
                  {message && (
                    <Alert variant="error">
                      {message}
                    </Alert>
                  )}

                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5">
                    <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                      The verification link may have expired.
                      Verification links are valid for 24 hours.
                    </p>

                    <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                      Sign in to your account and check your account
                      settings for the available verification options.
                    </p>
                  </div>

                  <Link
                    to="/login"
                    className="block"
                  >
                    <Button
                      variant="primary"
                      className="w-full"
                    >
                      Sign in to AUREVO
                    </Button>
                  </Link>

                  <Link
                    to="/"
                    className="block text-center text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    Return to storefront
                  </Link>
                </div>
              )}
            </div>

            {/* Security footer */}
            <div className="border-t border-[var(--color-border)] px-6 py-4 sm:px-8">
              <p className="text-center text-xs leading-5 text-[var(--color-text-tertiary)]">
                Your verification link is processed securely and
                is never displayed or stored in the storefront.
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-[var(--color-text-tertiary)]">
            © {new Date().getFullYear()} AUREVO
          </p>
        </div>
      </div>
    </div>
  );
}