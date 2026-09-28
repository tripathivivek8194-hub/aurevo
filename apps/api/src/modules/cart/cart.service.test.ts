import { BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';

/**
 * Unit tests for the Phase 5 cart business logic — integer cart totals and the
 * checkout pre-validation that detects stale prices and insufficient stock.
 * Prisma is mocked so no DB is touched.
 *
 * getOrCreateCart now uses a single atomic upsert (INSERT … ON CONFLICT DO
 * UPDATE), so the mock must provide prisma.cart.upsert.  The old findFirst→create
 * path is gone and the tests must NEVER see prisma.cart.create called.
 */
describe('CartService — Phase 5 business logic', () => {
  function build() {
    const prisma: any = {
      cart: {
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      product: { findUnique: jest.fn() },
    };
    const productsService: any = {};
    const service = new CartService(prisma, productsService);
    return { service, prisma };
  }

  /** Seed the mock so getOrCreateCart (now an upsert) returns the given cart. */
  function mockCartUpsert(prisma: any, cart: any) {
    prisma.cart.upsert.mockResolvedValue(cart);
  }

  describe('getOrCreateCart — atomicity', () => {
    it('uses upsert for authenticated carts (unique userId)', async () => {
      const { service, prisma } = build();
      const cart = { id: 'cart-u1', userId: 'user-1', sessionId: null, items: [] };
      mockCartUpsert(prisma, cart);

      const result = await service.getOrCreateCart('user-1', undefined);

      expect(result.id).toBe('cart-u1');
      expect(prisma.cart.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.cart.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          update: {},
          create: { userId: 'user-1', sessionId: undefined },
        }),
      );
    });

    it('uses upsert for guest carts (unique sessionId)', async () => {
      const { service, prisma } = build();
      const sid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const cart = { id: 'cart-g1', userId: null, sessionId: sid, items: [] };
      mockCartUpsert(prisma, cart);

      const result = await service.getOrCreateCart(undefined, sid);

      expect(result.id).toBe('cart-g1');
      expect(prisma.cart.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: sid },
          update: {},
          create: { userId: undefined, sessionId: sid },
        }),
      );
    });

    it('never calls prisma.cart.create — eliminates the P2002 race', async () => {
      const { service, prisma } = build();
      mockCartUpsert(prisma, { id: 'c1', items: [] });

      await service.getOrCreateCart('user-x');

      expect(prisma.cart.create).not.toHaveBeenCalled();
      expect(prisma.cart.upsert).toHaveBeenCalledTimes(1);
    });

    it('rejects when neither userId nor sessionId is provided', async () => {
      const { service } = build();
      await expect(service.getOrCreateCart()).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-UUID sessionId', async () => {
      const { service } = build();
      await expect(
        service.getOrCreateCart(undefined, 'not-a-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCartSummary', () => {
    it('computes item count and an integer subtotal from cart items', async () => {
      const { service, prisma } = build();
      mockCartUpsert(prisma, {
        id: 'cart-1',
        items: [
          { priceSnapshot: 100000, quantity: 2 },
          { priceSnapshot: 50000, quantity: 1 },
        ],
      });

      const summary = await service.getCartSummary('user-1', undefined);

      expect(summary.itemCount).toBe(3);
      expect(summary.subtotal).toBe(250000);
      expect(Number.isInteger(summary.subtotal)).toBe(true);
    });

    it('is empty for a cart with no items', async () => {
      const { service, prisma } = build();
      mockCartUpsert(prisma, { id: 'cart-1', items: [] });

      const summary = await service.getCartSummary(undefined, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

      expect(summary.itemCount).toBe(0);
      expect(summary.subtotal).toBe(0);
    });
  });

  describe('validateCartForCheckout', () => {
    it('passes a cart whose product is active, in stock, and at the snapshot price', async () => {
      const { service, prisma } = build();
      mockCartUpsert(prisma, {
        id: 'cart-1',
        items: [
          {
            productId: 'p1', quantity: 2, priceSnapshot: 1000,
            product: { name: 'Shirt' }, variantId: null, variant: null,
          },
        ],
      });
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1', status: 'ACTIVE', basePrice: 1000, variants: [],
        inventory: [{ quantity: 10, reservedQuantity: 0, trackQuantity: true, allowBackorder: false }],
      });

      const result = await service.validateCartForCheckout('user-1');

      expect(result.isValid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('flags a price change since the item was added (price-staleness)', async () => {
      const { service, prisma } = build();
      mockCartUpsert(prisma, {
        id: 'cart-1',
        items: [
          {
            productId: 'p1', quantity: 1, priceSnapshot: 1000,
            product: { name: 'Shirt' }, variantId: null, variant: null,
          },
        ],
      });
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1', status: 'ACTIVE', basePrice: 2000, variants: [],
        inventory: [{ quantity: 10, reservedQuantity: 0, trackQuantity: true, allowBackorder: false }],
      });

      const result = await service.validateCartForCheckout('user-1');

      expect(result.isValid).toBe(false);
      expect(result.issues.some((m: string) => m.includes('Price for') && m.includes('changed'))).toBe(true);
    });

    it('flags insufficient stock against available = quantity - reserved', async () => {
      const { service, prisma } = build();
      mockCartUpsert(prisma, {
        id: 'cart-1',
        items: [
          {
            productId: 'p1', quantity: 5, priceSnapshot: 1000,
            product: { name: 'Shirt' }, variantId: null, variant: null,
          },
        ],
      });
      // quantity 10, 7 already reserved → only 3 available for the 5 requested.
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1', status: 'ACTIVE', basePrice: 1000, variants: [],
        inventory: [{ quantity: 10, reservedQuantity: 7, trackQuantity: true, allowBackorder: false }],
      });

      const result = await service.validateCartForCheckout(undefined, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

      expect(result.isValid).toBe(false);
      expect(result.issues.some((m: string) => m.includes('Only 3'))).toBe(true);
    });

    it('flags an inactive product as unavailable', async () => {
      const { service, prisma } = build();
      mockCartUpsert(prisma, {
        id: 'cart-1',
        items: [
          {
            productId: 'p1', quantity: 1, priceSnapshot: 1000,
            product: { name: 'Old' }, variantId: null, variant: null,
          },
        ],
      });
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1', status: 'DRAFT', basePrice: 1000, variants: [],
        inventory: [{ quantity: 10, reservedQuantity: 0, trackQuantity: true, allowBackorder: false }],
      });

      const result = await service.validateCartForCheckout('user-1');

      expect(result.isValid).toBe(false);
      expect(result.issues.some((m: string) => m.includes('no longer available'))).toBe(true);
    });
  });
});
