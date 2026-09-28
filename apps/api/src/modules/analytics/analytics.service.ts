import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRevenueAnalytics(params: { startDate: Date; endDate: Date }) {
    const { startDate, endDate } = params;

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
    const { startDate, endDate } = params;

    // This would typically come from analytics events
    // For now, we'll approximate from order data
    const [
      sessions, // Would come from analytics
      productViews,
      addToCarts,
      checkoutsStarted,
      ordersPlaced,
    ] = await Promise.all([
      Promise.resolve(0), // Placeholder
      this.prisma.product.count(), // Approximation
      this.prisma.cartItem.count(),
      this.prisma.order.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
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
    const { startDate, endDate } = params;

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
    const { startDate, endDate } = params;

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
    // This would typically come from analytics tracking
    // Placeholder implementation
    return [
      { source: 'Direct', sessions: 0, revenue: 0, conversionRate: 0 },
      { source: 'Organic Search', sessions: 0, revenue: 0, conversionRate: 0 },
      { source: 'Paid Search', sessions: 0, revenue: 0, conversionRate: 0 },
      { source: 'Social', sessions: 0, revenue: 0, conversionRate: 0 },
      { source: 'Email', sessions: 0, revenue: 0, conversionRate: 0 },
      { source: 'Referral', sessions: 0, revenue: 0, conversionRate: 0 },
    ];
  }

  async getRealTimeStats() {
    const now = new Date();
    const lastHour = subDays(now, 1/24);
    const last24Hours = subDays(now, 1);

    const [ordersLastHour, ordersLast24Hours, activeUsers, revenueLast24Hours] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: lastHour } } }),
      this.prisma.order.count({ where: { createdAt: { gte: last24Hours } } }),
      Promise.resolve(0), // Would come from session tracking
      this.prisma.order.aggregate({
        where: { createdAt: { gte: last24Hours }, status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { total: true },
      }),
    ]);

    return {
      ordersLastHour,
      ordersLast24Hours,
      activeUsers,
      revenueLast24Hours: revenueLast24Hours._sum.total ?? 0,
      timestamp: now.toISOString(),
    };
  }
}