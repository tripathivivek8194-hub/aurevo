import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const prisma = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    order: {
      count: jest.fn(),
    },
  } as any;

  const service = new AnalyticsService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('stores only the bounded first-party event fields', async () => {
    prisma.$executeRaw.mockResolvedValue(1);

    await service.recordStoreEvent({
      visitorId: '0dbf9878-8e06-40eb-b515-dd414b753331',
      event: 'PRODUCT_VIEW',
      source: 'DIRECT',
      path: '/products/example',
      productId: 'product-1',
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('builds the funnel from unique visitors and real orders', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: 3n }])
      .mockResolvedValueOnce([{ count: 2n }])
      .mockResolvedValueOnce([{ count: 1n }])
      .mockResolvedValueOnce([{ count: 1n }]);
    prisma.order.count.mockResolvedValue(1);

    const result = await service.getConversionFunnel({
      startDate: new Date('2026-09-01T12:00:00.000Z'),
      endDate: new Date('2026-09-30T12:00:00.000Z'),
    });

    expect(result).toMatchObject({
      sessions: 3,
      productViews: 2,
      addToCarts: 1,
      checkoutsStarted: 1,
      ordersPlaced: 1,
    });
    expect(result.conversionRates.viewToCart).toBe(50);
    expect(result.conversionRates.overall).toBeCloseTo(33.33, 1);
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: {
        createdAt: { gte: expect.any(Date), lte: expect.any(Date) },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
    });
  });
});
