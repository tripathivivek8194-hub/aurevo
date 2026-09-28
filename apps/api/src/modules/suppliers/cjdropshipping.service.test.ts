import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CJDropshippingService } from './cjdropshipping.service';
import { CJDropshippingAdapter } from './adapters/cjdropshipping.adapter';
import { SuppliersService } from './suppliers.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { SupplierApiError } from './adapters/supplier-api.error';
import { SupplierApiErrorCode, SupplierProduct } from '@aurevo/shared/types';

/**
 * Phase 9 unit coverage for the CJdropshipping service (auth, import job
 * engine, inventory/shipping). Every "real success" is driven by an explicit
 * mocked adapter/prisma response — nothing is fabricated.
 */

class MockConfig {
  private values: Record<string, string> = {};
  get(key: string): string | undefined {
    const v = this.values[key];
    return v !== undefined ? v : undefined;
  }
  set(values: Record<string, string>): void {
    this.values = { ...this.values, ...values };
  }
  clear(): void {
    this.values = {};
  }
}

const suppliersServiceMock = {
  ensureCJSupplier: jest.fn().mockResolvedValue({ id: 'sup-cj' }),
  getCJConfig: jest.fn().mockResolvedValue({}),
  saveCJConfig: jest.fn().mockResolvedValue(undefined),
  clearCJAuth: jest.fn().mockResolvedValue(undefined),
};

/** In-memory job store so createImportJob → advanceJob resolves the same row. */
const jobsStore: any[] = [];

function makeJob(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    feedName: 'phone case',
    country: '',
    categoryId: 'cat-1',
    perRunLimit: 25,
    currency: 'INR',
    enrich: false,
    mode: 'update',
    status: 'PENDING',
    nextPage: 1,
    isFeedFinished: false,
    processedCount: 0,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    enrichedVariantCount: 0,
    enrichFailedCount: 0,
    failedIds: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

const prismaMock: any = {
  $transaction: jest.fn((fns: any[]) => Promise.all(fns)),
  category: { findUnique: jest.fn() },
  product: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  productImage: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  productVariant: { upsert: jest.fn().mockResolvedValue({ id: 'v' }) },
  productImportJob: {
    create: jest.fn().mockImplementation(async ({ data }: any) => {
      const job = makeJob(data);
      jobsStore.push(job);
      return Promise.resolve(job);
    }),
    findUnique: jest.fn().mockImplementation(async ({ where }: any) =>
      Promise.resolve(jobsStore.find((j) => j.id === where.id) ?? null),
    ),
    update: jest.fn().mockImplementation(async ({ where, data }: any) => {
      const idx = jobsStore.findIndex((j) => j.id === where.id);
      const merged = { ...jobsStore[idx], ...data, updatedAt: new Date() };
      if (idx >= 0) jobsStore[idx] = merged;
      return Promise.resolve(merged);
    }),
    findFirst: jest.fn(),
  },
};

/** A realistic SupplierProduct fixture returned by the mocked adapter. */
function cjProduct(overrides: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    id: '1005001',
    title: 'Phone Case',
    description: 'A durable phone case.',
    price: { amount: 9.99, currency: 'USD' },
    images: ['https://img/cj/1.jpg'],
    shipping: 'https://cjdropshipping.com/p/1005001',
    categoryName: 'Phone Cases',
    variants: [
      { id: 'SKU-A', productId: '1005001', attributes: { color: 'black' }, price: 9.99, inventory: 100 },
    ],
    ...overrides,
  };
}

let config: MockConfig;
let service: CJDropshippingService;

beforeEach(() => {
  jest.clearAllMocks();
  jobsStore.length = 0;
  config = new MockConfig();
  // The CJ API key in the (decrypted) config so buildAdapter() succeeds.
  suppliersServiceMock.getCJConfig.mockResolvedValue({
    apiKey: 'valid-key',
  });
  suppliersServiceMock.ensureCJSupplier.mockResolvedValue({ id: 'sup-cj' });
  service = new CJDropshippingService(
    prismaMock as unknown as PrismaService,
    config as unknown as ConfigService,
    suppliersServiceMock as unknown as SuppliersService,
  );
});

describe('CJDropshippingService.getStatus', () => {
  it('returns NOT_CONFIGURED when no credentials exist', async () => {
    suppliersServiceMock.getCJConfig.mockResolvedValue({});
    const res = await service.getStatus();
    expect(res.configured).toBe(false);
    expect(res.state).toBe('NOT_CONFIGURED');
    expect(res.connected).toBe(false);
    // never leaks tokens/keys
    expect(JSON.stringify(res)).not.toContain('accessToken');
    expect(JSON.stringify(res)).not.toContain('real-secret');
  });

  it('reports CONNECTED with a stored access token', async () => {
    suppliersServiceMock.getCJConfig.mockResolvedValue({
      apiKey: 'valid-key',
      accessToken: 'real-access-token-abc123',
      accessTokenExpiresAt: String(Date.now() + 100000),
    });
    const res = await service.getStatus();
    expect(res.configured).toBe(true);
    expect(res.hasAccessToken).toBe(true);
    expect(res.connected).toBe(true);
    expect(res.apiKeyMasked).toBe('vali…-key');
    // the actual token value never leaves the server
    expect(JSON.stringify(res)).not.toContain('real-access-token-abc123');
  });
});

describe('CJDropshippingService.searchProducts', () => {
  it('surfaces a NOT_AUTHORIZED error from the adapter honestly', async () => {
    jest
      .spyOn(CJDropshippingAdapter.prototype, 'searchProducts')
      .mockRejectedValue(
        new SupplierApiError(
          SupplierApiErrorCode.NOT_AUTHORIZED,
          'CJ authorization expired or revoked — re-authorize from the connection card.',
        ),
      );
    const res = await service.searchProducts({ query: 'phone case' });
    expect(res.configured).toBe(true);
    expect(res.products).toEqual([]);
    expect(res.error).toContain('re-authorize');
  });
});

describe('CJDropshippingService.createImportJob', () => {
  it('rejects a missing category with 400', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);
    await expect(
      service.createImportJob({ source: 'phone case', categoryId: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a PENDING job with defaults, without fetching', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    const searchSpy = jest.spyOn(CJDropshippingAdapter.prototype, 'searchProducts');
    const job = await service.createImportJob({ source: 'phone case', categoryId: 'cat-1' });
    expect(job.status).toBe('PENDING');
    expect(job.nextPage).toBe(1);
    expect(job.perRunLimit).toBe(25);
    expect(job.mode).toBe('update');
    expect(job.currency).toBe('INR');
    expect(searchSpy).not.toHaveBeenCalled();
  });
});

describe('CJDropshippingService.advanceJob', () => {
  it('imports one page and persists the resume cursor (Run 1 → nextPage 2)', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: 'p1' });
    jest.spyOn(CJDropshippingAdapter.prototype, 'searchProducts').mockResolvedValue({
      products: [cjProduct(), cjProduct({ id: '1005002', title: 'Gadget', price: { amount: 5, currency: 'USD' } })],
      total: 2,
      page: 1,
      limit: 25,
    });

    const created = await service.createImportJob({ source: 'phone case', categoryId: 'cat-1', perRunLimit: 25 });
    const res = await service.advanceJob(created.id);
    expect(res.status).toBe('PAUSED');
    expect(res.nextPage).toBe(2);
    expect(res.isFeedFinished).toBe(false);
    expect(res.processedCount).toBe(2);
    expect(res.importedCount).toBe(2);
    expect(prismaMock.product.create).toHaveBeenCalledTimes(2);
  });

  it('updates existing products in update mode — feed fields only', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'existing',
      basePrice: 1000,
      name: 'Admin Name',
      status: 'ACTIVE',
      categoryId: 'cat-1',
    });
    prismaMock.product.update.mockResolvedValue({ id: 'existing' });
    jest.spyOn(CJDropshippingAdapter.prototype, 'searchProducts').mockResolvedValue({
      products: [cjProduct()],
      total: 1,
      page: 1,
      limit: 25,
    });

    const created = await service.createImportJob({ source: 'phone case', categoryId: 'cat-1', mode: 'update' });
    const res = await service.advanceJob(created.id);
    expect(res.updatedCount).toBe(1);
    expect(res.importedCount).toBe(0);
    // Non-empty page → PAUSED (CJ marks COMPLETED only when a page returns 0 rows)
    expect(res.status).toBe('PAUSED');

    const upd = prismaMock.product.update.mock.calls[0][0] as any;
    expect(upd.where.id).toBe('existing');
    // Feed price is the lane cost → refreshed on update; the sell price is
    // admin-owned and NEVER clobbered (it already sits at/above the 30% floor).
    expect(upd.data.cost).toBe(95_218); // USD 9.99 → INR paise at the import snapshot rate
    expect(upd.data.basePrice).toBeUndefined();
    expect(upd.data.currency).toBe('INR');
    // admin-owned fields never overwritten
    expect(upd.data.name).toBeUndefined();
    expect(upd.data.status).toBeUndefined();
    expect(upd.data.categoryId).toBeUndefined();
    // images refreshed
    expect(prismaMock.productImage.deleteMany).toHaveBeenCalled();
    expect(prismaMock.productImage.createMany).toHaveBeenCalled();
  });

  it('skips existing products in skip mode', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue({ id: 'existing', basePrice: 1000 });
    jest.spyOn(CJDropshippingAdapter.prototype, 'searchProducts').mockResolvedValue({
      products: [cjProduct()],
      total: 1,
      page: 1,
      limit: 25,
    });

    const created = await service.createImportJob({ source: 'phone case', categoryId: 'cat-1', mode: 'skip' });
    const res = await service.advanceJob(created.id);
    expect(res.skippedCount).toBe(1);
    expect(res.importedCount).toBe(0);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('resumes from the persisted nextPage (Run 2 fetches page 2)', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: 'p1' });
    const searchSpy = jest
      .spyOn(CJDropshippingAdapter.prototype, 'searchProducts')
      .mockResolvedValue({ products: [cjProduct()], total: 40, page: 1, limit: 25 });

    const created = await service.createImportJob({ source: 'phone case', categoryId: 'cat-1', perRunLimit: 25 });
    await service.advanceJob(created.id); // page 1
    expect(searchSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));

    await service.advanceJob(created.id); // page 2
    expect(searchSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    expect(jobsStore[0].nextPage).toBe(3);
  });

  it('counts a per-product (non-auth) failure into failedIds', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    jest.spyOn(CJDropshippingAdapter.prototype, 'searchProducts').mockResolvedValue({
      products: [cjProduct()],
      total: 1,
      page: 1,
      limit: 25,
    });
    // dedup lookup throws → per-product failure, page continues
    prismaMock.product.findUnique.mockRejectedValue(new Error('boom'));

    const created = await service.createImportJob({ source: 'phone case', categoryId: 'cat-1' });
    const res = await service.advanceJob(created.id);
    expect(res.errorCount).toBe(1);
    expect(res.failedIds).toContain('1005001');
    // Non-empty page → PAUSED (page completed without aborting on per-product failure)
    expect(res.status).toBe('PAUSED');
  });

  it('marks a job FAILED on an auth error and rethrows', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    jest.spyOn(CJDropshippingAdapter.prototype, 'searchProducts').mockRejectedValue(
      new SupplierApiError(
        SupplierApiErrorCode.NOT_AUTHORIZED,
        'CJ authorization expired or revoked — re-authorize from the connection card.',
      ),
    );
    const created = await service.createImportJob({ source: 'phone case', categoryId: 'cat-1' });
    await expect(service.advanceJob(created.id)).rejects.toBeInstanceOf(SupplierApiError);
    expect(jobsStore[0].status).toBe('FAILED');
    expect(jobsStore[0].errorMessage).toContain('re-authorize');
  });

  it('returns 404 for a missing job and 409 for a completed job', async () => {
    await expect(service.advanceJob('nope')).rejects.toBeInstanceOf(NotFoundException);
    jobsStore.push(makeJob({ id: 'done', status: 'COMPLETED', nextPage: 5 }));
    await expect(service.advanceJob('done')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CJDropshippingService.cancelJob / getJob / getLatestJob', () => {
  it('cancels a PAUSED job and rejects re-cancel of a terminal job', async () => {
    jobsStore.push(makeJob({ id: 'job-c', status: 'PAUSED', nextPage: 3 }));
    const res = await service.cancelJob('job-c');
    expect(res.status).toBe('CANCELLED');
    expect(jobsStore[0].cancelledAt).toBeTruthy();
    await expect(service.cancelJob('job-c')).rejects.toBeInstanceOf(ConflictException);
  });

  it('getJob returns safe fields only — never credentials', async () => {
    jobsStore.push(makeJob({ id: 'job-g', status: 'PAUSED', nextPage: 3, processedCount: 50 }));
    const res = await service.getJob('job-g');
    expect(res.nextPage).toBe(3);
    expect(res.processedCount).toBe(50);
    expect(JSON.stringify(res)).not.toContain('apiKey');
    expect(JSON.stringify(res)).not.toContain('accessToken');
  });

  it('getLatestJob returns the most recent job or null', async () => {
    (prismaMock.productImportJob.findFirst as jest.Mock).mockResolvedValue(null);
    expect(await service.getLatestJob({ source: 'phone case', categoryId: 'cat-1' })).toBeNull();

    (prismaMock.productImportJob.findFirst as jest.Mock).mockResolvedValue(
      makeJob({ id: 'latest', status: 'PAUSED', nextPage: 3 }),
    );
    const latest = await service.getLatestJob({ source: 'phone case', categoryId: 'cat-1' });
    expect(latest?.id).toBe('latest');
    expect(latest?.nextPage).toBe(3);
  });
});
