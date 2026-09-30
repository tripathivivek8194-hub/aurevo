/** Shared shapes for storefront data returned by the public product/category APIs. */

export interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductImage {
  id: string;
  url: string;
  alt?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number | null;
  attributes?: string | Record<string, string> | null;
  isActive?: boolean;
  inventory?: InventoryRecord[];
}

export interface InventoryRecord {
  id: string;
  quantity: number;
  reservedQuantity?: number;
  lowStockThreshold?: number;
  trackQuantity?: boolean;
  allowBackorder?: boolean;
  supplierStock?: number | null;
  lastSyncedAt?: string | null;
  syncStatus?: string | null;
}

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  parentId?: string | null;
  children?: CategorySummary[];
  _count?: { products?: number };
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description?: string | null;
  shortDescription?: string | null;
  packageContents?: string | null;
  basePrice: number;
  compareAtPrice?: number | null;
  currency: string;
  status: string;
  isFeatured?: boolean;
  categoryId?: string | null;
  supplierId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  images: ProductImage[];
  variants: ProductVariant[];
  inventory: InventoryRecord[];
  _count?: { reviews?: number; wishlistItems?: number };
}

export interface ProductList {
  data: ProductSummary[];
  meta: Meta;
}

export interface ReviewSummary {
  id: string;
  rating: number;
  title?: string | null;
  // The backend stores the review body in `content`. `comment` is kept as a
  // legacy alias so older UI paths never fall over if a payload still uses it.
  content?: string | null;
  comment?: string | null;
  createdAt: string;
  user?: { firstName?: string | null; lastName?: string | null };
}

/** Total available units for a product (min across tracked inventory rows). */
export function availableQuantity(product: ProductSummary): number {
  if (!product) return Number.POSITIVE_INFINITY;
  const rows = (product.inventory ?? []).filter((row) => row.trackQuantity !== false);
  if (rows.length === 0) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    const avail = (r.quantity ?? 0) - (r.reservedQuantity ?? 0);
    if (avail < min) min = avail;
  }
  return min;
}

export function isProductAvailable(product: ProductSummary): boolean {
  if (!product) return false;
  const rows = (product.inventory ?? []).filter((row) => row.trackQuantity !== false);
  if (rows.length === 0) return true;
  return rows.some((r) => (r.quantity ?? 0) - (r.reservedQuantity ?? 0) > 0);
}

/** Avoid claiming live stock for supplier products until a sync confirms it. */
export function availabilityLabel(product: ProductSummary): string {
  const rows = product.inventory ?? [];
  const supplierStockVerified = rows.some(
    (row) => row.syncStatus === 'SUCCESS' && row.supplierStock != null,
  );
  return product.supplierId && !supplierStockVerified ? 'Available' : 'In stock';
}

/** Primary image URL, falling back to the first image or a neutral placeholder. */
export function primaryImage(product: ProductSummary): string | null {
  if (!product) return null;
  const img = product.images?.find((i) => i.isPrimary) ?? product.images?.[0];
  return img?.url ?? null;
}

/** Lowest active-variant price, or the product basePrice when no variants. */
export function displayPrice(product: ProductSummary): number {
  if (!product) return 0;
  const variants = product.variants ?? [];
  if (variants.length > 0) {
    return Math.min(...variants.map((v) => v.price));
  }
  return product.basePrice;
}

/** Saved shipping/billing address for the authenticated user. */
export interface Address {
  id: string;
  userId: string;
  type: 'SHIPPING' | 'BILLING';
  firstName: string;
  lastName: string;
  company?: string | null;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
  createdAt: string;
}

/** Summary returned by GET /orders/me/stats. */
export interface OrderStats {
  totalOrders: number;
  totalSpent: number;
  byStatus: Record<string, number>;
  lastOrderAt: string | null;
}

export function priceRangeLabel(product: ProductSummary): string {
  const variants = product.variants ?? [];
  if (variants.length > 1) {
    const prices = variants.map((v) => v.price);
    return `${Math.min(...prices)}-${Math.max(...prices)}`;
  }
  return String(displayPrice(product));
}
