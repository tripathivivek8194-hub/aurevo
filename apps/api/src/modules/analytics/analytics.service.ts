import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';
import { randomUUID } from 'crypto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordStoreEvent(input: {
    visitorId: string;
    event: string;
    source?: string;
    path?: string;
    productId?: string;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO "analytics_events" ("id", "visitorId", "event", "source", "path", "productId", "createdAt")
      VALUES (${randomUUID()}, ${input.visitorId}, ${input.event}, ${input.source ?? null}, ${input.path ?? null}, ${input.productId ?? null}, NOW())
    `;
  }

  private async uniqueVisitors(event: string, startDate: Date, endDate: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "visitorId") AS "count"
      FROM "analytics_events"
      WHERE "event" = ${event}
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async getRevenueAnalytics(params: { startDate: Date; endDate: Date }) {
    const startDate = startOfDay(params.startDate);
    const endDate = endOfDay(params.endDate);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      select: { createdAt: true, total: true, subtotal: true, shippingCost: true, tax: true, discount: true },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Daily breakdown
    const daily = orders.reduce((acc, order) => {
      const date = format(order.createdAt, 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = { date, revenue: 0, orders: 0, aov: 0 };
      }
      acc[date].revenue += order.total;
      acc[date].orders += 1;
      return acc;
    }, {} as Record<string, { date: string; revenue: number; orders: number; aov: number }>);

    Object.values(daily).forEach(d => {
      d.aov = d.orders > 0 ? d.revenue / d.orders : 0;
    });

    return {
      summary: { totalRevenue, totalOrders, avgOrderValue },
      daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async getConversionFunnel(params: { startDate: Date; endDate: Date }) {
    const startDate = startOfDay(params.startDate);
    const endDate = endOfDay(params.endDate);

    const [
      sessions,
      productViews,
      addToCarts,
      checkoutsStarted,
      ordersPlaced,
    ] = await Promise.all([
      this.uniqueVisitors('SESSION', startDate, endDate),
      this.uniqueVisitors('PRODUCT_VIEW', startDate, endDate),
      this.uniqueVisitors('ADD_TO_CART', startDate, endDate),
      this.uniqueVisitors('CHECKOUT_STARTED', startDate, endDate),
      this.prisma.order.count({
        where: { createdAt: { gte: startDate, lte: endDate }, status: { notIn: ['CANCELLED', 'FAILED'] } },
      }),
    ]);

    return {
      sessions,
      productViews,
      addToCarts,
      checkoutsStarted,
      ordersPlaced,
      conversionRates: {
        viewToCart: productViews > 0 ? (addToCarts / productViews) * 100 : 0,
        cartToCheckout: addToCarts > 0 ? (checkoutsStarted / addToCarts) * 100 : 0,
        checkoutToOrder: checkoutsStarted > 0 ? (ordersPlaced / checkoutsStarted) * 100 : 0,
        overall: sessions > 0 ? (ordersPlaced / sessions) * 100 : 0,
      },
    };
  }

  async getCustomerAnalytics(params: { startDate: Date; endDate: Date }) {
    const startDate = startOfDay(params.startDate);
    const endDate = endOfDay(params.endDate);

    const [
      newCustomers,
      returningCustomers,
      totalCustomers,
      customerLifetimeValue,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { createdAt: { gte: startDate, lte: endDate }, role: 'CUSTOMER' },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { lt: startDate },
          role: 'CUSTOMER',
          orders: { some: { createdAt: { gte: startDate, lte: endDate } } },
        },
      }),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.prisma.order.aggregate({
        where: { status: { notIn: ['CANCELLED', 'FAILED'] } },
        _avg: { total: true },
      }),
    ]);

    // Repeat purchase rate
    const customersWithOrders = await this.prisma.user.findMany({
      where: { role: 'CUSTOMER', orders: { some: { status: { notIn: ['CANCELLED', 'FAILED'] } } } },
      select: { id: true, _count: { select: { orders: true } } },
    });

    const repeatCustomers = customersWithOrders.filter(c => c._count.orders > 1).length;
    const repeatRate = customersWithOrders.length > 0 ? (repeatCustomers / customersWithOrders.length) * 100 : 0;

    return {
      newCustomers,
      returningCustomers,
      totalCustomers,
      averageLifetimeValue: customerLifetimeValue._avg.total ?? 0,
      repeatPurchaseRate: repeatRate,
    };
  }

  async getProductAnalytics(params: { startDate: Date; endDate: Date }) {
    const startDate = startOfDay(params.startDate);
    const endDate = endOfDay(params.endDate);

    const topSelling = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { createdAt: { gte: startDate, lte: endDate }, status: { notIn: ['CANCELLED', 'FAILED'] } } },
      _sum: { quantity: true, totalPrice: true },
      _count: { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 20,
    });

    const topRevenue = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { createdAt: { gte: startDate, lte: endDate }, status: { notIn: ['CANCELLED', 'FAILED'] } } },
      _sum: { totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: 20,
    });

    const productsWithDetails = await Promise.all(
      topSelling.map(async (item) => {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true, sku: true, basePrice: true, images: { where: { isPrimary: true }, take: 1 } },
        });
        return { ...item, product };
      })
    );

    const lowStock = await this.prisma.inventory.findMany({
      where: { trackQuantity: true, quantity: { gt: 0, lte: 10 } },
      include: { product: { select: { name: true, sku: true } }, variant: { select: { name: true, sku: true } } },
      take: 20,
    });

    const outOfStock = await this.prisma.inventory.findMany({
      where: { trackQuantity: true, quantity: { lte: 0 } },
      include: { product: { select: { name: true, sku: true } }, variant: { select: { name: true, sku: true } } },
      take: 20,
    });

    return {
      topSelling: productsWithDetails,
      topRevenue,
      lowStock,
      outOfStock,
    };
  }

  async getTrafficSources() {
    const since = subDays(new Date(), 30);
    return this.prisma.$queryRaw<Array<{ source: string; sessions: bigint }>>`
      SELECT COALESCE("source", 'DIRECT') AS "source",
             COUNT(DISTINCT "visitorId") AS "sessions"
      FROM "analytics_events"
      WHERE "event" = 'SESSION' AND "createdAt" >= ${since}
      GROUP BY COALESCE("source", 'DIRECT')
      ORDER BY "sessions" DESC
    `.then((rows) => rows.map((row) => ({
      source: row.source,
      sessions: Number(row.sessions),
    })));
  }

  async getRealTimeStats() {
    const now = new Date();
    const lastHour = subDays(now, 1/24);
    const last24Hours = subDays(now, 1);

    const [ordersLastHour, ordersLast24Hours, activeVisitorRows, revenueLast24Hours] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: lastHour } } }),
      this.prisma.order.count({ where: { createdAt: { gte: last24Hours } } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "visitorId") AS "count"
        FROM "analytics_events"
        WHERE "createdAt" >= ${new Date(now.getTime() - 15 * 60 * 1000)}
      `,
      this.prisma.order.aggregate({
        where: { createdAt: { gte: last24Hours }, status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { total: true },
      }),
    ]);

    return {
      ordersLastHour,
      ordersLast24Hours,
      activeUsers: Number(activeVisitorRows[0]?.count ?? 0),
      revenueLast24Hours: revenueLast24Hours._sum.total ?? 0,
      timestamp: now.toISOString(),
    };
  }
}
