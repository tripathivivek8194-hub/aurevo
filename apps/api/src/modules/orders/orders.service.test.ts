import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * Unit tests for the Phase 6 order lifecycle hardening — owner/admin access
 * control, persisted cancellation notes, status-transition validation, and the
 * transactional, clamped inventory release. Prisma is mocked; no DB is touched.
 */
describe('OrdersService — Phase 6 business logic', () => {
  function build() {
    const prisma: any = {
      order: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
      orderItem: { findMany: jest.fn() },
      product: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new OrdersService(prisma);
    return { service, prisma };
  }

  describe('findById / findByOrderNumber — owner or admin only', () => {
    it('rejects an unauthenticated lookup', async () => {
      const { service } = build();
      await expect(service.findById('o1')).rejects.toThrow(ForbiddenException);
      await expect(service.findByOrderNumber('ORD-1')).rejects.toThrow(ForbiddenException);
    });

    it('hides another user\'s order (404, not found)', async () => {
      const { service, prisma } = build();
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.findById('o1', 'user-b', 'CUSTOMER')).rejects.toThrow(NotFoundException);
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1', userId: 'user-b' } }),
      );
    });

    it('returns the order to its owner', async () => {
      const { service, prisma } = build();
      prisma.order.findFirst.mockResolvedValue({ id: 'o1', userId: 'user-a' });
      const order = await service.findById('o1', 'user-a', 'CUSTOMER');
      expect(order.id).toBe('o1');
    });

    it('lets an admin read any order regardless of owner', async () => {
      const { service, prisma } = build();
      prisma.order.findFirst.mockResolvedValue({ id: 'o1', userId: 'someone-else' });
      const order = await service.findById('o1', 'admin', 'ADMIN');
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1' } }),
      );
      expect(order.id).toBe('o1');
    });
  });

  describe('cancelOrder — owner or admin only', () => {
    const order = { id: 'o1', userId: 'user-a', status: 'PAYMENT_PENDING' };

    it('rejects an unauthenticated caller', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue(order);
      await expect(service.cancelOrder('o1')).rejects.toThrow(ForbiddenException);
    });

    it('rejects a non-owner caller', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue(order);
      await expect(service.cancelOrder('o1', 'user-b', 'CUSTOMER')).rejects.toThrow(ForbiddenException);
    });

    it('allows the owner and persists the cancellation reason', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue(order);
      const tx: any = {
        order: { update: jest.fn().mockResolvedValue({ id: 'o1', status: 'CANCELLED' }) },
        // CANCELLED releases inventory; no items → nothing to release.
        orderItem: { findMany: jest.fn().mockResolvedValue([]) },
        product: { findUnique: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.cancelOrder('o1', 'user-a', 'CUSTOMER', 'changed my mind');

      expect(tx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CANCELLED', notes: 'changed my mind' }),
        }),
      );
    });
  });

  describe('updateStatus — transitions + clamped release', () => {
    it('rejects an invalid status transition before touching the DB', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PAYMENT_PENDING', paidAt: null, shippedAt: null, deliveredAt: null });

      await expect(service.updateStatus('o1', { status: 'DELIVERED' })).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sets paidAt on PAID and does not release inventory', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PAYMENT_PENDING', paidAt: null, shippedAt: null, deliveredAt: null });
      const tx: any = { order: { update: jest.fn().mockResolvedValue({ id: 'o1', status: 'PAID', paidAt: new Date() }) } };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.updateStatus('o1', { status: 'PAID' });

      const data = tx.order.update.mock.calls[0][0].data;
      expect(data.status).toBe('PAID');
      expect(data.paidAt).toBeInstanceOf(Date);
    });

    it('releases reserved inventory atomically (clamped, never negative) on cancellation', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PAYMENT_PENDING', paidAt: null, shippedAt: null, deliveredAt: null });

      const tx: any = {
        order: { update: jest.fn().mockResolvedValue({ id: 'o1', status: 'CANCELLED' }) },
        orderItem: {
          findMany: jest.fn().mockResolvedValue([
            { orderId: 'o1', productId: 'p1', variantId: null, quantity: 2 },
          ]),
        },
        product: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'p1', name: 'X', sku: 'X-1', variants: [],
            inventory: [{ id: 'inv1', trackQuantity: true }],
          }),
        },
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.updateStatus('o1', { status: 'CANCELLED', notes: 'cancelled' });

      // Release runs inside the same transaction, and is a single clamped UPDATE.
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const query = (tx.$executeRaw.mock.calls[0][0] as string[]).join('');
      // Postgres has no scalar MAX() — that's SQLite. Use GREATEST so a
      // CANCELLED/FAILED transition doesn't 500 with 42883.
      expect(query).toContain('GREATEST(0');
      expect(query).not.toContain('MAX(0');
      expect(query).toContain('"reservedQuantity"');
    });

    it('does not call the release at all when transitioning to a non-release status', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PAYMENT_PENDING', paidAt: null, shippedAt: null, deliveredAt: null });
      const tx: any = { order: { update: jest.fn().mockResolvedValue({ id: 'o1', status: 'FAILED' }) } };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.updateStatus('o1', { status: 'FAILED' });

      expect(tx.order.update).toHaveBeenCalled();
      expect((tx as any).$executeRaw).toBeUndefined();
    });
  });
});
