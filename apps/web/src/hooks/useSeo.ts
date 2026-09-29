import { useEffect } from 'react';

/**
 * Lightweight SEO/meta manager for the storefront SPA.
 *
 * Vite's index.html carries only the static defaults; every route renders via
 * client-side JS, so the `<head>` must be updated at runtime. This hook
 * reconciles the dynamic meta tags to exactly the given config on each mount:
 * it upserts what the page declares and removes anything it no longer declares
 * (e.g. og:image from a previous product page). No external dependency —
 * react-helmet-async is not needed for a client-rendered app.
 *
 * Canonical URLs use VITE_SITE_URL when configured, otherwise AUREVO's verified
 * production domain. This keeps production builds indexable even if the build
 * environment omits the optional variable.
 */

export interface SeoConfig {
  /** Full page title, or one the hook will brand with " · AUREVO". */
  title: string;
  description?: string;
  /** Absolute canonical URL, e.g. `${siteUrl}/products/some-slug`. */
  canonical?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  /** Emit `<meta name="robots" content="noindex, nofollow">`. */
  noindex?: boolean;
}

// AUREVO is served from this verified production domain. Keeping this fallback
// prevents production builds from silently losing canonical URLs when the
// optional Cloudflare build variable has not been configured.
const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || 'https://aurevo.buzz').replace(/\/+$/, '');

/**
 * Build an absolute canonical URL from the configured or verified site domain.
 * Pass the result straight into `useSeo({ canonical })`.
 */
export function canonicalFor(path: string): string | undefined {
  return SITE_URL ? `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}` : undefined;
}

/**
 * Serialize a value for an inline `<script type="application/ld+json">` block.
 * The `<` → `<` escape means a product name or description containing
 * `</script>` can never terminate the script element early (defense in depth
 * against JSON-LD breakout). Callers render it with dangerouslySetInnerHTML.
 */
export function jsonLd(node: unknown): string {
  return JSON.stringify(node).replace(/</g, '\\u003c');
}

function upsertMeta<K extends 'name' | 'property'>(attr: K, key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(attr: 'name' | 'property', key: string): void {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function removeCanonical(): void {
  document.head.querySelector('link[rel="canonical"]')?.remove();
}

export function useSeo(config: SeoConfig): void {
  const { title, description, canonical, ogType = 'website', ogImage, noindex } = config;

  useEffect(() => {
    // Brand the title unless the page already included the wordmark.
    document.title = title.toUpperCase().includes('AUREVO') ? title : `${title} · AUREVO`;

    if (description) {
      upsertMeta('name', 'description', description);
      upsertMeta('property', 'og:description', description);
    } else {
      removeMeta('name', 'description');
      removeMeta('property', 'og:description');
    }

    upsertMeta('property', 'og:title', document.title);
    upsertMeta('property', 'og:type', ogType);

    // og:url = the canonical when one is declared, else window path against
    // the configured origin, else (no domain) omitted entirely.
    if (canonical) {
      upsertMeta('property', 'og:url', canonical);
    } else if (SITE_URL) {
      upsertMeta('property', 'og:url', SITE_URL + window.location.pathname);
    } else {
      removeMeta('property', 'og:url');
    }

    if (ogImage) {
      upsertMeta('property', 'og:image', ogImage);
    } else {
      removeMeta('property', 'og:image');
    }

    // Canonical: emit the route-level primary URL whenever the page supplies it.
    if (canonical) {
      upsertCanonical(canonical);
    } else {
      removeCanonical();
    }

    if (noindex) {
      upsertMeta('name', 'robots', 'noindex, nofollow');
    } else {
      removeMeta('name', 'robots');
    }
  }, [title, description, canonical, ogType, ogImage, noindex]);
}
