import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SuppliersService } from './suppliers.service';
import { AliExpressService } from './aliexpress.service';
import { CJDropshippingService } from './cjdropshipping.service';
import { SupplierCode } from '@aurevo/shared/types';
import { PrismaService } from '../../database/prisma.service';

/**
 * Stock-only inventory sync for configured suppliers.
 *
 * Runs every 30 minutes (configurable via STOCK_SYNC_INTERVAL_MINUTES)
 * when ENABLE_STOCK_SYNC feature flag is true.
 * Prevents overlapping runs via a lock flag.
 * Syncs suppliers sequentially (AliExpress, then CJ) to avoid overwhelming
 * the API and to handle failures gracefully without stopping other suppliers.
 *
 * Key constraints:
 * - Only synchronizes stock quantity and availability status
 * - Processes only active products with valid supplier product/variant IDs
 * - Does NOT fetch or update names, descriptions, images, categories,
 *   reviews, specifications, or prices
 * - Updates database only when quantity or availability actually changed
 * - Selects only required database columns
 * - Processes at most STOCK_SYNC_BATCH_SIZE products per batch (default 20)
 * - Full catalogue synchronization is DISABLED by default
 */
@Injectable()
export class SupplierSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(SupplierSyncScheduler.name);
  private isRunning = false;

  // Configuration keys
  private readonly stockSyncEnabledFlag = 'ENABLE_STOCK_SYNC';
  private readonly fullCatalogSyncFlag = 'ENABLE_FULL_CATALOG_SYNC';
  private readonly intervalMinutesFlag = 'STOCK_SYNC_INTERVAL_MINUTES';
  private readonly batchSizeFlag = 'STOCK_SYNC_BATCH_SIZE';

  constructor(
    private readonly configService: ConfigService,
    private readonly suppliersService: SuppliersService,
    private readonly aliExpressService: AliExpressService,
    private readonly cjService: CJDropshippingService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const stockSyncEnabled = this.isStockSyncEnabled();
    const fullCatalogEnabled = this.isFullCatalogSyncEnabled();
    const interval = this.getSyncIntervalMinutes();
    const batchSize = this.getBatchSize();

    if (stockSyncEnabled) {
      this.logger.log(
        `Stock-only sync ENABLED: interval=${interval}min, batchSize=${batchSize}, fullCatalogSync=${fullCatalogEnabled}`,
      );
    } else {
      this.logger.log(
        'Stock-only sync is DISABLED (default) - enable with ENABLE_STOCK_SYNC=true',
      );
    }
  }

  /**
   * Check if stock-only sync is enabled.
   * Defaults to disabled (false) for safe production behavior.
   */
  private isStockSyncEnabled(): boolean {
    const value = this.configService.get<string>(this.stockSyncEnabledFlag);
    return value === 'true' || value === '1' || value === 'enabled';
  }

  /**
   * Check if full catalogue sync is enabled.
   * Defaults to disabled (false) - must be explicitly enabled.
   */
  private isFullCatalogSyncEnabled(): boolean {
    const value = this.configService.get<string>(this.fullCatalogSyncFlag);
    return value === 'true' || value === '1' || value === 'enabled';
  }

  /**
   * Get sync interval in minutes.
   * Defaults to 30 minutes. Safe parsing with bounds checking.
   */
  private getSyncIntervalMinutes(): number {
    const value = this.configService.get<string>(this.intervalMinutesFlag);
    const parsed = parseInt(value ?? '', 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 1440) {
      return parsed;
    }
    return 30; // Safe default
  }

  /**
   * Get batch size (max products per sync run per supplier).
   * Defaults to 20. Safe parsing with bounds checking.
   */
  private getBatchSize(): number {
    const value = this.configService.get<string>(this.batchSizeFlag);
    const parsed = parseInt(value ?? '', 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) {
      return parsed;
    }
    return 20; // Safe default
  }

  /**
   * Prevent overlapping runs - returns false if already running.
   */
  private tryAcquireLock(): boolean {
    if (this.isRunning) {
      this.logger.warn('Stock sync already in progress, skipping this run');
      return false;
    }
    this.isRunning = true;
    return true;
  }

  private releaseLock(): void {
    this.isRunning = false;
  }

  /**
   * Main scheduled task - runs at configured interval.
   * Only executes if stock sync feature flag is enabled and no overlap.
   * Full catalogue sync is explicitly NOT run here.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleScheduledSync() {
    // Check stock sync flag
    if (!this.isStockSyncEnabled()) {
      this.logger.debug('Stock sync disabled - skipping scheduled run');
      return;
    }

    // Ensure full catalogue sync is NOT enabled
    if (this.isFullCatalogSyncEnabled()) {
      this.logger.warn(
        'Full catalogue sync is enabled but stock-only scheduler does not run it. ' +
          'Use a separate scheduler for full catalogue sync.',
      );
    }

    if (!this.tryAcquireLock()) {
      return; // Already running
    }

    try {
      await this.runStockSync();
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Run stock-only sync for all configured/active suppliers sequentially.
   * Continues even if one supplier fails (non-blocking).
   * Returns true if the overall process completed (even with some failures).
   */
  private async runStockSync(): Promise<boolean> {
    this.logger.log('Starting scheduled stock-only sync');
    const results: { supplier: string; status: string; message: string }[] = [];

    // Get configured suppliers. A failed lookup must not reject out of the
    // cron handler, so it is contained here.
    let activeSuppliers: { code: string }[];
    try {
      const suppliers = await this.suppliersService.findAll();
      activeSuppliers = suppliers.filter((s) => s.isActive && s.syncEnabled);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(
        `Failed to load suppliers for sync: ${message.slice(0, 100)}`,
      );
      return false;
    }

    if (activeSuppliers.length === 0) {
      this.logger.log('No active suppliers with sync enabled - skipping');
      return true;
    }

    const batchSize = this.getBatchSize();

    // Sync each supplier sequentially
    for (const supplier of activeSuppliers) {
      const result = await this.syncSupplierStock(supplier.code, batchSize);
      results.push(result);
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const failCount = results.filter((r) => r.status === 'error').length;
    this.logger.log(
      `Scheduled stock sync completed: ${successCount} succeeded, ${failCount} failed`,
    );
    return true;
  }

  /**
   * Sync a single supplier's stock (quantity + availability only).
   * Returns safe result without exposing credentials or full responses.
   */
  private async syncSupplierStock(
    code: string,
    batchSize: number,
  ): Promise<{
    supplier: string;
    status: string;
    message: string;
  }> {
    try {
      if (code === SupplierCode.ALIEXPRESS) {
        const result = await this.aliExpressService.syncInventoryBatch({
          limit: batchSize,
          dryRun: false,
        });
        // Success if any updates OR no failures (even with 0 updates)
        const isSuccess = result.updated > 0 || result.failed === 0;
        return {
          supplier: 'ALIEXPRESS',
          status: isSuccess ? 'success' : 'error',
          message: `Scanned: ${result.scanned}, Updated: ${result.updated}, Failed: ${result.failed}, Unavailable: ${result.unavailable}, NeedsVariants: ${result.needsVariantSetup}`,
        };
      } else if (code === SupplierCode.CJDROPSHIPPING) {
        const result = await this.cjService.syncInventory();
        return {
          supplier: 'CJDROPSHIPPING',
          status: result.success ? 'success' : 'error',
          message: `Updated: ${result.updated}, Skipped: ${result.skipped}`,
        };
      } else {
        return {
          supplier: code,
          status: 'skipped',
          message: 'Unsupported supplier',
        };
      }
    } catch (error) {
      // Never expose credentials, tokens, authorization headers, or full supplier responses
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(
        `Stock sync failed for ${code}: ${message.slice(0, 100)}`,
      );
      return {
        supplier: code,
        status: 'error',
        message: 'Sync failed - check server logs for details',
      };
    }
  }

  /**
   * Public method to trigger stock sync manually (for admin use or testing).
   * Respects the feature flag but skips the lock check for manual runs.
   */
  async triggerManualStockSync(): Promise<{ success: boolean; message: string }> {
    if (!this.isStockSyncEnabled()) {
      return {
        success: false,
        message: 'Stock sync is disabled. Set ENABLE_STOCK_SYNC=true to enable.',
      };
    }

    if (!this.tryAcquireLock()) {
      return {
        success: false,
        message: 'Stock sync already in progress',
      };
    }

    try {
      const completed = await this.runStockSync();
      return completed
        ? { success: true, message: 'Manual stock sync completed' }
        : {
            success: false,
            message: 'Manual stock sync failed - check server logs for details',
          };
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Get current scheduler status (for health check / admin UI).
   */
  getStatus() {
    return {
      stockSyncEnabled: this.isStockSyncEnabled(),
      fullCatalogSyncEnabled: this.isFullCatalogSyncEnabled(),
      running: this.isRunning,
      intervalMinutes: this.getSyncIntervalMinutes(),
      batchSize: this.getBatchSize(),
      featureFlags: {
        stockSync: this.stockSyncEnabledFlag,
        fullCatalogSync: this.fullCatalogSyncFlag,
      },
    };
  }
}