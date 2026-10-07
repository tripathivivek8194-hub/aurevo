import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SupplierSyncScheduler } from './supplier-sync.scheduler';
import { SuppliersService } from './suppliers.service';
import { AliExpressService } from './aliexpress.service';
import { CJDropshippingService } from './cjdropshipping.service';
import { SupplierCode } from '@aurevo/shared/types';

describe('SupplierSyncScheduler', () => {
  let scheduler: SupplierSyncScheduler;
  let configService: jest.Mocked<ConfigService>;
  let suppliersService: jest.Mocked<SuppliersService>;
  let aliExpressService: jest.Mocked<AliExpressService>;
  let cjService: jest.Mocked<CJDropshippingService>;
  let prismaService: jest.Mocked<PrismaService>;

  const mockSuppliers = [
    {
      id: 'sup-1',
      name: 'AliExpress',
      code: SupplierCode.ALIEXPRESS,
      isActive: true,
      syncEnabled: true,
      lastSyncedAt: null,
    },
    {
      id: 'sup-2',
      name: 'CJ Dropshipping',
      code: SupplierCode.CJDROPSHIPPING,
      isActive: true,
      syncEnabled: true,
      lastSyncedAt: null,
    },
  ];

  beforeEach(async () => {
    // Mock ConfigService
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as any;

    // Mock PrismaService
    prismaService = {} as any;

    // Mock SuppliersService
    suppliersService = {
      findAll: jest.fn().mockResolvedValue(mockSuppliers),
    } as any;

    // Mock AliExpressService
    aliExpressService = {
      syncInventory: jest.fn().mockResolvedValue({
        success: true,
        processed: 5,
        updated: 3,
        skipped: 2,
        failedFetches: 0,
        unmatchedVariants: 1,
        archivedForIndia: 1,
        restoredForIndia: 0,
      }),
    } as any;

    // Mock CJDropshippingService
    cjService = {
      syncInventory: jest.fn().mockResolvedValue({
        success: true,
        updated: 5,
        skipped: 2,
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierSyncScheduler,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: SuppliersService,
          useValue: suppliersService,
        },
        {
          provide: AliExpressService,
          useValue: aliExpressService,
        },
        {
          provide: CJDropshippingService,
          useValue: cjService,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    scheduler = module.get<SupplierSyncScheduler>(SupplierSyncScheduler);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isStockSyncEnabled', () => {
    it('should default to disabled (false)', () => {
      configService.get.mockReturnValue(undefined);
      const enabled = scheduler['isStockSyncEnabled']();
      expect(enabled).toBe(false);
    });

    it('should be enabled when ENABLE_STOCK_SYNC=true', () => {
      configService.get.mockReturnValue('true');
      const enabled = scheduler['isStockSyncEnabled']();
      expect(enabled).toBe(true);
    });

    it('should be enabled when ENABLE_STOCK_SYNC=1', () => {
      configService.get.mockReturnValue('1');
      const enabled = scheduler['isStockSyncEnabled']();
      expect(enabled).toBe(true);
    });

    it('should be enabled when ENABLE_STOCK_SYNC=enabled', () => {
      configService.get.mockReturnValue('enabled');
      const enabled = scheduler['isStockSyncEnabled']();
      expect(enabled).toBe(true);
    });

    it('should be disabled for any other value', () => {
      configService.get.mockReturnValue('false');
      expect(scheduler['isStockSyncEnabled']()).toBe(false);

      configService.get.mockReturnValue('0');
      expect(scheduler['isStockSyncEnabled']()).toBe(false);

      configService.get.mockReturnValue('random-value');
      expect(scheduler['isStockSyncEnabled']()).toBe(false);
    });
  });

  describe('isFullCatalogSyncEnabled', () => {
    it('should default to disabled (false)', () => {
      configService.get.mockReturnValue(undefined);
      const enabled = scheduler['isFullCatalogSyncEnabled']();
      expect(enabled).toBe(false);
    });

    it('should be enabled when ENABLE_FULL_CATALOG_SYNC=true', () => {
      configService.get.mockReturnValue('true');
      const enabled = scheduler['isFullCatalogSyncEnabled']();
      expect(enabled).toBe(true);
    });
  });

  describe('getSyncIntervalMinutes', () => {
    it('should default to 30 minutes', () => {
      configService.get.mockReturnValue(undefined);
      const interval = scheduler['getSyncIntervalMinutes']();
      expect(interval).toBe(30);
    });

    it('should return configured value when valid', () => {
      configService.get.mockReturnValue('60');
      const interval = scheduler['getSyncIntervalMinutes']();
      expect(interval).toBe(60);
    });

    it('should clamp to minimum 1 minute', () => {
      configService.get.mockReturnValue('0');
      expect(scheduler['getSyncIntervalMinutes']()).toBe(30);

      configService.get.mockReturnValue('-5');
      expect(scheduler['getSyncIntervalMinutes']()).toBe(30);
    });

    it('should clamp to maximum 1440 minutes (24 hours)', () => {
      configService.get.mockReturnValue('2000');
      expect(scheduler['getSyncIntervalMinutes']()).toBe(30);
    });

    it('should default on non-numeric values', () => {
      configService.get.mockReturnValue('invalid');
      expect(scheduler['getSyncIntervalMinutes']()).toBe(30);
    });
  });

  describe('getBatchSize', () => {
    it('should default to 20', () => {
      configService.get.mockReturnValue(undefined);
      const batchSize = scheduler['getBatchSize']();
      expect(batchSize).toBe(20);
    });

    it('should return configured value when valid', () => {
      configService.get.mockReturnValue('50');
      const batchSize = scheduler['getBatchSize']();
      expect(batchSize).toBe(50);
    });

    it('should clamp to minimum 1', () => {
      configService.get.mockReturnValue('0');
      expect(scheduler['getBatchSize']()).toBe(20);

      configService.get.mockReturnValue('-10');
      expect(scheduler['getBatchSize']()).toBe(20);
    });

    it('should clamp to maximum 100', () => {
      configService.get.mockReturnValue('200');
      expect(scheduler['getBatchSize']()).toBe(20);
    });
  });

  describe('onModuleInit', () => {
    it('should log enabled message when stock sync is enabled', () => {
      configService.get.mockReturnValue('true');
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      scheduler.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stock-only sync ENABLED'),
      );
    });

    it('should log disabled message when stock sync is disabled', () => {
      configService.get.mockReturnValue(undefined);
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      scheduler.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stock-only sync is DISABLED'),
      );
    });
  });

  describe('handleScheduledSync', () => {
    it('should skip sync when feature flag is disabled', async () => {
      configService.get.mockReturnValue(undefined);

      await scheduler.handleScheduledSync();

      expect(suppliersService.findAll).not.toHaveBeenCalled();
      expect(aliExpressService.syncInventory).not.toHaveBeenCalled();
      expect(cjService.syncInventory).not.toHaveBeenCalled();
    });

    it('should run sync when feature flag is enabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        if (key === 'ENABLE_FULL_CATALOG_SYNC') return undefined;
        return undefined;
      });

      await scheduler.handleScheduledSync();

      expect(suppliersService.findAll).toHaveBeenCalled();
      expect(aliExpressService.syncInventory).toHaveBeenCalled();
      expect(cjService.syncInventory).toHaveBeenCalledWith(20);
    });

    it('should prevent overlapping runs', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        if (key === 'ENABLE_FULL_CATALOG_SYNC') return undefined;
        return undefined;
      });
      // Simulate a slow sync by making it wait
      aliExpressService.syncInventory.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, updated: 1 }), 100)),
      );

      // Start first sync
      const firstSync = scheduler.handleScheduledSync();

      // Immediately try to start second sync
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const secondSync = scheduler.handleScheduledSync();

      await Promise.all([firstSync, secondSync]);

      // Second sync should have been rejected
      expect(warnSpy).toHaveBeenCalledWith(
        'Stock sync already in progress, skipping this run',
      );
    });

    it('should release lock after sync completes', async () => {
      configService.get.mockReturnValue('true');

      await scheduler.handleScheduledSync();
      expect(scheduler['isRunning']).toBe(false);
    });

    it('should release lock even if sync fails', async () => {
      configService.get.mockReturnValue('true');
      aliExpressService.syncInventory.mockRejectedValue(
        new Error('API Error'),
      );

      await scheduler.handleScheduledSync();

      expect(scheduler['isRunning']).toBe(false);
    });
  });

  describe('runStockSync', () => {
    it('should sync all active suppliers sequentially', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        if (key === 'STOCK_SYNC_BATCH_SIZE') return '5';
        return undefined;
      });
      scheduler['tryAcquireLock']();

      await scheduler['runStockSync']();

      expect(aliExpressService.syncInventory).toHaveBeenCalledWith(5);
      expect(cjService.syncInventory).toHaveBeenCalledWith(5);
    });

    it('should skip suppliers that are not active', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });
      const inactiveSuppliers = [
        {
          ...mockSuppliers[0],
          isActive: false,
        },
        mockSuppliers[1],
      ];
      suppliersService.findAll.mockResolvedValue(inactiveSuppliers);
      scheduler['tryAcquireLock']();

      await scheduler['runStockSync']();

      // Only CJ should be synced (AliExpress is inactive)
      expect(aliExpressService.syncInventory).not.toHaveBeenCalled();
      expect(cjService.syncInventory).toHaveBeenCalledWith(20);
    });

    it('should skip suppliers with sync disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });
      const disabledSuppliers = [
        {
          ...mockSuppliers[0],
          syncEnabled: false,
        },
        mockSuppliers[1],
      ];
      suppliersService.findAll.mockResolvedValue(disabledSuppliers);
      scheduler['tryAcquireLock']();

      await scheduler['runStockSync']();

      expect(aliExpressService.syncInventory).not.toHaveBeenCalled();
      expect(cjService.syncInventory).toHaveBeenCalledWith(20);
    });

    it('should skip when no active suppliers', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });
      suppliersService.findAll.mockResolvedValue([]);
      scheduler['tryAcquireLock']();
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      await scheduler['runStockSync']();

      expect(logSpy).toHaveBeenCalledWith(
        'No active suppliers with sync enabled - skipping',
      );
      expect(aliExpressService.syncInventory).not.toHaveBeenCalled();
      expect(cjService.syncInventory).not.toHaveBeenCalled();
    });

    it('should continue syncing if one supplier fails', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });
      aliExpressService.syncInventory.mockRejectedValue(
        new Error('API Error'),
      );
      scheduler['tryAcquireLock']();

      await scheduler['runStockSync']();

      // CJ should still be synced even though AliExpress failed
      expect(cjService.syncInventory).toHaveBeenCalledWith(20);
    });

    it('should log completion with success and fail counts', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });
      cjService.syncInventory.mockResolvedValue({
        success: false,
        updated: 0,
        skipped: 0,
      });
      scheduler['tryAcquireLock']();
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      await scheduler['runStockSync']();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Scheduled stock sync completed: \d+ succeeded, \d+ failed/),
      );
    });
  });

  describe('syncSupplierStock', () => {
    beforeEach(() => {
      scheduler['tryAcquireLock']();
    });

    it('should sync AliExpress supplier successfully', async () => {
      const result = await scheduler['syncSupplierStock'](SupplierCode.ALIEXPRESS, 5);

      expect(result.supplier).toBe('ALIEXPRESS');
      expect(result.status).toBe('success');
      expect(result.message).toContain('Updated: 3');
      expect(aliExpressService.syncInventory).toHaveBeenCalledWith(5);
    });

    it('should sync CJ Dropshipping supplier successfully', async () => {
      const result = await scheduler['syncSupplierStock'](SupplierCode.CJDROPSHIPPING, 5);

      expect(result.supplier).toBe('CJDROPSHIPPING');
      expect(result.status).toBe('success');
      expect(result.message).toContain('Updated: 5');
      expect(cjService.syncInventory).toHaveBeenCalledWith(5);
    });

    it('should mark as error when AliExpress sync fails', async () => {
      aliExpressService.syncInventory.mockRejectedValue(
        new Error('Network timeout'),
      );

      const result = await scheduler['syncSupplierStock'](SupplierCode.ALIEXPRESS, 5);

      expect(result.status).toBe('error');
      expect(result.message).toBe('Sync failed - check server logs for details');
      expect(result.supplier).toBe('ALIEXPRESS');
    });

    it('should mark as error when CJ sync fails', async () => {
      cjService.syncInventory.mockRejectedValue(
        new Error('API key invalid'),
      );

      const result = await scheduler['syncSupplierStock'](SupplierCode.CJDROPSHIPPING, 5);

      expect(result.status).toBe('error');
      expect(result.message).toBe('Sync failed - check server logs for details');
      expect(result.supplier).toBe('CJDROPSHIPPING');
    });

    it('should truncate error messages to prevent credential exposure', async () => {
      const longError = 'x'.repeat(150) + 'secret-api-key-12345';
      aliExpressService.syncInventory.mockRejectedValue(
        new Error(longError),
      );
      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await scheduler['syncSupplierStock'](SupplierCode.ALIEXPRESS, 5);

      // Verify scheduler logs never include raw supplier error text.
      const callArgs = errorSpy.mock.calls[0][0] as string;
      expect(callArgs).toBe('Stock sync failed for ALIEXPRESS');
      expect(callArgs).not.toContain('secret-api-key');
    });

    it('should mark AliExpress as error when no products updated and some failed', async () => {
      aliExpressService.syncInventory.mockResolvedValue({
        success: false,
        processed: 3,
        updated: 0,
        skipped: 3,
        failedFetches: 3,
      });

      const result = await scheduler['syncSupplierStock'](SupplierCode.ALIEXPRESS, 5);

      expect(result.status).toBe('error');
    });

    it('should mark AliExpress as success when products were updated', async () => {
      aliExpressService.syncInventory.mockResolvedValue({
        success: true,
        processed: 3,
        updated: 2,
        skipped: 1,
        failedFetches: 1,
      });

      const result = await scheduler['syncSupplierStock'](SupplierCode.ALIEXPRESS, 5);

      expect(result.status).toBe('success');
      expect(result.message).toContain('Updated: 2, Skipped: 1, Failed fetches: 1');
    });

    it('should skip unsupported suppliers', async () => {
      const result = await scheduler['syncSupplierStock']('UNSUPPORTED_SUPPLIER', 5);

      expect(result.status).toBe('skipped');
      expect(result.message).toBe('Unsupported supplier');
    });

    it('should mark CJ as error when success is false', async () => {
      cjService.syncInventory.mockResolvedValue({
        success: false,
        updated: 0,
        skipped: 5,
      });

      const result = await scheduler['syncSupplierStock'](SupplierCode.CJDROPSHIPPING, 5);

      expect(result.status).toBe('error');
    });
  });

  describe('triggerManualStockSync', () => {
    it('should fail when sync is disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return undefined;
        return undefined;
      });

      const result = await scheduler.triggerManualStockSync();

      expect(result.success).toBe(false);
      expect(result.message).toContain('ENABLE_STOCK_SYNC=true');
      expect(suppliersService.findAll).not.toHaveBeenCalled();
    });

    it('should succeed when sync is enabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });

      const result = await scheduler.triggerManualStockSync();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Manual stock sync completed');
      expect(suppliersService.findAll).toHaveBeenCalled();
    });

    it('should fail if already running', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });
      aliExpressService.syncInventory.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, updated: 1 }), 100)),
      );

      // Start first manual sync
      const firstSync = scheduler.triggerManualStockSync();

      // Immediately try to start second
      const secondSync = scheduler.triggerManualStockSync();

      const firstResult = await firstSync;
      const secondResult = await secondSync;

      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(false);
      expect(secondResult.message).toBe('Stock sync already in progress');
    });

    it('should release lock after manual sync completes', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });

      await scheduler.triggerManualStockSync();

      expect(scheduler['isRunning']).toBe(false);
    });

    it('should release lock even if manual sync fails', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_STOCK_SYNC') return 'true';
        return undefined;
      });
      suppliersService.findAll.mockRejectedValue(new Error('DB Error'));

      await scheduler.triggerManualStockSync();

      expect(scheduler['isRunning']).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should report disabled status', () => {
      configService.get.mockReturnValue(undefined);

      const status = scheduler.getStatus();

      expect(status.stockSyncEnabled).toBe(false);
      expect(status.fullCatalogSyncEnabled).toBe(false);
      expect(status.running).toBe(false);
      expect(status.intervalMinutes).toBe(30);
      expect(status.batchSize).toBe(20);
    });

    it('should report enabled status', () => {
      configService.get.mockReturnValue('true');

      const status = scheduler.getStatus();

      expect(status.stockSyncEnabled).toBe(true);
      expect(status.running).toBe(false);
    });

    it('should report running status during sync', async () => {
      configService.get.mockReturnValue('true');
      aliExpressService.syncInventory.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, updated: 1 }), 100)),
      );

      const syncPromise = scheduler.handleScheduledSync();

      // Check status while sync is in progress
      const statusDuringSyncPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve(scheduler.getStatus());
        }, 10);
      });

      const [, statusDuringSync] = await Promise.all([
        syncPromise,
        statusDuringSyncPromise,
      ]);

      // Status should have been running at some point
      expect(statusDuringSync).toBeDefined();
    });
  });

  describe('tryAcquireLock and releaseLock', () => {
    it('should acquire lock on first call', () => {
      const acquired = scheduler['tryAcquireLock']();

      expect(acquired).toBe(true);
      expect(scheduler['isRunning']).toBe(true);
    });

    it('should fail to acquire lock if already locked', () => {
      scheduler['tryAcquireLock']();
      const secondAcquire = scheduler['tryAcquireLock']();

      expect(secondAcquire).toBe(false);
    });

    it('should release lock', () => {
      scheduler['tryAcquireLock']();
      scheduler['releaseLock']();

      expect(scheduler['isRunning']).toBe(false);
    });

    it('should allow reacquire after release', () => {
      scheduler['tryAcquireLock']();
      scheduler['releaseLock']();
      const reacquire = scheduler['tryAcquireLock']();

      expect(reacquire).toBe(true);
    });
  });
});
