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
import { SupplierSyncScheduler } from './supplier-sync.scheduler';
import { PrismaModule } from '../../database/prisma.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [PrismaModule, ProductsModule],
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
    SupplierSyncScheduler,
  ],
  exports: [
    SuppliersService,
    AliExpressService,
    CJDropshippingService,
    SupplierStockSyncService,
    SupplierSyncScheduler,
  ],
})
export class SuppliersModule {}
