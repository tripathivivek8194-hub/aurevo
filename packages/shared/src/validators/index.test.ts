import {
  registerSchema,
  loginSchema,
  createProductSchema,
  addToCartSchema,
  checkoutSchema,
  createCouponSchema,
} from './index';

const UUID = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';

describe('validators', () => {
  describe('registerSchema', () => {
    it('accepts valid input and lowercases email', () => {
      // Password must satisfy the M1 complexity rule (uppercase, lowercase,
      // digit, and a special char from @$!%*?&).
      const r = registerSchema.safeParse({
        email: 'A@B.com',
        password: 'Password123@',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.email).toBe('a@b.com');
    });

    it('rejects a short password', () => {
      const r = registerSchema.safeParse({
        email: 'a@b.com',
        password: 'short',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });
      expect(r.success).toBe(false);
    });

    it('rejects an invalid email', () => {
      const r = registerSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
        firstName: 'x',
        lastName: 'y',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('requires a non-empty password', () => {
      expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
    });
  });

  describe('createProductSchema', () => {
    it('applies defaults for DRAFT, INR, and not featured', () => {
      const r = createProductSchema.safeParse({
        name: 'Cotton Tee',
        description: 'Soft cotton t-shirt',
        sku: 'TEE-001',
        basePrice: 199,
        categoryId: UUID,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.status).toBe('DRAFT');
        expect(r.data.currency).toBe('INR');
        expect(r.data.isFeatured).toBe(false);
      }
    });

    it('rejects a negative price', () => {
      const r = createProductSchema.safeParse({
        name: 'x',
        description: 'y',
        sku: 'z',
        basePrice: -1,
        categoryId: UUID,
      });
      expect(r.success).toBe(false);
    });

    it('rejects a bad category id', () => {
      const r = createProductSchema.safeParse({
        name: 'x',
        description: 'y',
        sku: 'z',
        basePrice: 10,
        categoryId: 'nope',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('addToCartSchema', () => {
    it('rejects quantity 0', () => {
      expect(addToCartSchema.safeParse({ productId: UUID, quantity: 0 }).success).toBe(false);
    });

    it('accepts a valid single unit', () => {
      expect(addToCartSchema.safeParse({ productId: UUID, quantity: 1 }).success).toBe(true);
    });
  });

  describe('checkoutSchema', () => {
    it('accepts a valid checkout', () => {
      const r = checkoutSchema.safeParse({
        email: 'a@b.com',
        shippingAddress: {
          type: 'SHIPPING',
          firstName: 'A',
          lastName: 'B',
          address1: '1 Main St',
          city: 'Delhi',
          state: 'DL',
          postalCode: '110001',
          country: 'IN',
          phone: '9999999999',
        },
        shippingMethodId: UUID2,
      });
      expect(r.success).toBe(true);
    });

    it('rejects a checkout with a missing country', () => {
      const r = checkoutSchema.safeParse({
        email: 'a@b.com',
        shippingAddress: {
          type: 'SHIPPING',
          firstName: 'A',
          lastName: 'B',
          address1: '1 Main St',
          city: 'Delhi',
          state: 'DL',
          postalCode: '110001',
          phone: '9999999999',
        },
        shippingMethodId: UUID2,
      });
      expect(r.success).toBe(false);
    });
  });

  describe('createCouponSchema', () => {
    it('uppercases the code', () => {
      const r = createCouponSchema.safeParse({
        code: 'save10',
        name: 'Save 10',
        type: 'PERCENTAGE',
        value: 10,
        validFrom: '2026-01-01T00:00:00Z',
        validUntil: '2026-12-31T00:00:00Z',
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.code).toBe('SAVE10');
    });
  });
});