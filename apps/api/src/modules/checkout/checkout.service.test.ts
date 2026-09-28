import { BadRequestException, ConflictException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

/**
 * Unit tests for the Phase 5 checkout business logic — integer-paise tax
 * rounding, server-computed totals, and the atomic (TOCTOU-safe) inventory
 * reservation. Prisma and the sibling services are mocked so no DB is touched.
 */
describe('CheckoutService — Phase 5 business logic', () => {
  function build() {
    const cartService = { validateCartForCheckout: jest.fn() };
    const shippingService = { getAvailableMethods: jest.fn() };
    const prisma: any = { $transaction: jest.fn() };
    const emailService: any = {
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CheckoutService(
      prisma,
      cartService as any,
      shippingService as any,
      emailService as any,
    );
    return { service, cartService, shippingService, prisma, emailService };
  }

  const validCart = () => ({
    id: 'cart-1',
    items: [
      {
        productId: 'clxp1',
        variantId: null,
        priceSnapshot: 1000,
        quantity: 2,
        product: {
          id: 'clxp1',
          name: 'X',
          sku: 'X-1',
          variants: [],
          inventory: [{ id: 'inv1', trackQuantity: true }],
        },
        variant: null,
      },
    ],
  });

  describe('previewOrder', () => {
    it('rounds fractional-paise tax to an integer and sums totals', async () => {
      const { service, cartService, shippingService } = build();
      // subtotal = ₹3.33 (333 paise); 18% of 333 = 59.94 paise → rounds to 60.
      // Without Math.round the float 59.94 would violate the Int tax column.
      cartService.validateCartForCheckout.mockResolvedValue({
        isValid: true,
        issues: [],
        cart: {
          id: 'cart-1',
          items: [
            {
              productId: 'clxp1',
              variantId: null,
              priceSnapshot: 333,
              quantity: 1,
              product: { name: 'Tea' },
              variant: null,
            },
          ],
        },
      });
      shippingService.getAvailableMethods.mockResolvedValue([]);

      const preview = await service.previewOrder(undefined, 'session-a');

      expect(preview.subtotal).toBe(333);
      expect(preview.tax).toBe(60); // Math.round(333 * 0.18)
      expect(Number.isInteger(preview.tax)).toBe(true);
      expect(Number.isInteger(preview.total)).toBe(true);
      // No shipping method chosen → shipping cost is 0.
      expect(preview.total).toBe(333 + 60);
    });

    it('respects a shipping method base cost and keeps totals integer', async () => {
      const { service, cartService, shippingService } = build();
      cartService.validateCartForCheckout.mockResolvedValue({
        isValid: true,
        issues: [],
        cart: {
          id: 'cart-1',
          items: [
            {
              productId: 'clxp1',
              variantId: null,
              priceSnapshot: 100000,
              quantity: 2,
              product: { name: 'Shirt' },
              variant: null,
            },
          ],
        },
      });
      shippingService.getAvailableMethods.mockResolvedValue([
        { id: 'ship1', name: 'Standard', estimatedDays: 5, baseCost: 9900, perItemCost: 0 },
      ]);

      const preview = await service.previewOrder(undefined, 's', 'ship1');

      const subtotal = 200000;
      const shippingCost = 9900;
      const tax = Math.round(subtotal * 0.18);
      expect(preview.subtotal).toBe(subtotal);
      expect(preview.shippingCost).toBe(shippingCost);
      expect(preview.tax).toBe(tax);
      expect(preview.total).toBe(subtotal + shippingCost + tax);
      expect(Number.isInteger(preview.total)).toBe(true);
    });
  });

  describe('createOrder', () => {
    it('creates an order with integer totals and reserves stock via a single conditional UPDATE', async () => {
      const { service, cartService } = build();
      cartService.validateCartForCheckout.mockResolvedValue({
        isValid: true,
        issues: [],
        cart: validCart(),
      });

      const tx: any = {
        order: {
          create: jest.fn().mockResolvedValue({
            id: 'ord1',
            orderNumber: 'ORD-1',
            status: 'PAYMENT_PENDING',
            total: 2360,
            currency: 'INR',
          }),
        },
        orderItem: { create: jest.fn().mockResolvedValue({}) },
        product: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'clxp1',
            name: 'X',
            sku: 'X-1',
            variants: [],
            inventory: [{ id: 'inv1', trackQuantity: true, allowBackorder: false, quantity: 10, reservedQuantity: 0 }],
          }),
        },
        cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      (service as any).prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const result = await service.createOrder(undefined, 's', {
        email: 'a@test.dev',
        shippingAddress: {
          firstName: 'A', lastName: 'B', address1: '1', city: 'C',
          state: 'S', postalCode: 'P', country: 'US', phone: '+1',
        },
      } as any);

      // Integer totals: subtotal 2000 + tax round(360) + shipping 0.
      expect(result.order.id).toBe('ord1');
      expect(result.order.status).toBe('PAYMENT_PENDING');
      expect(result.order.total).toBe(2360);
      expect(Number.isInteger(result.order.total)).toBe(true);

      // Reservation is a single atomic conditional UPDATE (the TOCTOU fix),
      // not a separate read-then-blind-increment.
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const query = (tx.$executeRaw.mock.calls[0][0] as string[]).join('');
      expect(query).toContain('"quantity" - "reservedQuantity"');
      // Postgres `allowBackorder` is BOOLEAN — comparing to integer 1 raises
      // 42883 ("operator does not exist: boolean = integer") and 500s checkout.
      expect(query).toContain('"allowBackorder" = true');
      expect(query).not.toContain('"allowBackorder" = 1');

      // Order items + cart clearing still happen; no non-atomic update path.
      expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
      expect(tx.cartItem.deleteMany).toHaveBeenCalled();
    });

    it('rejects a couponCode loudly instead of silently charging full price', async () => {
      const { service, cartService } = build();
      // The coupon check must fire before any cart work happens.
      const validate = jest.fn();
      cartService.validateCartForCheckout = validate;

      await expect(
        service.createOrder(undefined, 's', {
          email: 'a@t.dev',
          shippingAddress: {},
          couponCode: 'SAVE20',
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(validate).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the atomic reserve finds insufficient stock', async () => {
      const { service, cartService } = build();
      cartService.validateCartForCheckout.mockResolvedValue({
        isValid: true,
        issues: [],
        cart: validCart(),
      });

      const tx: any = {
        order: {
          create: jest.fn().mockResolvedValue({
            id: 'ord1', orderNumber: 'ORD-1', status: 'PAYMENT_PENDING', total: 2360, currency: 'INR',
          }),
        },
        orderItem: { create: jest.fn() },
        product: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'clxp1', name: 'X', sku: 'X-1', variants: [],
            inventory: [{ id: 'inv1', trackQuantity: true, allowBackorder: false, quantity: 1, reservedQuantity: 0 }],
          }),
        },
        cartItem: { deleteMany: jest.fn() },
        // 0 rows affected → not enough stock.
        $executeRaw: jest.fn().mockResolvedValue(0),
      };
      (service as any).prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await expect(
        service.createOrder(undefined, 's', { email: 'a@t.dev', shippingAddress: {} } as any),
      ).rejects.toThrow(ConflictException);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
