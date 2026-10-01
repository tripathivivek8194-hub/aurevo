import { ConflictException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AliExpressService } from './aliexpress.service';
import { CJDropshippingService } from './cjdropshipping.service';

/**
 * Runs each supplier's existing inventory refresh in one controlled job. It is
 * deliberately inventory-only: neither supplier order endpoint is called.
 */
@Injectable()
export class SupplierStockSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SupplierStockSyncService.name);
  private running = false;

  constructor(
    private readonly aliExpressService: AliExpressService,
    private readonly cjService: CJDropshippingService,
    private readonly configService: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.configService.get<string>('ENABLE_SUPPLIER_SYNC') === 'false') return;

    // A deployment should leave no linked catalog rows untouched. Run the
    // catch-up asynchronously so API startup and health checks are not held
    // open for a large supplier catalog.
    setTimeout(() => {
      void this.runCatalogPass().catch((error: unknown) => {
        this.logger.error('Full supplier catalog stock sync stopped unexpectedly.', error instanceof Error ? error.stack : String(error));
      });
    }, 10_000);
  }

  async run() {
    if (this.running) {
      throw new ConflictException('A supplier stock sync is already running.');
    }

    this.running = true;
    try {
      const [aliexpress, cjdropshipping] = await Promise.allSettled([this.aliExpressService.syncInventory(), this.cjService.syncInventory()]);

      const result = {
        success: aliexpress.status === 'fulfilled' || cjdropshipping.status === 'fulfilled',
        aliexpress:
          aliexpress.status === 'fulfilled'
            ? aliexpress.value
            : {
                success: false,
                updated: 0,
                skipped: 0,
                message: 'AliExpress sync could not run.',
              },
        cjdropshipping:
          cjdropshipping.status === 'fulfilled'
            ? cjdropshipping.value
            : {
                success: false,
                updated: 0,
                skipped: 0,
                message: 'CJdropshipping sync could not run.',
              },
      };
      return result;
    } finally {
      this.running = false;
    }
  }

  /**
   * Check every linked supplier product exactly once for this pass. Each
   * adapter stamps successful and failed attempts, so unavailable products are
   * reported as unknown rather than being silently left pending or set to a
   * fabricated zero quantity.
   */
  async runCatalogPass() {
    if (this.running) {
      this.logger.log('Skipping startup catalog pass because another stock sync is running.');
      return;
    }

    this.running = true;
    const passStartedAt = new Date();
    let processed = 0;
    try {
      for (;;) {
        const [aliexpress, cjdropshipping] = await Promise.allSettled([
          this.aliExpressService.syncInventory(20, passStartedAt),
          this.cjService.syncInventory(20, passStartedAt),
        ]);

        const aliProcessed = aliexpress.status === 'fulfilled' ? aliexpress.value.processed : 0;
        const cjProcessed = cjdropshipping.status === 'fulfilled' ? cjdropshipping.value.processed : 0;
        processed += aliProcessed + cjProcessed;

        if (aliexpress.status === 'rejected') {
          this.logger.error('AliExpress catalog stock batch failed.', aliexpress.reason);
        }
        if (cjdropshipping.status === 'rejected') {
          this.logger.error('CJdropshipping catalog stock batch failed.', cjdropshipping.reason);
        }
        if (aliProcessed === 0 && cjProcessed === 0) break;

        // Give supplier rate-limit windows a moment between batches.
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      this.logger.log(`Full supplier catalog stock sync finished; checked ${processed} products.`);
    } finally {
      this.running = false;
    }
  }
}
