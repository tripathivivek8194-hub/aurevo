import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CJDropshippingService } from './cjdropshipping.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@aurevo/shared/types';
import { ConfigureCJDropshippingDto } from './dto/configure-cjdropshipping.dto';
import { CreateCJImportJobDto, JobIdParamDto, SearchCJDto } from './dto/cjdropshipping-import.dto';

/**
 * CJdropshipping connection + catalog/order endpoints.
 *
 * Every endpoint is admin-only (`JwtAuthGuard + RolesGuard + @Roles(ADMIN)`).
 * CJ has no public OAuth browser redirect (it uses server-side credentials +
 * access/refresh tokens), so the whole controller is class-guarded — unlike the
 * AliExpress controller which needs a public callback.
 *
 * NO order endpoint forwards AUREVO orders automatically. `POST orders` is a
 * guarded manual adapter test only, to be enabled deliberately after the full
 * flow is verified.
 */
@ApiTags('CJdropshipping')
@Controller('suppliers/cjdropshipping')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CJDropshippingController {
  constructor(private readonly cjService: CJDropshippingService) {}

  /** Persist admin-provided CJ credentials. Secrets encrypted at rest; safe status returned. */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save CJdropshipping credentials (Admin only)' })
  configure(@Body() dto: ConfigureCJDropshippingDto) {
    return this.cjService.configure(dto);
  }

  /** Current connection status — safe fields only (masked key, token flags, capabilities). */
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get CJdropshipping connection status (Admin only)' })
  status() {
    return this.cjService.getStatus();
  }

  /** Test the connection with a real CJ access-token call (Admin only). */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify CJdropshipping connection with a live API call (Admin only)' })
  verify() {
    return this.cjService.verify();
  }

  /** Clear stored CJ tokens (keeps credentials). Admin only. */
  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear CJ authorization (Admin only)' })
  async disconnect() {
    await this.cjService.clearAuth();
    return { success: true };
  }

  /** CJ product categories for browsing. Admin only. */
  @Get('catalog/categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List CJ product categories (Admin only)' })
  listCategories() {
    return this.cjService.listCategories();
  }

  /** Search/browse one page of the CJ catalog. Admin only. */
  @Get('catalog/search')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search the CJ catalog (Admin only)' })
  search(@Query() query: SearchCJDto) {
    return this.cjService.searchProducts(query);
  }

  // --- Resumable, job-based import -------------------------------------------

  /** Create a resumable import job over a CJ search. Admin only. */
  @Post('catalog/jobs')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a resumable CJ import job (Admin only)' })
  createJob(@Body() dto: CreateCJImportJobDto) {
    return this.cjService.createImportJob(dto);
  }

  /** Advance a job by one CJ page (fetch + upsert, persist cursor). Admin only. */
  @Post('catalog/jobs/:id/advance')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Advance a CJ import job by one page (Admin only)' })
  advanceJob(@Param() params: JobIdParamDto) {
    return this.cjService.advanceJob(params.id);
  }

  /** Most recent job for a source+category. Admin only. Declared before `:id`. */
  @Get('catalog/jobs/latest')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the latest CJ import job for a source+category (Admin only)' })
  getLatestJob(@Query() query: { source: string; categoryId: string }) {
    return this.cjService.getLatestJob(query);
  }

  /** Fetch one job's current state (safe fields). Admin only. */
  @Get('catalog/jobs/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a CJ import job by id (Admin only)' })
  getJob(@Param() params: JobIdParamDto) {
    return this.cjService.getJob(params.id);
  }

  /** Cancel a pending/paused CJ import job. Admin only. */
  @Post('catalog/jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a CJ import job (Admin only)' })
  cancelJob(@Param() params: JobIdParamDto) {
    return this.cjService.cancelJob(params.id);
  }

  // --- Inventory / shipping ---------------------------------------------------

  /** Sync inventory/price for CJ-linked products. Admin only. */
  @Post('inventory/sync')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync CJ inventory/price for mapped products (Admin only)' })
  syncInventory() {
    return this.cjService.syncInventory();
  }

  /** List CJ shipping methods (where documented). Admin only. */
  @Get('shipping/methods')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List CJ shipping methods (Admin only)' })
  shippingMethods() {
    return this.cjService.listShippingMethods();
  }

  // --- Orders (manual adapter test only — NOT auto-forwarded) ----------------

  /** Manual, admin-triggered order test. Not wired to real AUREVO order flow. */
  @Post('orders')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a CJ order (manual adapter test — not auto-forwarded)' })
  createOrder(@Body() body: any) {
    return this.cjService.createOrder(body);
  }

  @Get('orders/:id/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get CJ order status (Admin only)' })
  orderStatus(@Param('id') id: string) {
    return this.cjService.getOrderStatus(id);
  }

  @Get('orders/:id/tracking')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get CJ order tracking (Admin only)' })
  orderTracking(@Param('id') id: string) {
    return this.cjService.getTracking(id);
  }
}
