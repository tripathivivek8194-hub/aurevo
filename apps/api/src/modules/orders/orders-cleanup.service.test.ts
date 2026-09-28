import { Test, TestingModule } from '@nestjs/testing';
import { OrdersCleanupService } from './orders-cleanup.service';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../database/prisma.service';

describe('OrdersCleanupService', () => {
  let service: OrdersCleanupService;
  let ordersService: { updateStatus: jest.Mock };
  let prisma: { order: { findMany: jest.Mock } };

  beforeEach(async () => {
    ordersService = {
      updateStatus: jest.fn().mockResolvedValue({}),
    };
    prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersCleanupService,
        { provide: OrdersService, useValue: ordersService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(OrdersCleanupService);
    // Don't run onModuleInit (no setInterval in tests)
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns 0 and does nothing when no stale orders', async () => {
    const count = await service.releaseStaleOrders();
    expect(count).toBe(0);
    expect(ordersService.updateStatus).not.toHaveBeenCalled();
  });

  it('cancels stale orders older than the threshold', async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: 'ord_1', orderNumber: 'AUR1111111111' },
      { id: 'ord_2', orderNumber: 'AUR2222222222' },
    ]);

    const count = await service.releaseStaleOrders();

    expect(count).toBe(2);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PAYMENT_PENDING',
          createdAt: { lt: expect.any(Date) },
        }),
      }),
    );
    expect(ordersService.updateStatus).toHaveBeenCalledTimes(2);
    expect(ordersService.updateStatus).toHaveBeenCalledWith('ord_1', {
      status: 'CANCELLED',
      notes: expect.stringContaining('Auto-cancelled'),
    });
    expect(ordersService.updateStatus).toHaveBeenCalledWith('ord_2', {
      status: 'CANCELLED',
      notes: expect.stringContaining('Auto-cancelled'),
    });
  });

  it('continues past a failed order and still counts the rest', async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: 'ord_1', orderNumber: 'AUR1111111111' },
      { id: 'ord_2', orderNumber: 'AUR2222222222' },
    ]);
    ordersService.updateStatus
      .mockRejectedValueOnce(new Error('transition invalid'))
      .mockResolvedValueOnce({});

    const count = await service.releaseStaleOrders();

    expect(count).toBe(1);
    expect(ordersService.updateStatus).toHaveBeenCalledTimes(2);
  });
});
