import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const last7Days = subDays(today, 7);
    const last30Days = subDays(today, 30);

    const [
      totalUsers,
      totalOrders,
      totalRevenue,
      totalProducts,
      pendingOrders,
      lowStockCount,
      recentOrders,
      revenueLast7Days,
      revenueLast30Days,
      ordersLast7Days,
      ordersLast30Days,
      usersLast7Days,
      usersLast30Days,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        where: { status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { total: true },
      }),
      this.prisma.product.count({ where: { status: 'ACTIVE' } }),
      this.prisma.order.count({ where: { status: { in: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'FULFILLMENT'] } } }),
      this.prisma.inventory.count({
        where: { trackQuantity: true, quantity: { gt: 0, lte: 10 } },
      }),
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.order.aggregate({
        where: { createdAt: { gte: last7Days }, status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: { createdAt: { gte: last30Days }, status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { total: true },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: last7Days } } }),
      this.prisma.order.count({ where: { createdAt: { gte: last30Days } } }),
      this.prisma.user.count({ where: { createdAt: { gte: last7Days }, role: 'CUSTOMER' } }),
      this.prisma.user.count({ where: { createdAt: { gte: last30Days }, role: 'CUSTOMER' } }),
    ]);

    // Revenue by day for last 30 days
    const revenueByDay = await this.prisma.$queryRaw`
      SELECT DATE("createdAt") as date, SUM("total") as revenue
      FROM "orders"
      WHERE "createdAt" >= ${last30Days} AND "status" NOT IN ('CANCELLED', 'FAILED')
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    // Orders by status
    const ordersByStatus = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    // Top products by revenue
    const topProducts = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { status: { notIn: ['CANCELLED', 'FAILED'] } } },
      _sum: { totalPrice: true, quantity: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: 10,
    });

    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true, sku: true, images: { where: { isPrimary: true }, take: 1 } },
        });
        return { ...item, product };
      })
    );

    // Top customers by spend
    const topCustomers = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, status: { notIn: ['CANCELLED', 'FAILED'] } },
      _sum: { total: true },
      _count: { id: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    });

    const topCustomersWithDetails = await Promise.all(
      topCustomers.map(async (item) => {
        const user = await this.prisma.user.findUnique({
          where: { id: item.userId },
          select: { email: true, firstName: true, lastName: true },
        });
        return { ...item, user };
      })
    );

    return {
      overview: {
        totalUsers,
        totalOrders,
        totalRevenue: totalRevenue._sum.total ?? 0,
        totalProducts,
        pendingOrders,
        lowStockCount,
      },
      trends: {
        revenueLast7Days: revenueLast7Days._sum.total ?? 0,
        revenueLast30Days: revenueLast30Days._sum.total ?? 0,
        ordersLast7Days,
        ordersLast30Days,
        usersLast7Days,
        usersLast30Days,
      },
      charts: {
        revenueByDay: (revenueByDay as any[]).map(r => ({
          date: format(new Date(r.date), 'MMM dd'),
          revenue: Number(r.revenue),
        })),
        ordersByStatus: ordersByStatus.map(o => ({ status: o.status, count: o._count.id })),
      },
      topProducts: topProductsWithDetails,
      topCustomers: topCustomersWithDetails,
      recentOrders,
    };
  }

  async getSalesReport(params: {
    startDate: Date;
    endDate: Date;
    groupBy?: 'day' | 'week' | 'month';
  }) {
    const { startDate, endDate, groupBy = 'day' } = params;

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      select: { createdAt: true, total: true, status: true },
    });

    // Group by date
    const grouped = orders.reduce((acc, order) => {
      let key: string;
      if (groupBy === 'day') {
        key = format(order.createdAt, 'yyyy-MM-dd');
      } else if (groupBy === 'week') {
        key = format(order.createdAt, 'yyyy-\'W\'ww');
      } else {
        key = format(order.createdAt, 'yyyy-MM');
      }

      if (!acc[key]) {
        acc[key] = { date: key, revenue: 0, orders: 0 };
      }
      acc[key].revenue += order.total;
      acc[key].orders += 1;
      return acc;
    }, {} as Record<string, { date: string; revenue: number; orders: number }>);

    const reportRows = Object.values(grouped) as Array<{
      date: string;
      revenue: number;
      orders: number;
    }>;

    return reportRows.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getProductReport() {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        _count: { select: { orderItems: true, reviews: true } },
        inventory: true,
      },
    });

    // Get revenue per product
    const productRevenue = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { status: { notIn: ['CANCELLED', 'FAILED'] } } },
      _sum: { totalPrice: true, quantity: true },
    });

    type ProductRevenue = (typeof productRevenue)[number];
    const revenueMap = new Map<string, ProductRevenue>(
      productRevenue.map(p => [p.productId, p] as [string, ProductRevenue]),
    );

    return products.map(product => {
      const rev = revenueMap.get(product.id);
      return {
        ...product,
        revenue: rev ? Number(rev._sum.totalPrice) : 0,
        unitsSold: rev ? rev._sum.quantity : 0,
        reviewCount: product._count.reviews,
        inventory: product.inventory,
      };
    });
  }

  async getCustomerReport() {
    const customers = await this.prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      include: {
        _count: { select: { orders: true, reviews: true } },
        orders: {
          where: { status: { notIn: ['CANCELLED', 'FAILED'] } },
          select: { total: true, createdAt: true },
        },
      },
    });

    return customers.map(customer => {
      const orders = customer.orders || [];
      const totalSpent = orders.reduce((sum: number, o: { total: number }) => sum + o.total, 0);
      const orderCount = orders.length;
      const lastOrder = orders.length > 0
        ? orders.reduce((latest, o) => o.createdAt > latest.createdAt ? o : latest).createdAt
        : null;

      return {
        id: customer.id,
        email: customer.email,
        name: `${customer.firstName} ${customer.lastName}`,
        totalSpent,
        orderCount,
        reviewCount: customer._count.reviews,
        lastOrderDate: lastOrder,
        createdAt: customer.createdAt,
      };
    }).sort((a, b) => b.totalSpent - a.totalSpent);
  }

  async getInventoryReport() {
    const inventory = await this.prisma.inventory.findMany({
      where: { trackQuantity: true },
      include: {
        product: { select: { id: true, name: true, sku: true, status: true, supplierId: true } },
        variant: { select: { id: true, name: true, sku: true, attributes: true } },
      },
    });

    return inventory.map(item => ({
      ...item,
      available: item.quantity - item.reservedQuantity,
      isLowStock: item.quantity > 0 && item.quantity <= item.lowStockThreshold,
      isOutOfStock: item.quantity <= 0,
      inventoryValue: item.quantity * (item.product as any).basePrice,
    })).sort((a, b) => a.quantity - b.quantity);
  }
}
