import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { PrismaModule } from '../../database/prisma.module';
import { CartModule } from '../cart/cart.module';
import { ShippingModule } from '../shipping/shipping.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, CartModule, ShippingModule, EmailModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}