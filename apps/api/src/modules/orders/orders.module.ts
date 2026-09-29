import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersCleanupService } from './orders-cleanup.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../../database/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersCleanupService],
  exports: [OrdersService],
})
export class OrdersModule {}
