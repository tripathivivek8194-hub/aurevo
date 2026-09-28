import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input } from '@aurevo/design-system';
import { useSeo } from '../hooks/useSeo';

/**
 * Client-rendered 404 page. The router catches unmatched paths and renders
 * this instead of redirecting to home. Search crawlers will never see it
 * (noindex), but human visitors get a helpful landing with a search bar and
 * direct links back into the store.
 */
export function NotFound() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useSeo({
    title: 'Page Not Found',
    description: 'The page you are looking for does not exist. Browse AUREVO products or use the search bar to find what you need.',
    noindex: true,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) navigate(`/products?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      {/* AUREVO wordmark */}
      <Link to="/" className="mb-6 text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
        AUREVO
      </Link>

      <h1 className="text-6xl font-extrabold tracking-tighter text-[var(--color-text-primary)]">
        404
      </h1>
      <p className="mt-3 text-lg text-[var(--color-text-secondary)]">
        Sorry — this page doesn&rsquo;t exist.
      </p>
      <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
        It may have been moved or removed, or perhaps the link you followed has a
        typo.
      </p>

      {/* Search */}
      <form onSubmit={handleSubmit} className="mt-8 flex w-full gap-2">
        <Input
          type="search"
          placeholder="Search products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
          aria-label="Search products"
        />
        <Button type="submit">Search</Button>
      </form>

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
        <Link
          to="/products"
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-background-hover)]"
        >
          Browse all products
        </Link>
        <Link
          to="/"
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-background-hover)]"
        >
          Go to homepage
        </Link>
      </div>
    </div>
  );
}