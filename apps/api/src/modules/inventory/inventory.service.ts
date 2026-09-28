import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    productId?: string;
    variantId?: string;
    lowStock?: boolean;
    outOfStock?: boolean;
    supplierId?: string;
  }) {
    const { page = 1, limit = 50, productId, variantId, lowStock, outOfStock, supplierId } = params;

    const where: any = {};

    if (productId) where.productId = productId;
    if (variantId) where.variantId = variantId;
    if (supplierId) {
      where.product = { supplierId };
    }
    if (lowStock) {
      // In stock (quantity > 0) but at or below the default low-stock threshold.
      // Per-item lowStockThreshold can't be matched in a single query, so low
      // stock is defined here as 1..10 units.
      where.trackQuantity = true;
      where.quantity = { gte: 1, lte: 10 };
    }
    if (outOfStock) {
      where.trackQuantity = true;
      where.quantity = { lte: 0 };
    }

    const [inventory, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, status: true, supplierId: true, supplier: { select: { name: true } } } },
          variant: { select: { id: true, name: true, sku: true, attributes: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventory.count({ where }),
    ]);

    // Calculate available quantity for each
    const data = inventory.map(item => ({
      ...item,
      available: item.trackQuantity ? Math.max(0, item.quantity - item.reservedQuantity) : null,
      isLowStock: item.trackQuantity && item.quantity > 0 && item.quantity <= item.lowStockThreshold,
      isOutOfStock: item.trackQuantity && item.quantity <= 0,
    }));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        product: { include: { supplier: true, images: { where: { isPrimary: true }, take: 1 } } },
        variant: true,
      },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    return {
      ...inventory,
      available: inventory.trackQuantity ? Math.max(0, inventory.quantity - inventory.reservedQuantity) : null,
      isLowStock: inventory.trackQuantity && inventory.quantity > 0 && inventory.quantity <= inventory.lowStockThreshold,
      isOutOfStock: inventory.trackQuantity && inventory.quantity <= 0,
    };
  }

  async findByProduct(productId: string, variantId?: string) {
    const where: any = { productId };
    if (variantId) where.variantId = variantId;
    else where.variantId = null;

    const inventory = await this.prisma.inventory.findFirst({
      where,
      include: { product: { select: { name: true, sku: true } }, variant: { select: { name: true, sku: true } } },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    return {
      ...inventory,
      available: inventory.trackQuantity ? Math.max(0, inventory.quantity - inventory.reservedQuantity) : null,
      isLowStock: inventory.trackQuantity && inventory.quantity > 0 && inventory.quantity <= inventory.lowStockThreshold,
      isOutOfStock: inventory.trackQuantity && inventory.quantity <= 0,
    };
  }

  async update(id: string, dto: UpdateInventoryDto) {
    const inventory = await this.prisma.inventory.findUnique({ where: { id } });
    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    return this.prisma.inventory.update({
      where: { id },
      data: dto,
      include: { product: { select: { name: true, sku: true } }, variant: { select: { name: true, sku: true } } },
    });
  }

  async adjust(id: string, dto: AdjustInventoryDto) {
    const inventory = await this.prisma.inventory.findUnique({ where: { id } });
    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    if (!inventory.trackQuantity) {
      throw new BadRequestException('Cannot adjust inventory for product that does not track quantity');
    }

    const newQuantity = inventory.quantity + dto.adjustment;

    if (newQuantity < 0) {
      throw new BadRequestException('Inventory quantity cannot be negative');
    }

    const updated = await this.prisma.inventory.update({
      where: { id },
      data: { quantity: newQuantity },
      include: { product: { select: { name: true, sku: true } }, variant: { select: { name: true, sku: true } } },
    });

    // Log the adjustment
    await this.prisma.auditLog.create({
      data: {
        action: 'INVENTORY_ADJUSTMENT',
        entityType: 'Inventory',
        entityId: id,
        oldData: JSON.stringify({ quantity: inventory.quantity }),
        newData: JSON.stringify({ quantity: newQuantity, adjustment: dto.adjustment, reason: dto.reason }),
      },
    });

    return updated;
  }

  async reserve(productId: string, variantId: string | null, quantity: number) {
    const where: any = { productId };
    if (variantId) where.variantId = variantId;
    else where.variantId = null;

    const inventory = await this.prisma.inventory.findFirst({ where });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    if (!inventory.trackQuantity) {
      return { success: true, message: 'Product does not track quantity' };
    }

    const available = inventory.quantity - inventory.reservedQuantity;
    if (available < quantity) {
      throw new ConflictException(`Insufficient inventory. Available: ${available}, Requested: ${quantity}`);
    }

    return this.prisma.inventory.update({
      where: { id: inventory.id },
      data: { reservedQuantity: { increment: quantity } },
    });
  }

  async release(productId: string, variantId: string | null, quantity: number) {
    const where: any = { productId };
    if (variantId) where.variantId = variantId;
    else where.variantId = null;

    const inventory = await this.prisma.inventory.findFirst({ where });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    if (!inventory.trackQuantity) {
      return { success: true, message: 'Product does not track quantity' };
    }

    const newReserved = Math.max(0, inventory.reservedQuantity - quantity);

    return this.prisma.inventory.update({
      where: { id: inventory.id },
      data: { reservedQuantity: newReserved },
    });
  }

  async fulfill(productId: string, variantId: string | null, quantity: number) {
    const where: any = { productId };
    if (variantId) where.variantId = variantId;
    else where.variantId = null;

    const inventory = await this.prisma.inventory.findFirst({ where });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    if (!inventory.trackQuantity) {
      return { success: true, message: 'Product does not track quantity' };
    }

    if (inventory.reservedQuantity < quantity) {
      throw new ConflictException('Cannot fulfill more than reserved quantity');
    }

    return this.prisma.inventory.update({
      where: { id: inventory.id },
      data: {
        quantity: { decrement: quantity },
        reservedQuantity: { decrement: quantity },
      },
    });
  }

  async getLowStock(threshold?: number) {
    const where: any = {
      trackQuantity: true,
      quantity: { lte: threshold ?? 10 },
    };

    return this.prisma.inventory.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, status: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { quantity: 'asc' },
    });
  }

  async getOutOfStock() {
    return this.prisma.inventory.findMany({
      where: {
        trackQuantity: true,
        quantity: { lte: 0 },
      },
      include: {
        product: { select: { id: true, name: true, sku: true, status: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
    });
  }

  async getInventoryStats() {
    const [totalProducts, trackingProducts, lowStock, outOfStock, totalValue] = await Promise.all([
      this.prisma.inventory.count(),
      this.prisma.inventory.count({ where: { trackQuantity: true } }),
      this.prisma.inventory.count({
        where: { trackQuantity: true, quantity: { gt: 0, lte: 10 } },
      }),
      this.prisma.inventory.count({
        where: { trackQuantity: true, quantity: { lte: 0 } },
      }),
      this.prisma.inventory.aggregate({
        where: { trackQuantity: true },
        _sum: { quantity: true },
      }),
    ]);

    return {
      totalProducts,
      trackingProducts,
      lowStock,
      outOfStock,
      totalUnitsInStock: totalValue._sum.quantity ?? 0,
    };
  }

  async bulkUpdate(updates: { id: string; quantity?: number; lowStockThreshold?: number; trackQuantity?: boolean; allowBackorder?: boolean }[]) {
    const results = await Promise.all(
      updates.map(update =>
        this.prisma.inventory.update({
          where: { id: update.id },
          data: update,
        })
      )
    );

    return { updated: results.length, results };
  }
}