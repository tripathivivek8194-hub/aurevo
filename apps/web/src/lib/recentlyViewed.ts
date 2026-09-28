import type { ProductSummary } from './storefront';

const STORAGE_KEY = 'aurevo_recently_viewed_products';
const MAX_PRODUCTS = 4;

/**
 * Stores a small, browser-only history of product pages a visitor opened.
 * It is never sent to AUREVO or used to manufacture social proof.
 */
export function rememberRecentlyViewed(product: ProductSummary): void {
  if (typeof window === 'undefined') return;

  try {
    const recent = readRecentlyViewed().filter((item) => item.id !== product.id);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([product, ...recent].slice(0, MAX_PRODUCTS)),
    );
  } catch {
    // Storage is optional: private browsing and restrictive settings can deny it.
  }
}

export function readRecentlyViewed(): ProductSummary[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];

    return saved.filter(
      (item): item is ProductSummary =>
        !!item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.slug === 'string' &&
        item.status === 'ACTIVE',
    );
  } catch {
    return [];
  }
}
