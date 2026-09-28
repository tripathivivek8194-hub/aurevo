import { Injectable, Logger, OnModuleInit, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateShippingMethodDto } from './dto/create-shipping-method.dto';
import { UpdateShippingMethodDto } from './dto/update-shipping-method.dto';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';

@Injectable()
export class ShippingService implements OnModuleInit {
  private readonly logger = new Logger(ShippingService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * G0 guard: ensure at least one shipping method exists on startup.
   * `prisma db push` (used in Docker) skips the seed script, so a fresh
   * deploy would have an empty shipping_methods table and block every
   * checkout. This seeds a sensible default exactly once; the admin can
   * modify it via the Settings UI after first boot.
   */
  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.shippingMethod.count();
      if (count === 0) {
        await this.prisma.shippingMethod.create({
          data: {
            name: 'Standard Shipping',
            code: 'standard',
            description: 'Standard domestic shipping',
            baseCost: 0,
            estimatedDays: 5,
            currency: 'INR',
            isActive: true,
            sortOrder: 0,
          },
        });
        this.logger.log('G0 guard: seeded default shipping method');
      }
    } catch (err) {
      this.logger.warn('G0 guard: shipping_methods table not available yet (expected during first db:push)');
    }
  }

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return this.prisma.shippingMethod.findMany({
      where,
      include: {
        zones: { include: { zone: { include: { countries: true } } } },
        _count: { select: { zones: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findById(id: string) {
    const method = await this.prisma.shippingMethod.findUnique({
      where: { id },
      include: { zones: { include: { zone: { include: { countries: true } } } } },
    });

    if (!method) {
      throw new NotFoundException('Shipping method not found');
    }

    return method;
  }

  async getAvailableMethods(country?: string, subtotal?: number) {
    let methods = await this.prisma.shippingMethod.findMany({
      where: { isActive: true },
      include: { zones: { include: { zone: { include: { countries: true } } } } },
      orderBy: { sortOrder: 'asc' },
    });

    if (country) {
      methods = methods.filter(method => {
        if (method.zones.length === 0) return true; // Global method
        return method.zones.some(z =>
          z.zone.countries.some(c => c.code.toUpperCase() === country.toUpperCase())
        );
      });
    }

    if (subtotal !== undefined) {
      methods = methods.filter(method => {
        if (method.freeShippingThreshold && subtotal >= method.freeShippingThreshold) {
          return true;
        }
        if (method.minOrderAmount && subtotal < method.minOrderAmount) {
          return false;
        }
        if (method.maxOrderAmount && subtotal > method.maxOrderAmount) {
          return false;
        }
        return true;
      });
    }

    return methods.map(method => ({
      ...method,
      calculatedCost: method.baseCost, // Will be calculated properly by calculate method
    }));
  }

  async calculateShipping(dto: CalculateShippingDto) {
    const methods = await this.getAvailableMethods(dto.country, dto.subtotal);

    const results = methods.map(method => {
      let cost = method.baseCost;

      // Per item cost
      if (method.perItemCost && dto.itemCount) {
        cost += method.perItemCost * dto.itemCount;
      }

      // Weight-based cost
      if (method.perKgCost && dto.totalWeight) {
        cost += method.perKgCost * dto.totalWeight;
      }

      // Free shipping threshold
      if (method.freeShippingThreshold && dto.subtotal >= method.freeShippingThreshold) {
        cost = 0;
      }

      // Minimum/maximum order amount
      if (method.minOrderAmount && dto.subtotal < method.minOrderAmount) {
        return null; // Not available
      }
      if (method.maxOrderAmount && dto.subtotal > method.maxOrderAmount) {
        return null; // Not available
      }

      return {
        id: method.id,
        name: method.name,
        description: method.description,
        estimatedDays: method.estimatedDays,
        cost: Math.max(0, cost),
        currency: method.currency,
        freeShipping: cost === 0,
      };
    }).filter(Boolean);

    return results;
  }

  async create(dto: CreateShippingMethodDto) {
    const existing = await this.prisma.shippingMethod.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException('Shipping method with this code already exists');
    }

    return this.prisma.shippingMethod.create({
      data: {
        ...dto,
        zones: dto.zoneIds?.length
          ? { create: dto.zoneIds.map(zoneId => ({ zone: { connect: { id: zoneId } } })) }
          : undefined,
      },
      include: { zones: { include: { zone: { include: { countries: true } } } } },
    });
  }

  async update(id: string, dto: UpdateShippingMethodDto) {
    const method = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!method) {
      throw new NotFoundException('Shipping method not found');
    }

    if (dto.code && dto.code !== method.code) {
      const existing = await this.prisma.shippingMethod.findUnique({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictException('Shipping method with this code already exists');
      }
    }

    return this.prisma.shippingMethod.update({
      where: { id },
      data: {
        ...dto,
        zones: dto.zoneIds
          ? {
              deleteMany: {},
              create: dto.zoneIds.map(zoneId => ({ zone: { connect: { id: zoneId } } })),
            }
          : undefined,
      },
      include: { zones: { include: { zone: { include: { countries: true } } } } },
    });
  }

  async delete(id: string) {
    const method = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!method) {
      throw new NotFoundException('Shipping method not found');
    }

    await this.prisma.shippingMethod.delete({ where: { id } });
    return { message: 'Shipping method deleted successfully' };
  }

  async reorder(ids: string[]) {
    const updates = ids.map((id, index) =>
      this.prisma.shippingMethod.update({ where: { id }, data: { sortOrder: index } })
    );
    await Promise.all(updates);
    return { message: 'Shipping methods reordered successfully' };
  }

  // Shipping zones
  async getZones() {
    return this.prisma.shippingZone.findMany({
      include: { countries: true, methods: { include: { method: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createZone(name: string, countryCodes: string[]) {
    return this.prisma.shippingZone.create({
      data: {
        name,
        countries: { create: countryCodes.map(code => ({ code: code.toUpperCase() })) },
      },
      include: { countries: true },
    });
  }
}