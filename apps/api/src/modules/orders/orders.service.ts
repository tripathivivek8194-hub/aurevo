import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus, UserRole } from '@aurevo/shared/types';
import { EmailService } from '../email/email.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: OrderStatus;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      page = 1,
      limit = 20,
      status,
      userId,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const where: any = {};

    if (status) {
      where.status = status;
    }
    if (userId) {
      where.userId = userId;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          items: { include: { product: { select: { name: true, images: { where: { isPrimary: true }, take: 1 } } } } },
          payments: true,
          shipments: true,
          _count: { select: { items: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Order history for the authenticated customer (scoped to their userId). */
  async findMine(userId: string, params: {
    page?: number;
    limit?: number;
    status?: OrderStatus;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page = 1, limit = 20, status, sortBy = 'createdAt', sortOrder = 'desc' } = params;

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: { include: { product: { select: { name: true, images: { where: { isPrimary: true }, take: 1 } } } } },
          payments: true,
          shipments: true,
          _count: { select: { items: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, userId?: string, role?: string) {
    const isAdmin = role === UserRole.ADMIN;
    if (!isAdmin && !userId) {
      throw new ForbiddenException('Authentication required');
    }
    const order = await this.prisma.order.findFirst({
      where: { id, ...(isAdmin ? {} : { userId }) },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { name: true, slug: true, images: { where: { isPrimary: true }, take: 1 } } },
            variant: true,
          },
        },
        payments: true,
        shipments: { include: { trackingEvents: { orderBy: { timestamp: 'asc' } } } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async findByOrderNumber(orderNumber: string, userId?: string, role?: string) {
    const isAdmin = role === UserRole.ADMIN;
    if (!isAdmin && !userId) {
      throw new ForbiddenException('Authentication required');
    }
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, ...(isAdmin ? {} : { userId }) },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { name: true, slug: true, images: { where: { isPrimary: true }, take: 1 } } },
            variant: true,
          },
        },
        payments: true,
        shipments: { include: { trackingEvents: { orderBy: { timestamp: 'asc' } } } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { user: { select: { email: true, emailOrderUpdates: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
      PAYMENT_PENDING: ['PAID', 'CANCELLED', 'FAILED'],
      PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
      PROCESSING: ['FULFILLMENT', 'CANCELLED'],
      FULFILLMENT: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED', 'RETURNED'],
      DELIVERED: ['RETURNED', 'REFUNDED'],
      CANCELLED: [],
      REFUNDED: [],
      FAILED: ['PAYMENT_PENDING', 'CANCELLED'],
      RETURNED: ['REFUNDED'],
    };

    const allowed = validTransitions[order.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot transition from ${order.status} to ${dto.status}`);
    }

    const updateData: any = { status: dto.status };
    if (dto.notes) {
      updateData.notes = dto.notes;
    }

    // Set timestamps based on status
    if (dto.status === 'PAID' && !order.paidAt) {
      updateData.paidAt = new Date();
    }
    if (dto.status === 'SHIPPED' && !order.shippedAt) {
      updateData.shippedAt = new Date();
    }
    if (dto.status === 'DELIVERED' && !order.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    const shouldRelease = dto.status === 'CANCELLED' || dto.status === 'REFUNDED';

    // Status change + inventory release are one transaction, so a released
    // reservation can never be left half-applied. The release itself is atomic
    // and clamped (never below 0), matching the Phase 5 TOCTOU fix.
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id },
        data: updateData,
        include: {
          items: { include: { product: { select: { name: true } }, variant: true } },
          payments: true,
        },
      });

      if (shouldRelease) {
        await this.releaseReservedInventory(tx, order.id);
      }

      return result;
    });

    if (order.user?.emailOrderUpdates) {
      void this.emailService.sendOrderStatusUpdate(order.user.email, {
        orderNumber: order.orderNumber,
        status: dto.status,
      });
    }

    return updated;
  }

  async cancelOrder(id: string, userId?: string, role?: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const isAdmin = role === UserRole.ADMIN;
    if (!isAdmin) {
      // Owner-only: an unauthenticated caller must never cancel an order.
      if (!userId || order.userId !== userId) {
        throw new ForbiddenException('Not authorized to cancel this order');
      }
    }

    if (!['PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING'].includes(order.status)) {
      throw new ConflictException(`Cannot cancel order in status: ${order.status}`);
    }

    return this.updateStatus(id, { status: 'CANCELLED', notes: reason });
  }

  async addTracking(id: string, dto: { carrier: string; trackingNumber: string; trackingUrl?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'SHIPPED' && order.status !== 'FULFILLMENT') {
      throw new ConflictException('Tracking can only be added for shipped orders');
    }

    let shipment = await this.prisma.shipment.findFirst({ where: { orderId: id } });

    if (!shipment) {
      shipment = await this.prisma.shipment.create({
        data: {
          orderId: id,
          carrier: dto.carrier,
          trackingNumber: dto.trackingNumber,
          trackingUrl: dto.trackingUrl,
          status: 'IN_TRANSIT',
          shippedAt: new Date(),
        },
      });
    } else {
      shipment = await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          carrier: dto.carrier,
          trackingNumber: dto.trackingNumber,
          trackingUrl: dto.trackingUrl,
          status: 'IN_TRANSIT',
        },
      });
    }

    // Add initial tracking event
    await this.prisma.trackingEvent.create({
      data: {
        shipment: { connect: { id: shipment.id } },
        status: 'IN_TRANSIT',
        description: `Shipped via ${dto.carrier}`,
        source: 'MANUAL',
        timestamp: new Date(),
      },
    });

    // Update order status if needed
    if (order.status === 'FULFILLMENT') {
      await this.prisma.order.update({
        where: { id },
        data: { status: 'SHIPPED', shippedAt: new Date() },
      });
    }

    return shipment;
  }

  async addTrackingEvent(shipmentId: string, dto: { status: string; location?: string; description: string; source?: string }) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    const event = await this.prisma.trackingEvent.create({
      data: {
        shipment: { connect: { id: shipmentId } },
        status: dto.status,
        location: dto.location,
        description: dto.description,
        source: dto.source ?? 'MANUAL',
        timestamp: new Date(),
      },
    });

    // Update shipment status based on event
    const statusMap: Record<string, string> = {
      'DELIVERED': 'DELIVERED',
      'OUT_FOR_DELIVERY': 'IN_TRANSIT',
      'IN_TRANSIT': 'IN_TRANSIT',
      'FAILED': 'FAILED',
      'RETURNED': 'RETURNED',
    };

    const newStatus = statusMap[dto.status] ?? shipment.status;
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: newStatus,
        ...(newStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      },
    });

    // Update order status if delivered
    if (newStatus === 'DELIVERED') {
      await this.prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
    }

    return event;
  }

  async getOrderStats(userId?: string) {
    const where = userId ? { userId } : {};

    const [totalOrders, totalRevenue, statusCounts] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where: { ...where, status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { total: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
    ]);

    return {
      totalOrders,
      totalRevenue: totalRevenue._sum.total ?? 0,
      byStatus: statusCounts.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  async getRecentOrders(limit = 10) {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
  }

  private async releaseReservedInventory(tx: Prisma.TransactionClient, orderId: string) {
    const items = await tx.orderItem.findMany({ where: { orderId } });

    for (const item of items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        include: { variants: { include: { inventory: true } }, inventory: true },
      });

      if (!product) continue;

      const variant = item.variantId
        ? product.variants.find(v => v.id === item.variantId)
        : null;

      const inventory = variant?.inventory ?? product.inventory?.[0];

      if (inventory && inventory.trackQuantity) {
        // Atomic clamped release: check + decrement are a single statement and
        // reservedQuantity can never drop below 0 (even on a double release).
        await tx.$executeRaw`
          UPDATE "inventory"
          SET "reservedQuantity" = GREATEST(0, "reservedQuantity" - ${item.quantity})
          WHERE "id" = ${inventory.id}
        `;
      }
    }
  }
}
