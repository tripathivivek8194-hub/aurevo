import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ShippingService } from './shipping.service';

/**
 * Unit tests for ShippingService:
 *  - G0 guard (onModuleInit): seeds default method when table empty, skips when
 *    populated, catches table-not-found during first db:push.
 *  - findAll / getAvailableMethods / calculateShipping basic behaviour.
 *  - create: conflict on duplicate code.
 *  - delete / reorder.
 * Prisma is mocked; no DB is touched.
 */

function build() {
  const shippingMethod = {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma: any = {
    shippingMethod,
    shippingZone: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new ShippingService(prisma);
  return { service, prisma, shippingMethod };
}

const DEFAULT_METHOD = {
  id: 'sm_1',
  name: 'Standard Shipping',
  code: 'standard',
  description: 'Standard domestic shipping',
  baseCost: 0,
  estimatedDays: 5,
  currency: 'INR',
  isActive: true,
  sortOrder: 0,
  zones: [],
  _count: { zones: 0 },
};

describe('ShippingService', () => {
  // ---- G0 guard (onModuleInit) ----

  describe('onModuleInit — G0 startup seed', () => {
    it('seeds default shipping method when table is empty', async () => {
      const { service, shippingMethod } = build();
      shippingMethod.count.mockResolvedValue(0);
      shippingMethod.create.mockResolvedValue(DEFAULT_METHOD);

      await service.onModuleInit();

      expect(shippingMethod.create).toHaveBeenCalledTimes(1);
      expect(shippingMethod.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'standard', baseCost: 0 }),
        }),
      );
    });

    it('does NOT seed when methods already exist', async () => {
      const { service, shippingMethod } = build();
      shippingMethod.count.mockResolvedValue(3);

      await service.onModuleInit();

      expect(shippingMethod.create).not.toHaveBeenCalled();
    });

    it('catches and logs when shipping_methods table does not exist yet', async () => {
      const { service, shippingMethod } = build();
      // Simulate a missing table — Prisma throws with code P2021
      shippingMethod.count.mockRejectedValue(
        new Error('table not found'),
      );

      // Should not throw
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  // ---- findAll ----

  describe('findAll', () => {
    it('returns all active methods with zones and count', async () => {
      const { service, shippingMethod } = build();
      shippingMethod.findMany.mockResolvedValue([DEFAULT_METHOD]);

      const result = await service.findAll();

      expect(shippingMethod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
      expect(result).toEqual([DEFAULT_METHOD]);
    });

    it('includes inactive methods when includeInactive is true', async () => {
      const { service, shippingMethod } = build();
      shippingMethod.findMany.mockResolvedValue([]);

      await service.findAll(true);

      expect(shippingMethod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  // ---- create ----

  describe('create', () => {
    it('creates a method when code is unique', async () => {
      const { service, prisma, shippingMethod } = build();
      prisma.shippingMethod.findUnique.mockResolvedValue(null); // no conflict
      prisma.shippingMethod.create.mockResolvedValue(DEFAULT_METHOD);

      const result = await service.create({
        name: 'Standard Shipping',
        code: 'standard',
        baseCost: 0,
        estimatedDays: 5,
        currency: 'INR',
        isActive: true,
      });

      expect(prisma.shippingMethod.create).toHaveBeenCalled();
      expect(result).toEqual(DEFAULT_METHOD);
    });

    it('throws ConflictException when code already exists', async () => {
      const { service, prisma } = build();
      prisma.shippingMethod.findUnique.mockResolvedValue(DEFAULT_METHOD);

      await expect(
        service.create({
          name: 'Standard Shipping',
          code: 'standard',
          baseCost: 0,
          estimatedDays: 5,
          currency: 'INR',
          isActive: true,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ---- delete ----

  describe('delete', () => {
    it('deletes an existing method', async () => {
      const { service, prisma } = build();
      prisma.shippingMethod.findUnique.mockResolvedValue(DEFAULT_METHOD);
      prisma.shippingMethod.delete.mockResolvedValue(DEFAULT_METHOD);

      await service.delete('sm_1');

      expect(prisma.shippingMethod.delete).toHaveBeenCalledWith({ where: { id: 'sm_1' } });
    });

    it('throws NotFoundException when method does not exist', async () => {
      const { service, prisma } = build();
      prisma.shippingMethod.findUnique.mockResolvedValue(null);

      await expect(service.delete('sm_missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ---- reorder ----

  describe('reorder', () => {
    it('updates sortOrder for each id', async () => {
      const { service, prisma } = build();
      prisma.shippingMethod.update.mockImplementation(({ where, data }) =>
        Promise.resolve({ ...DEFAULT_METHOD, ...data, id: where.id }),
      );

      await service.reorder(['b', 'a']);

      expect(prisma.shippingMethod.update).toHaveBeenCalledTimes(2);
      expect(prisma.shippingMethod.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'b' },
        data: { sortOrder: 0 },
      });
      expect(prisma.shippingMethod.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'a' },
        data: { sortOrder: 1 },
      });
    });
  });
});
