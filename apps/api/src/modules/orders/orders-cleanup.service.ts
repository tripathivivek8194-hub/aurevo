import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from './orders.service';

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class OrdersCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  onModuleInit() {
    this.logger.log(`Order cleanup started — checking every ${POLL_INTERVAL_MS / 1000}s for PAYMENT_PENDING orders older than ${STALE_THRESHOLD_MS / 1000}s`);
    this.timer = setInterval(() => {
      void this.releaseStaleOrders();
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async releaseStaleOrders(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

      const staleOrders = await this.prisma.order.findMany({
        where: {
          status: 'PAYMENT_PENDING',
          createdAt: { lt: cutoff },
        },
        select: { id: true, orderNumber: true },
      });

      if (staleOrders.length === 0) return 0;

      this.logger.log(`Releasing ${staleOrders.length} stale order(s)`);

      let released = 0;
      for (const order of staleOrders) {
        try {
          await this.ordersService.updateStatus(order.id, {
            status: 'CANCELLED',
            notes: 'Auto-cancelled: payment not received within 30 minutes',
          });
          this.logger.log(`Released order ${order.orderNumber} (${order.id})`);
          released++;
        } catch (err) {
          this.logger.warn(`Failed to release order ${order.orderNumber}: ${(err as Error).message}`);
        }
      }

      return released;
    } catch (err) {
      this.logger.warn(`Skipped order cleanup: ${(err as Error).message}`);
      return 0;
    }
  }
}
