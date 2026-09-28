// Application constants and configuration defaults

export const APP_CONFIG = {
  name: 'AUREVO',
  tagline: 'Discover Better. Live Beautifully.',
  defaultCurrency: 'INR',
  defaultLocale: 'en-IN',
  supportedCurrencies: ['INR', 'USD', 'EUR'],
  supportedLocales: ['en-IN', 'en-US'],
} as const;

export const AUTH_CONFIG = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '30d',
  accessTokenExpiryMs: 15 * 60 * 1000,
  refreshTokenExpiryMs: 30 * 24 * 60 * 60 * 1000,
  bcryptCost: 12,
  maxLoginAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000,
  passwordResetTokenExpiry: '1h',
  emailVerificationTokenExpiry: '24h',
} as const;

export const PAGINATION_DEFAULTS = {
  defaultLimit: 20,
  maxLimit: 100,
  defaultPage: 1,
} as const;

export const CART_CONFIG = {
  maxQuantityPerItem: 99,
  maxItems: 50,
  guestCartExpiryDays: 30,
  mergeOnLogin: true,
} as const;

export const ORDER_CONFIG = {
  orderNumberPrefix: 'AUR',
  orderNumberLength: 10,
  statusTransitionRules: {
    PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
    PAYMENT_PENDING: ['PAID', 'FAILED', 'CANCELLED'],
    PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
    PROCESSING: ['FULFILLMENT', 'CANCELLED'],
    FULFILLMENT: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'RETURNED'],
    DELIVERED: ['RETURNED', 'REFUNDED'],
    CANCELLED: [],
    REFUNDED: [],
    FAILED: ['PENDING'],
  },
} as const;

export const PRODUCT_CONFIG = {
  maxImagesPerProduct: 20,
  maxVariantsPerProduct: 100,
  slugMaxLength: 180,
  skuMaxLength: 100,
  nameMaxLength: 200,
  descriptionMaxLength: 10000,
  shortDescriptionMaxLength: 500,
} as const;

export const CATEGORY_CONFIG = {
  maxDepth: 3,
  slugMaxLength: 100,
  nameMaxLength: 100,
  descriptionMaxLength: 2000,
} as const;

export const SUPPLIER_CONFIG = {
  syncIntervalMinutes: 60,
  maxSyncRetries: 3,
  rateLimitPerMinute: 30,
} as const;

export const PAYMENT_CONFIG = {
  razorpay: {
    currency: 'INR',
    paymentCapture: 1, // auto-capture
    receiptPrefix: 'rcpt_',
  },
  webhookTimeoutMs: 10000,
  maxRefundRetries: 3,
} as const;

export const SHIPPING_CONFIG = {
  defaultMethod: 'standard',
  freeShippingThreshold: 0, // 0 = no free shipping by default
  taxIncluded: false,
  defaultOrigin: {
    country: 'IN',
    state: '',
    city: '',
    postalCode: '',
  },
} as const;

export const REVIEW_CONFIG = {
  minRating: 1,
  maxRating: 5,
  minContentLength: 10,
  maxContentLength: 5000,
  requiresPurchase: true,
  autoApprove: false,
} as const;

export const EMAIL_TEMPLATES = {
  welcome: 'welcome',
  emailVerification: 'email-verification',
  passwordReset: 'password-reset',
  orderConfirmation: 'order-confirmation',
  paymentConfirmation: 'payment-confirmation',
  shippingConfirmation: 'shipping-confirmation',
  deliveryConfirmation: 'delivery-confirmation',
  orderCancelled: 'order-cancelled',
  refundProcessed: 'refund-processed',
  reviewRequest: 'review-request',
  backInStock: 'back-in-stock',
} as const;

export const CACHE_TTL = {
  products: 5 * 60, // 5 minutes
  categories: 10 * 60,
  productDetail: 2 * 60,
  search: 60,
  userSession: 15 * 60,
} as const;

export const RATE_LIMITS = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
  },
  checkout: {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
  },
  webhook: {
    windowMs: 60 * 1000,
    max: 100,
  },
  api: {
    windowMs: 60 * 1000,
    max: 100,
  },
  supplier: {
    windowMs: 60 * 1000,
    max: 30,
  },
} as const;

export const ERROR_CODES = {
  // Auth
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  REFRESH_TOKEN_REVOKED: 'AUTH_REFRESH_TOKEN_REVOKED',
  EMAIL_ALREADY_EXISTS: 'AUTH_EMAIL_EXISTS',
  EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  PASSWORD_RESET_EXPIRED: 'AUTH_PASSWORD_RESET_EXPIRED',
  PASSWORD_RESET_INVALID: 'AUTH_PASSWORD_RESET_INVALID',

  // Authorization
  FORBIDDEN: 'AUTHZ_FORBIDDEN',
  ADMIN_REQUIRED: 'AUTHZ_ADMIN_REQUIRED',
  RESOURCE_NOT_OWNED: 'AUTHZ_NOT_OWNED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',
  CART_NOT_FOUND: 'CART_NOT_FOUND',
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
  SUPPLIER_NOT_FOUND: 'SUPPLIER_NOT_FOUND',
  VARIANT_NOT_FOUND: 'VARIANT_NOT_FOUND',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  SHIPMENT_NOT_FOUND: 'SHIPMENT_NOT_FOUND',

  // Inventory
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  INSUFFICIENT_INVENTORY: 'INSUFFICIENT_INVENTORY',
  INVENTORY_SYNC_FAILED: 'INVENTORY_SYNC_FAILED',

  // Payments
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
  REFUND_FAILED: 'REFUND_FAILED',
  ORDER_AMOUNT_MISMATCH: 'ORDER_AMOUNT_MISMATCH',

  // Suppliers
  SUPPLIER_AUTH_FAILED: 'SUPPLIER_AUTH_FAILED',
  SUPPLIER_API_ERROR: 'SUPPLIER_API_ERROR',
  SUPPLIER_RATE_LIMITED: 'SUPPLIER_RATE_LIMITED',
  SUPPLIER_PRODUCT_NOT_FOUND: 'SUPPLIER_PRODUCT_NOT_FOUND',
  SUPPLIER_ORDER_FAILED: 'SUPPLIER_ORDER_FAILED',

  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;