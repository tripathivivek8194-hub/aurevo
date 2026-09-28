import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@aurevo/design-system';
import { formatMoney } from '../../lib/format';
import {
  displayPrice,
  availabilityLabel,
  isProductAvailable,
  primaryImage,
  type ProductSummary,
} from '../../lib/storefront';

/**
 * Premium AUREVO product card.
 * Keeps the existing product data, routing and availability logic intact.
 */
export function ProductCard({ product }: { product: ProductSummary }) {
  const img = primaryImage(product);
  const [imageFailed, setImageFailed] = useState(false);
  const available = isProductAvailable(product);
  const price = displayPrice(product);
  const reviewCount = product._count?.reviews ?? 0;
  const hasVerifiedAvailability = (product.inventory ?? []).some(
    (row) =>
      row.trackQuantity !== false ||
      (row.syncStatus === 'SUCCESS' && row.supplierStock != null),
  );

  return (
    <Link
      to={`/products/${product.slug}`}
      className="store-product-card group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-border-focus)] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-background-primary)]"
    >
      {/* Product image */}
      <div className="relative aspect-[4/5] overflow-hidden bg-white">
        {img && !imageFailed ? (
          <img
            src={img}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--color-background-secondary)] text-center text-[var(--color-text-tertiary)]">
            <span className="text-2xl font-semibold tracking-[0.2em] text-[var(--color-text-primary)]">AUREVO</span>
            <span className="mt-2 text-xs">Image unavailable</span>
          </div>
        )}

        {/* Image overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Availability */}
        {!available && (
          <div className="absolute left-3 top-3">
            <Badge variant="error" size="sm">
              Out of stock
            </Badge>
          </div>
        )}

        {/* View hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 translate-y-2 rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          View product
        </div>
      </div>

      {/* Product information */}
      <div className="p-4 sm:p-5">
        <p className="mb-2 min-h-[1rem] truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
          {product.category?.name ?? '\u00a0'}
        </p>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-interactive-primary)]">
          {product.name}
        </h3>

        <div className="mt-3 flex min-w-0 items-end justify-between gap-3">
          <span className="shrink-0 text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
            {formatMoney(price)}
          </span>

          {available && hasVerifiedAvailability && (
            <span className="truncate text-xs font-medium text-[var(--color-text-tertiary)]">
              {availabilityLabel(product)}
            </span>
          )}
        </div>

        {reviewCount > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
            <span aria-hidden="true" className="text-sm">
              ★
            </span>
            <span>
              {reviewCount} review{reviewCount === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
