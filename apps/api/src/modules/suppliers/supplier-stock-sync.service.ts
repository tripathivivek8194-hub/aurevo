import { ConflictException, Injectable } from '@nestjs/common';
import { AliExpressService } from './aliexpress.service';
import { CJDropshippingService } from './cjdropshipping.service';

/**
 * Runs each supplier's existing inventory refresh in one controlled job. It is
 * deliberately inventory-only: neither supplier order endpoint is called.
 */
@Injectable()
export class SupplierStockSyncService {
  private running = false;

  constructor(
    private readonly aliExpressService: AliExpressService,
    private readonly cjService: CJDropshippingService,
  ) {}

  async run() {
    if (this.running) {
      throw new ConflictException('A supplier stock sync is already running.');
    }

    this.running = true;
    try {
      const [aliexpress, cjdropshipping] = await Promise.allSettled([
        this.aliExpressService.syncInventory(),
        this.cjService.syncInventory(),
      ]);

      const result = {
        success: aliexpress.status === 'fulfilled' || cjdropshipping.status === 'fulfilled',
        aliexpress:
          aliexpress.status === 'fulfilled'
            ? aliexpress.value
            : { success: false, updated: 0, skipped: 0, message: 'AliExpress sync could not run.' },
        cjdropshipping:
          cjdropshipping.status === 'fulfilled'
            ? cjdropshipping.value
            : { success: false, updated: 0, skipped: 0, message: 'CJdropshipping sync could not run.' },
      };
      return result;
    } finally {
      this.running = false;
    }
  }
}
