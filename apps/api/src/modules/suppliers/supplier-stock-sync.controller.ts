import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { SupplierStockSyncService } from './supplier-stock-sync.service';

/**
 * Endpoint for a hosted scheduler. It is not an admin-browser endpoint: access
 * requires a dedicated secret stored only by the scheduler and the API host.
 */
@Controller('internal/supplier-stock-sync')
export class SupplierStockSyncController {
  constructor(
    private readonly configService: ConfigService,
    private readonly stockSyncService: SupplierStockSyncService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  async run(@Headers('x-supplier-sync-secret') supplied?: string) {
    const expected = this.configService.get<string>('SUPPLIER_SYNC_SECRET')?.trim();
    if (!expected) {
      throw new ServiceUnavailableException('Supplier stock sync has not been configured.');
    }
    if (!supplied || supplied.length !== expected.length) {
      throw new UnauthorizedException('Invalid supplier sync credential.');
    }
    if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid supplier sync credential.');
    }
    return this.stockSyncService.run();
  }
}
