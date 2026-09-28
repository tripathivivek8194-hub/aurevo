// Shared Zod validation schemas for frontend and backend
import { z } from 'zod';

/** Strip markup/script characters from free-text names (stored-XSS defense). */
const sanitizeName = (v: string) =>
  v
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim();

// Auth validators
export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim()
    .max(254, 'Email must be at most 254 characters'),
  // Mirrors the backend RegisterDto complexity rule (M1 hardening).
  password: z
    .string()
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,72}$/,
      'Password must be 8-72 characters and include an uppercase letter, a lowercase letter, a number, and a special character (@$!%*?&)',
    ),
  firstName: z.string().trim().min(1, 'First name is required').max(50).transform(sanitizeName),
  lastName: z.string().trim().min(1, 'Last name is required').max(50).transform(sanitizeName),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// Address validators
export const addressSchema = z.object({
  type: z.enum(['SHIPPING', 'BILLING']),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  company: z.string().max(100).optional(),
  address1: z.string().min(1, 'Address line 1 is required').max(200),
  address2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State/Province is required').max(100),
  postalCode: z.string().min(1, 'Postal code is required').max(20),
  country: z.string().min(1, 'Country is required').max(100),
  phone: z.string().min(1, 'Phone is required').max(30),
  isDefault: z.boolean().optional(),
});

// Product validators
export const productVariantSchema = z.object({
  name: z.string().min(1, 'Variant name is required').max(100),
  sku: z.string().min(1, 'SKU is required').max(100),
  price: z.number().int().min(0, 'Price must be non-negative'),
  compareAtPrice: z.number().int().min(0).optional(),
  weight: z.number().min(0).optional(),
  dimensions: z.object({
    length: z.number().min(0).optional(),
    width: z.number().min(0).optional(),
    height: z.number().min(0).optional(),
    unit: z.string().optional(),
  }).optional(),
  attributes: z.array(z.object({
    name: z.string().min(1),
    value: z.string().min(1),
  })).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const productImageSchema = z.object({
  url: z.string().url('Invalid image URL'),
  alt: z.string().max(200).optional(),
  isPrimary: z.boolean().optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(200),
  description: z.string().min(1, 'Description is required'),
  shortDescription: z.string().max(500).optional(),
  sku: z.string().min(1, 'SKU is required').max(100),
  basePrice: z.number().int().min(0, 'Base price must be non-negative'),
  compareAtPrice: z.number().int().min(0).optional(),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code').default('INR'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  isFeatured: z.boolean().default(false),
  categoryId: z.string().uuid('Invalid category ID'),
  supplierId: z.string().uuid().optional(),
  supplierProductId: z.string().optional(),
  supplierVariantId: z.string().optional(),
  variants: z.array(productVariantSchema).min(1, 'At least one variant is required').optional(),
  images: z.array(productImageSchema).optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  variants: z.array(productVariantSchema).optional(),
  images: z.array(productImageSchema).optional(),
});

// Category validators
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  slug: z.string().min(1, 'Slug is required').max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(2000).optional(),
  image: z.string().url().optional(),
  parentId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

// Cart validators
export const addToCartSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(99),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0, 'Quantity must be non-negative').max(99),
});

// Checkout validators
export const checkoutSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  shippingMethodId: z.string().uuid('Invalid shipping method'),
  couponCode: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

// Supplier validators
export const supplierCredentialsSchema = z.object({
  code: z.enum(['ALIEXPRESS', 'INDIAMART']),
  apiConfig: z.record(z.unknown()),
});

export const importProductSchema = z.object({
  supplierId: z.string().uuid('Invalid supplier ID'),
  supplierProductId: z.string().min(1, 'Supplier product ID is required'),
  supplierVariantId: z.string().optional(),
  productId: z.string().uuid().optional(), // if linking to existing product
  sellingPrice: z.number().int().min(0, 'Selling price must be non-negative'),
  compareAtPrice: z.number().int().min(0).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});

// Coupon validators
export const createCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').max(50).toUpperCase(),
  name: z.string().min(1, 'Coupon name is required').max(100),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
  value: z.number().min(0, 'Value must be non-negative'),
  minOrderAmount: z.number().int().min(0).optional(),
  maxDiscount: z.number().int().min(0).optional(),
  usageLimit: z.number().int().min(1).optional(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  isActive: z.boolean().default(true),
});

export const applyCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').toUpperCase(),
});

// Pagination/filter validators
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const productFilterSchema = paginationSchema.extend({
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  isFeatured: z.boolean().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  search: z.string().optional(),
  inStock: z.boolean().optional(),
});

export const orderFilterSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'FULFILLMENT', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'FAILED']).optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type AddressInputValidator = z.infer<typeof addressSchema>;
export type ProductVariantInput = z.infer<typeof productVariantSchema>;
export type ProductImageInputValidator = z.infer<typeof productImageSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type SupplierCredentialsInput = z.infer<typeof supplierCredentialsSchema>;
export type ImportProductInput = z.infer<typeof importProductSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type ProductFilterInput = z.infer<typeof productFilterSchema>;
export type OrderFilterInput = z.infer<typeof orderFilterSchema>;