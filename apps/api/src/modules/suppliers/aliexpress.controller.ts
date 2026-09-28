import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AliExpressService, AliExpressCallbackQuery } from './aliexpress.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '@aurevo/shared/types';
import {
  AliExpressConnectionStatus,
  AliExpressConnectResponse,
} from '@aurevo/shared/types';
import { ConfigureAliExpressDto } from './dto/configure-aliexpress.dto';
import {
  CreateImportJobDto,
  ImportAliExpressCatalogDto,
  JobIdParamDto,
  PreviewAliExpressCatalogQueryDto,
} from './dto/import-aliexpress-catalog.dto';

/**
 * AliExpress OAuth + connection endpoint.
 *
 * This controller is intentionally NOT guarded at the class level: the OAuth
 * callback (`GET callback`) receives a browser redirect from AliExpress with
 * no JWT, so it must be public. The admin-only endpoints are guarded per-method
 * with `JwtAuthGuard + RolesGuard + @Roles(ADMIN)`.
 */
@ApiTags('AliExpress')
@Controller('suppliers/aliexpress')
export class AliExpressController {
  constructor(private readonly aliExpressService: AliExpressService) {}

  /**
   * Build the seller-authorization URL the admin opens to start the OAuth flow.
   * Returns `{ state: 'NOT_CONFIGURED' }` (never a fake URL) when the app key,
   * secret, or a stable HTTPS callback is missing.
   */
  /**
   * Persist admin-provided AliExpress credentials (App Key, App Secret,
   * HTTPS Callback URL). The App Secret is encrypted at rest and is never
   * returned — the response is a safe status. Admin only.
   */
  @Post('config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save AliExpress credentials (Admin only)' })
  configure(@Body() dto: ConfigureAliExpressDto): Promise<AliExpressConnectionStatus> {
    return this.aliExpressService.configure(dto);
  }

  @Get('connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AliExpress seller-authorization URL (Admin only)' })
  connect(): Promise<AliExpressConnectResponse> {
    return this.aliExpressService.connect();
  }

  /**
   * Public OAuth redirect target. Validates `state`, exchanges the code
   * server-side, stores the token encrypted, then redirects the browser back
   * to the admin UI. Never exposes the secret or token to the client.
   */
  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'AliExpress OAuth callback (public)' })
  async callback(@Res() res: Response, @Query() query: AliExpressCallbackQuery) {
    const redirectTo = await this.aliExpressService.handleCallback(query);
    res.redirect(HttpStatus.FOUND, redirectTo);
  }

  /** Current connection status — safe fields only (masked key, capabilities). */
  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AliExpress connection status (Admin only)' })
  status(): Promise<AliExpressConnectionStatus> {
    return this.aliExpressService.status();
  }

  /** Verify the stored token with a real AliExpress API call (Admin only). */
  @Post('verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify AliExpress connection with a live API call (Admin only)' })
  verify() {
    return this.aliExpressService.verify();
  }

  /** Reconcile a bounded batch of active products with live supplier stock. */
  @Post('inventory/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync a cursor-based AliExpress inventory batch (Admin only)' })
  syncInventory(
    @Body() body: { limit?: number; cursor?: string; dryRun?: boolean },
  ) {
    return this.aliExpressService.syncInventoryBatch(body);
  }

  /** Revoke stored AliExpress authorization (Admin only). */
  @Post('disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect AliExpress (Admin only)' })
  disconnect() {
    return this.aliExpressService.disconnect();
  }

  /** Featured feeds available for catalog import — picker data (Admin only). */
  @Get('catalog/feeds')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List AliExpress featured feeds for catalog import (Admin only)' })
  listFeeds() {
    return this.aliExpressService.listFeeds();
  }

  /** Preview one live feed page before importing (safe fields only, Admin only). */
  @Get('catalog/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview one AliExpress feed page before importing (Admin only)' })
  previewFeed(@Query() query: PreviewAliExpressCatalogQueryDto) {
    return this.aliExpressService.previewFeed(query);
  }

  /** Import up to `limit` real AliExpress products from a feed as DRAFT (Admin only). */
  @Post('catalog/import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import real AliExpress products from a feed (Admin only)' })
  importCatalog(@Body() dto: ImportAliExpressCatalogDto) {
    return this.aliExpressService.importCatalog(dto);
  }

  // --- Resumable, job-based import -------------------------------------------------

  /** Create a new resumable import job (persists cursor + counters). Admin only. */
  @Post('catalog/jobs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a resumable AliExpress import job (Admin only)' })
  createJob(@Body() dto: CreateImportJobDto) {
    return this.aliExpressService.createImportJob(dto);
  }

  /** Advance a job by one AliExpress page (fetch + upsert, persist cursor). Admin only. */
  @Post('catalog/jobs/:id/advance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Advance an import job by one page (Admin only)' })
  advanceJob(@Param() params: JobIdParamDto) {
    return this.aliExpressService.advanceJob(params.id);
  }

  /** Most recent job for a feed+country+category. Admin only. Declared before
   *  `:id` so `latest` is not captured as an id. */
  @Get('catalog/jobs/latest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the latest import job for a feed+category (Admin only)' })
  getLatestJob(
    @Query() query: { feedName: string; country: string; categoryId: string },
  ) {
    return this.aliExpressService.getLatestJob(query);
  }

  /** Fetch one job's current state (safe fields). Admin only. */
  @Get('catalog/jobs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get an import job by id (Admin only)' })
  getJob(@Param() params: JobIdParamDto) {
    return this.aliExpressService.getJob(params.id);
  }

  /** Cancel a pending/paused import job. Admin only. */
  @Post('catalog/jobs/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel an import job (Admin only)' })
  cancelJob(@Param() params: JobIdParamDto) {
    return this.aliExpressService.cancelJob(params.id);
  }

  /** Retry the failed product ids saved on a job. Admin only. */
  @Post('catalog/jobs/:id/retry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry failed products on an import job (Admin only)' })
  retryJob(@Param() params: JobIdParamDto) {
    return this.aliExpressService.retryFailed(params.id);
  }
}
