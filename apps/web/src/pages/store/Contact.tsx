import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { canonicalFor, useSeo } from '../../hooks/useSeo';

const fieldClass =
  'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-border-focus)]/20';

export function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSeo({
    title: 'Contact support | AUREVO',
    description: 'Contact AUREVO about an order, delivery, return or product question.',
    canonical: canonicalFor('/contact'),
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/support/contact', {
        name: name.trim(),
        email: email.trim(),
        orderNumber: orderNumber.trim() || undefined,
        message: message.trim(),
        website,
      });
      setSent(true);
      setName('');
      setEmail('');
      setOrderNumber('');
      setMessage('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not send your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pb-24 sm:pt-14">
      <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-interactive-primary)]">Customer care</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-5xl">How can we help?</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[var(--color-text-secondary)]">
            Send your question with any order details that can help us understand it. Never include card, UPI PIN or banking information.
          </p>
          <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Already placed an order?</p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Your order page contains its latest status and delivery information.</p>
            <Link to="/account/orders" className="mt-4 inline-flex text-sm font-semibold text-[var(--color-interactive-primary)] hover:underline">View my orders →</Link>
          </div>
        </header>

        <form onSubmit={submit} className="rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[var(--color-text-primary)]">
              Name
              <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
            </label>
            <label className="text-sm font-semibold text-[var(--color-text-primary)]">
              Email address
              <input className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={160} autoComplete="email" />
            </label>
          </div>

          <label className="mt-5 block text-sm font-semibold text-[var(--color-text-primary)]">
            Order number <span className="font-normal text-[var(--color-text-tertiary)]">(optional)</span>
            <input className={fieldClass} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} maxLength={32} placeholder="For example, AUR…" />
          </label>

          <label className="mt-5 block text-sm font-semibold text-[var(--color-text-primary)]">
            How can we help?
            <textarea className={`${fieldClass} min-h-40 resize-y`} value={message} onChange={(event) => setMessage(event.target.value)} required minLength={10} maxLength={2000} placeholder="Tell us what happened and what you need help with." />
          </label>

          <div className="absolute -left-[10000px]" aria-hidden="true">
            <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
          </div>

          {error && <Alert variant="error" className="mt-5">{error}</Alert>}
          {sent && <Alert variant="success" className="mt-5">Your request has been sent. Please keep your order details available.</Alert>}

          <Button type="submit" disabled={submitting} className="mt-6 h-12 w-full rounded-full sm:w-auto sm:px-8">
            {submitting ? 'Sending…' : 'Send support request'}
          </Button>
        </form>
      </div>
    </main>
  );
}
