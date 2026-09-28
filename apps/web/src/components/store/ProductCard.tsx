import { Link } from 'react-router-dom';
import { Badge } from '@aurevo/design-system';
import { formatMoney } from '../../lib/format';
import {
  displayPrice,
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
  const available = isProductAvailable(product);
  const price = displayPrice(product);
  const reviewCount = product._count?.reviews ?? 0;

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-border-focus)] hover:shadow-xl"
    >
      {/* Product image */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--color-background-secondary)]">
        {img ? (
          <img
            src={img}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
            No image
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
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-interactive-primary)]">
          {product.name}
        </h3>

        <div className="mt-3 flex items-end justify-between gap-3">
          <span className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
            {formatMoney(price)}
          </span>

          {available && (
            <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
              In stock
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