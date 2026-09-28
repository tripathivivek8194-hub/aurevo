import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });
  }

  async onModuleInit() {
    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      // @ts-expect-error - Prisma query event typing
      this.$on('query', (e: { query: string; params: string; duration: number }) => {
        this.logger.debug(`Query: ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`);
      });
    }
    // Prisma connects on the first query. Keeping startup non-blocking means a
    // brief database/network blip cannot stop the whole storefront API from
    // accepting health checks and recovering normally.
    this.logger.log('Prisma client ready');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production');
    }
    const modelNames = [
      'user', 'refreshToken', 'address', 'category', 'product', 'productVariant',
      'productImage', 'inventory', 'supplier', 'supplierProduct', 'cart', 'cartItem',
      'order', 'orderItem', 'payment', 'shipment', 'trackingEvent', 'review',
      'wishlist', 'wishlistItem', 'shippingMethod', 'shippingZone', 'shippingZoneCountry',
      'shippingZoneMethod', 'coupon', 'auditLog', 'revokedToken'
    ];
    for (const model of modelNames) {
      if (typeof this[model]?.deleteMany === 'function') {
        await (this as any)[model].deleteMany();
      }
    }
  }
}
