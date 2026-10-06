import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { AliExpressController } from './aliexpress.controller';
import { AliExpressService } from './aliexpress.service';
import { CJDropshippingController } from './cjdropshipping.controller';
import { CJDropshippingWebhookController } from './cjdropshipping.webhook.controller';
import { CJDropshippingService } from './cjdropshipping.service';
import { SupplierSyncScheduler } from './supplier-sync.scheduler';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    SuppliersController,
    AliExpressController,
    CJDropshippingController,
    CJDropshippingWebhookController,
  ],
  providers: [
    SuppliersService,
    AliExpressService,
    CJDropshippingService,
    SupplierSyncScheduler,
  ],
  exports: [
    SuppliersService,
    AliExpressService,
    CJDropshippingService,
    SupplierSyncScheduler,
  ],
})
export class SuppliersModule {}