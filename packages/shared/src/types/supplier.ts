// Supplier integration types

export interface SupplierCredentials {
  code: 'ALIEXPRESS' | 'INDIAMART' | 'CJDROPSHIPPING';
  apiConfig: Record<string, unknown>;
}

export interface AuthResult {
  success: boolean;
  message: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface SearchQuery {
  query?: string;
  page?: number;
  limit?: number;
  sort?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  country?: string;
}

export interface ProductSearchResult {
  products: SupplierProduct[];
  total: number;
  page: number;
  limit: number;
}

export interface SupplierProduct {
  id: string;
  title: string;
  description: string;
  price: Money;
  originalPrice?: Money;
  images: string[];
  categoryId?: string;
  categoryName?: string;
  skus?: SupplierSku[];
  variants?: SupplierVariant[];
  specifications?: Record<string, string>;
  unit?: string;
  minOrderQuantity?: number;
  shipping?: string;
  rating?: number;
  ordersCount?: number;
}

export interface SupplierSku {
  sku_id: string;
  sku_price?: Money;
  sku_original_price?: Money;
  sku_stock?: number;
  sku_code?: string;
  sku_attrs?: Array<{ name: string; value: string }>;
}

export interface SupplierVariant {
  id: string;
  productId: string;
  attributes: Record<string, string>;
  price: number;
  inventory: number;
  barcode?: string;
}

export interface InventoryResult {
  productId: string;
  variants: Array<{
    variantId: string;
    quantity: number;
    available: boolean;
  }>;
  note?: string;
}

export interface PriceResult {
  productId: string;
  basePrice: number;
  currency: string;
  variants: Array<{
    variantId: string;
    price: number;
    originalPrice?: number;
  }>;
}

export interface SupplierOrderRequest {
  orderId: string;
  items: Array<{
    supplierProductId: string;
    supplierVariantId?: string;
    quantity: number;
  }>;
  shippingAddress: AddressInput;
}

export interface SupplierOrderResult {
  supplierOrderId: string;
  status: string;
  trackingNumber?: string | null;
  estimatedShipDate?: string | null;
}

export interface OrderStatusResult {
  supplierOrderId: string;
  status: string;
  items: Array<{
    supplierProductId: string;
    supplierVariantId?: string;
    quantity: number;
    status: string;
  }>;
}

export interface TrackingResult {
  supplierOrderId: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  events: Array<{
    timestamp: string;
    status: string;
    location?: string;
    description?: string;
  }>;
}

// Re-export Money from main types
export interface Money {
  amount: number;
  currency: string;
}

/**
 * Honest capability status for a supplier operation. Used to report what a
 * given app/account can actually do instead of faking or silently failing.
 */
export enum SupplierCapabilityStatus {
  /** Operation is implemented and expected to work with valid credentials. */
  SUPPORTED = 'SUPPORTED',
  /** Needs seller authorization / a valid access token, which is missing/expired. */
  NOT_AUTHORIZED = 'NOT_AUTHORIZED',
  /** Credentials or callback URL are not configured yet. */
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  /** The app/account does not hold the required API permission. */
  NOT_PERMITTED = 'NOT_PERMITTED',
  /** Not offered by this supplier platform / adapter. */
  UNSUPPORTED = 'UNSUPPORTED',
  /** Implemented but not yet confirmed against the live API (blocked externally). */
  UNVERIFIED = 'UNVERIFIED',
  /** A real API call failed. */
  API_ERROR = 'API_ERROR',
}

export interface SupplierCapability {
  /** Stable machine key, e.g. 'PRODUCT_SEARCH'. */
  operation: string;
  /** Human label, e.g. 'Product search'. */
  label: string;
  status: SupplierCapabilityStatus;
  note?: string;
}

/** Safe (non-secret) machine code for supplier API failures. */
export enum SupplierApiErrorCode {
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  NOT_AUTHORIZED = 'NOT_AUTHORIZED',
  NOT_PERMITTED = 'NOT_PERMITTED',
  UNSUPPORTED = 'UNSUPPORTED',
  API_ERROR = 'API_ERROR',
  INVALID_STATE = 'INVALID_STATE',
}

/** OAuth/Drop-Shipping connection state for a supplier (from the admin API). */
export type SupplierConnectionState =
  | 'READY'
  | 'NOT_CONFIGURED'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface AliExpressConnectionStatus {
  configured: boolean;
  connected: boolean;
  /** Masked app key, e.g. 'abcd…wxyz' — never the full value. */
  appKeyMasked?: string | null;
  hasAppSecret: boolean;
  hasCallbackUrl: boolean;
  hasAccessToken: boolean;
  tokenExpiresAt?: string | null;
  lastVerifiedAt?: string | null;
  error?: string | null;
  message?: string;
  capabilities: SupplierCapability[];
  state: SupplierConnectionState;
}

export interface AliExpressConnectResponse {
  state: 'READY' | 'NOT_CONFIGURED';
  authorizationUrl?: string;
  message?: string;
}

/**
 * Honest CJdropshipping connection state, mirroring the AliExpress pattern:
 * booleans + masked credentials + capability statuses only. Access/refresh
 * tokens are stored server-side (encrypted) and NEVER returned to the client.
 *
 * NOTE: current CJ API v2.0 auth uses a single `apiKey` (from the CJ Apps
 * section) — there is no app secret and no appKey/email/password OAuth flow.
 */
export interface CJDropshippingConnectionStatus {
  configured: boolean;
  connected: boolean;
  apiKeyMasked?: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  tokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  lastVerifiedAt?: string | null;
  error?: string | null;
  message?: string;
  capabilities: SupplierCapability[];
  state: SupplierConnectionState;
}

/** A single CJdropshipping catalog product (safe fields only). */
export interface CJDropshippingProduct {
  productId: string;
  title: string;
  images: string[];
  priceAmount: number | null;
  priceCurrency: string;
  description?: string;
  productUrl?: string;
  categoryName?: string;
  variants: Array<{
    skuCode: string;
    skuPrice: number | null;
    skuImage?: string;
    attributes?: Record<string, string>;
    stock?: number | null;
  }>;
}

/** Search/list result from the CJ product API (paged — not a full feed). */
export interface CJDropshippingProductListResult {
  products: CJDropshippingProduct[];
  total: number;
  page: number;
  pageSize: number;
}

/** Import-job result shape (safe fields; reuses ProductImportJob counters). */
export interface CJDropshippingImportJobResult {
  id: string;
  source: string; // search descriptor / CJ category used for the run
  categoryId: string;
  perRunLimit: number;
  currency: string;
  mode: string;
  status: string;
  nextPage: number;
  isFeedFinished: boolean;
  processedCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  failedIds: string[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

// Re-export AddressInput from main types
export interface AddressInput {
  type: 'SHIPPING' | 'BILLING';
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault?: boolean;
}