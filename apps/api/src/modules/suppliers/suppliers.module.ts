import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { AliExpressController } from './aliexpress.controller';
import { AliExpressService } from './aliexpress.service';
import { CJDropshippingController } from './cjdropshipping.controller';
import { CJDropshippingWebhookController } from './cjdropshipping.webhook.controller';
import { CJDropshippingService } from './cjdropshipping.service';
import { SupplierStockSyncService } from './supplier-stock-sync.service';
import { SupplierStockSyncController } from './supplier-stock-sync.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    SuppliersController,
    AliExpressController,
    CJDropshippingController,
    CJDropshippingWebhookController,
    SupplierStockSyncController,
  ],
  providers: [
    SuppliersService,
    AliExpressService,
    CJDropshippingService,
    SupplierStockSyncService,
  ],
  exports: [SuppliersService, AliExpressService, CJDropshippingService, SupplierStockSyncService],
})
export class SuppliersModule {}
