import axios from 'axios';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AliExpressService } from './aliexpress.service';
import { AliExpressAdapter } from './adapters/aliexpress.adapter';
import { SuppliersService } from './suppliers.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import {
  SupplierCapabilityStatus,
  SupplierConnectionState,
} from '@aurevo/shared/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Phase 8 unit coverage for the AliExpress OAuth service.
 *
 * Every "real success" assert below is driven by an explicit mocked external
 * response — nothing is fabricated. The NOT_CONFIGURED / NOT_AUTHORIZED paths
 * are the same ones the app returns when no env is configured, so they match
 * what an actual fresh deployment reports.
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
  getAliExpressConfig: jest.fn().mockResolvedValue({}),
  saveAliExpressConfig: jest.fn().mockResolvedValue(undefined),
  clearAliExpressAuth: jest.fn().mockResolvedValue(undefined),
  ensureAliExpressSupplier: jest.fn().mockResolvedValue({ id: 'sup-ali' }),
};

/** In-memory job store so createImportJob → advanceJob resolves the same row. */
const jobsStore: any[] = [];

/** Mocked Prisma for the catalog-import path (products/categories/jobs). */
const prismaMock = {
  category: { findUnique: jest.fn() },
  product: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  inventory: { update: jest.fn(), create: jest.fn() },
  productImage: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  productImportJob: {
    create: jest.fn().mockImplementation(({ data }: any) => {
      const job = {
        id: 'job-1',
        ...data,
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
      };
      jobsStore.push(job);
      return Promise.resolve(job);
    }),
    findUnique: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(jobsStore.find((j) => j.id === where.id) ?? null),
    ),
    update: jest.fn().mockImplementation(({ where, data }: any) => {
      const idx = jobsStore.findIndex((j) => j.id === where.id);
      const merged = { ...jobsStore[idx], ...data, updatedAt: new Date() };
      if (idx >= 0) jobsStore[idx] = merged;
      return Promise.resolve(merged);
    }),
    findFirst: jest.fn(),
  },
};

let config: MockConfig;
let service: AliExpressService;

beforeEach(() => {
  jest.clearAllMocks();
  jobsStore.length = 0;
  mockedAxios.post.mockReset();
  config = new MockConfig();
  // Default placeholder-free HTTPS callback so reads of it succeed.
  suppliersServiceMock.getAliExpressConfig.mockResolvedValue({});
  service = new AliExpressService(
    suppliersServiceMock as unknown as SuppliersService,
    config as unknown as ConfigService,
    prismaMock as unknown as PrismaService,
  );
});

const READY_ENV = {
  ALIEXPRESS_APP_KEY: 'valid-key',
  ALIEXPRESS_APP_SECRET: 'real-secret-not-placeholder',
  ALIEXPRESS_CALLBACK_URL: 'https://shop.example.com/api/suppliers/aliexpress/callback',
};

describe('AliExpressService.connect', () => {
  it('returns NOT_CONFIGURED when the app key is missing', async () => {
    config.clear();
    const res = await service.connect();
    expect(res.state).toBe('NOT_CONFIGURED');
    expect(res.authorizationUrl).toBeUndefined();
  });

  it('returns NOT_CONFIGURED when the callback URL is not stable HTTPS', async () => {
    config.set({
      ALIEXPRESS_APP_KEY: 'valid-key',
      ALIEXPRESS_APP_SECRET: 'real-secret-not-placeholder',
      ALIEXPRESS_CALLBACK_URL: 'http://insecure.example.com/callback',
    });
    const res = await service.connect();
    expect(res.state).toBe('NOT_CONFIGURED');
  });

  it('never emits a URL when the app secret is a placeholder', async () => {
    config.set({ ...READY_ENV, ALIEXPRESS_APP_SECRET: 'your_placeholder_secret' });
    const res = await service.connect();
    expect(res.state).toBe('NOT_CONFIGURED');
  });

  it('builds a READY authorization URL with client_id, redirect_uri and a state', async () => {
    config.set(READY_ENV);
    const res = await service.connect();
    expect(res.state).toBe('READY');
    expect(res.authorizationUrl).toBeDefined();

    const url = new URL(res.authorizationUrl as string);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(READY_ENV.ALIEXPRESS_APP_KEY);
    expect(url.searchParams.get('redirect_uri')).toBe(READY_ENV.ALIEXPRESS_CALLBACK_URL);
    expect(url.searchParams.get('state')).toBeTruthy();
  });
});

describe('AliExpressService.handleCallback', () => {
  it('redirects to the admin UI with denied when AliExpress reports an error', async () => {
    config.set(READY_ENV);
    const to = await service.handleCallback({ error: 'access_denied' });
    expect(to).toContain('/admin/suppliers?aliexpress=denied');
  });

  it('rejects an unknown / expired state', async () => {
    config.set(READY_ENV);
    const to = await service.handleCallback({ state: 'forged-state', code: 'code' });
    expect(to).toContain('aliexpress=error');
    expect(to).toContain('invalid_state');
  });

  it('exchanges a valid code and stores the token encrypted on success', async () => {
    config.set(READY_ENV);
    const connect = await service.connect();
    const state = new URL(connect.authorizationUrl as string).searchParams.get('state') as string;

    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: {
        access_token: 'access-token-value',
        refresh_token: 'refresh-token-value',
        expires_in: 3600,
      },
    });

    const to = await service.handleCallback({ state, code: 'single-use-code' });
    expect(to).toContain('aliexpress=connected');

    expect(suppliersServiceMock.saveAliExpressConfig).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-token-value' }),
    );
  });

  it('flags the token as unverified right after a fresh exchange', async () => {
    config.set(READY_ENV);
    const connect = await service.connect();
    const state = new URL(connect.authorizationUrl as string).searchParams.get('state') as string;
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { access_token: 'tok', expires_in: 3600 },
    });
    await service.handleCallback({ state, code: 'code' });

    const save = suppliersServiceMock.saveAliExpressConfig.mock.calls[0][0];
    expect(save.verified).toBe(false);
  });

  it('handles a failed token exchange with a safe error (no secret leakage)', async () => {
    config.set(READY_ENV);
    const connect = await service.connect();
    const state = new URL(connect.authorizationUrl as string).searchParams.get('state') as string;

    mockedAxios.post.mockRejectedValue({
      response: { status: 401, data: { error: 'bad client secret' } },
    });

    const to = await service.handleCallback({ state, code: 'code' });
    expect(to).toContain('aliexpress=error');
    // The secret/token never appears in the redirect target.
    expect(to).not.toContain('secret');
    expect(to).not.toContain('access-token-value');
  });

  it('exchanges via the signed IOP token path (not /oauth/token, not system.oauth2.getToken)', async () => {
    config.set(READY_ENV);
    const connect = await service.connect();
    const state = new URL(connect.authorizationUrl as string).searchParams.get('state') as string;

    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { access_token: 'gw-token', expires_in: 7200 },
    });

    await service.handleCallback({ state, code: 'auth-code-123' });

    // The single axios.post call must target …/rest/auth/token/create (IOP token path).
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://api-sg.aliexpress.com/rest/auth/token/create');
    expect(opts?.headers?.['Content-Type']).toContain('application/x-www-form-urlencoded');

    const form = new URLSearchParams(body as string);
    expect(form.get('code')).toBe('auth-code-123');
    expect(form.get('app_key')).toBe('valid-key');
    expect(form.get('sign_method')).toBe('sha256');
    expect(form.get('timestamp')).toMatch(/^\d{13}$/);

    // The signature must be the IOP algorithm over the exact unsigned params.
    const sign = form.get('sign') as string;
    expect(sign).toMatch(/^[A-F0-9]{64}$/);
    const expected = AliExpressAdapter.generateIopSignature(
      READY_ENV.ALIEXPRESS_APP_SECRET,
      '/auth/token/create',
      {
        app_key: 'valid-key',
        sign_method: 'sha256',
        timestamp: form.get('timestamp') as string,
        code: 'auth-code-123',
      },
    );
    expect(sign).toBe(expected);
  });

  it('stores the token parsed from a nested `result` envelope', async () => {
    config.set(READY_ENV);
    const connect = await service.connect();
    const state = new URL(connect.authorizationUrl as string).searchParams.get('state') as string;

    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { result: { access_token: 'result-token', refresh_token: 'result-refresh', expires_in: 3600 } },
    });

    await service.handleCallback({ state, code: 'code' });
    expect(suppliersServiceMock.saveAliExpressConfig).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'result-token' }),
    );
  });

  it('rejects a {code,message} gateway error envelope (e.g. InvalidCode) safely', async () => {
    config.set(READY_ENV);
    const connect = await service.connect();
    const state = new URL(connect.authorizationUrl as string).searchParams.get('state') as string;

    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { code: 'InvalidCode', message: 'Invalid authorization code' },
    });

    const to = await service.handleCallback({ state, code: 'bad-code' });
    expect(to).toContain('aliexpress=error');
    expect(to).not.toContain('bad-code');
    expect(to).not.toContain(READY_ENV.ALIEXPRESS_APP_SECRET);
  });

  it('rejects a gateway error_response returned as HTTP 200', async () => {
    config.set(READY_ENV);
    const connect = await service.connect();
    const state = new URL(connect.authorizationUrl as string).searchParams.get('state') as string;

    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { error_response: { code: 21, msg: 'Invalid code' } },
    });

    const to = await service.handleCallback({ state, code: 'bad-code' });
    expect(to).toContain('aliexpress=error');
    // No secret or code leaked in the redirect.
    expect(to).not.toContain('bad-code');
  });
});

describe('AliExpressService.status', () => {
  it('reports NOT_CONFIGURED with all capabilities NOT_CONFIGURED when unconfigured', async () => {
    config.clear();
    const res = await service.status();
    expect(res.state).toBe('NOT_CONFIGURED');
    expect(res.connected).toBe(false);
    expect(res.capabilities.length).toBeGreaterThan(0);
    for (const cap of res.capabilities) {
      expect(cap.status).toBe(SupplierCapabilityStatus.NOT_CONFIGURED);
    }
  });

  it('masks the app key and reports NOT_AUTHORIZED capabilities with no token', async () => {
    config.set(READY_ENV);
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue({});
    const res = await service.status();
    expect(res.state).toBe('DISCONNECTED');
    expect(res.appKeyMasked).toBeDefined();
    expect(res.appKeyMasked).not.toBe(READY_ENV.ALIEXPRESS_APP_KEY);
    expect(res.hasAccessToken).toBe(false);
    for (const cap of res.capabilities) {
      expect(cap.status).toBe(SupplierCapabilityStatus.NOT_AUTHORIZED);
    }
  });

  it('reports CONNECTED and SUPPORTED capabilities once verified', async () => {
    config.set(READY_ENV);
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue({
      accessToken: 'tok',
      verified: true,
      lastVerifiedAt: '2026-08-30T00:00:00.000Z',
    });
    const res = await service.status();
    expect(res.state).toBe('CONNECTED');
    expect(res.connected).toBe(true);
    expect(res.lastVerifiedAt).toBe('2026-08-30T00:00:00.000Z');
    for (const cap of res.capabilities) {
      expect(cap.status).toBe(SupplierCapabilityStatus.SUPPORTED);
    }
  });

  it('never exposes the raw token in status output', async () => {
    config.set(READY_ENV);
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue({
      accessToken: 'super-secret-token',
      verified: true,
    });
    const res = (await service.status()) as any;
    expect(JSON.stringify(res)).not.toContain('super-secret-token');
  });
});

describe('AliExpressService.verify & disconnect', () => {
  it('short-circuits verify with a safe message when not configured', async () => {
    config.clear();
    const res = await service.verify();
    expect(res.success).toBe(false);
  });

  it('disconnect clears stored authorization', async () => {
    const res = await service.disconnect();
    expect(res.success).toBe(true);
    expect(suppliersServiceMock.clearAliExpressAuth).toHaveBeenCalled();
  });
});

describe('AliExpressService.configure (Phase 8 config UX)', () => {
  const VALID = {
    appKey: 'abc123appkey',
    appSecret: 'a-real-app-secret-value-12345678',
    callbackUrl: 'https://shop.example.com/api/suppliers/aliexpress/callback',
  };

  it('persists credentials (encrypted) and resets verification to unverified', async () => {
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue({});
    await service.configure(VALID);
    const saved = suppliersServiceMock.saveAliExpressConfig.mock.calls[0][0];
    expect(saved).toMatchObject({
      appKey: VALID.appKey,
      appSecret: VALID.appSecret,
      callbackUrl: VALID.callbackUrl,
      verified: false,
      lastVerifiedAt: null,
    });
  });

  it('shows CONFIGURED / UNVERIFIED (DISCONNECTED, never CONNECTED) after saving', async () => {
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue({});
    await service.configure(VALID);
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue(VALID); // simulate persistence
    const status = await service.status();
    expect(status.state).toBe('DISCONNECTED');
    expect(status.connected).toBe(false);
    expect(status.appKeyMasked).toBeDefined();
    for (const cap of status.capabilities) {
      expect(cap.status).toBe(SupplierCapabilityStatus.NOT_AUTHORIZED);
    }
  });

  it('never returns the App Secret in the post-config status', async () => {
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue({});
    await service.configure(VALID);
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue({
      ...VALID,
      accessToken: 'tok',
      verified: true,
    });
    const status = (await service.status()) as any;
    expect(JSON.stringify(status)).not.toContain(VALID.appSecret);
  });

  it('rejects a placeholder App Key', async () => {
    await expect(service.configure({ appKey: 'dev_placeholder_key' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a too-short App Secret', async () => {
    await expect(service.configure({ appSecret: 'short' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an http (non-HTTPS) callback URL', async () => {
    await expect(
      service.configure({
        callbackUrl: 'http://shop.example.com/api/suppliers/aliexpress/callback',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a localhost HTTPS callback URL', async () => {
    await expect(
      service.configure({
        callbackUrl: 'https://localhost:3000/api/suppliers/aliexpress/callback',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a callback URL not terminating at the exact path', async () => {
    await expect(
      service.configure({ callbackUrl: 'https://shop.example.com/callback/other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears the stored token when the App Key changes', async () => {
    await service.configure({ appKey: 'brand-new-key-1234' });
    expect(suppliersServiceMock.clearAliExpressAuth).toHaveBeenCalled();
  });

  it('rejects an empty update', async () => {
    await expect(service.configure({})).rejects.toBeInstanceOf(BadRequestException);
  });
});

/** Build the live DS feed response envelope used across import tests. */
function feedEnvelope(products: any[], isFinished = true) {
  return {
    aliexpress_ds_recommend_feed_get_response: {
      resp_result: { resp_code: 200, resp_msg: 'Call succeeds' },
      result: {
        total_record_count: products.length,
        current_record_count: products.length,
        is_finished: isFinished,
        products: { product: products },
      },
    },
  };
}

describe('AliExpressService catalog import (DS feed)', () => {
  const STORED = {
    appKey: 'valid-key',
    appSecret: 'real-secret-not-placeholder',
    accessToken: 'tok',
    verified: true,
  };
  /** 30% margin floor over the $19.99 lane cost → 1999 paise / 0.7. */
  const AE_FLOOR_1999 = Math.ceil(1999 / 0.7); // 2856

  beforeEach(() => {
    config.set(READY_ENV);
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue(STORED);
  });

  it('listFeeds reports configured:false honestly when not authorized', async () => {
    config.clear();
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue({});
    const res = await service.listFeeds();
    expect(res.configured).toBe(false);
    expect(res.feeds).toEqual([]);
    expect(res.error).toBeTruthy();
  });

  it('listFeeds returns real feeds from aliexpress.ds.feedname.get', async () => {
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: {
        aliexpress_ds_feedname_get_response: {
          resp_result: { result: { promos: { promo: [{ promo_name: 'F_AEB', product_num: 999 }] } }, resp_code: 200 },
        },
      },
    });
    const res = await service.listFeeds();
    expect(res.configured).toBe(true);
    expect(res.feeds[0]).toMatchObject({ feedName: 'F_AEB', productNum: 999 });
  });

  it('previewFeed surfaces a live page of safe product fields', async () => {
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: feedEnvelope([{ product_id: 'p1', product_title: 'Widget', sale_price: { amount: 12.5, currencyCode: 'USD' } }]),
    });
    const res = await service.previewFeed({ feedName: 'F', country: 'BR', page: 1, pageSize: 5 });
    expect(res.error).toBeUndefined();
    expect(res.totalRecordCount).toBe(1);
    expect(res.products[0].title).toBe('Widget');
  });

  it('importCatalog rejects a missing category with 400', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);
    await expect(
      service.importCatalog({ feedName: 'F', country: 'BR', categoryId: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('imports feed products as DRAFT, linked to the supplier and category', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: 'prod-1' });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: feedEnvelope([
        { product_id: '1005001', product_title: 'Widget', product_main_image_url: 'https://img/1.jpg', sale_price: { amount: 19.99, currencyCode: 'USD' }, first_level_category_name: 'Home' },
        { product_id: '1005002', product_title: 'Gadget', product_image: ['https://img/a.jpg'], sale_price: { amount: 5.5, currencyCode: 'USD' } },
      ]),
    });

    const res = await service.importCatalog({ feedName: 'F', country: 'BR', categoryId: 'cat-1', limit: 25 });

    expect(res.imported).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.feedName).toBe('F');
    expect(prismaMock.product.create).toHaveBeenCalledTimes(2);

    const firstArgs = prismaMock.product.create.mock.calls[0][0] as any;
    expect(firstArgs.data).toMatchObject({
      status: 'DRAFT',
      supplierId: 'sup-ali',
      supplierProductId: '1005001',
      sku: 'AE-1005001',
      slug: 'ae-1005001',
      categoryId: 'cat-1',
      // Feed price is the lane cost; sell price starts at the 30% floor
      // (ceil(1999 / 0.7) = 2856) so an admin-ACTIVATED product never needs
      // repricing.
      cost: 1999,
      basePrice: AE_FLOOR_1999,
      currency: 'USD',
    });
    expect(firstArgs.data.images).toEqual({ create: [expect.objectContaining({ url: 'https://img/1.jpg', isPrimary: true })] });
    expect(firstArgs.data.metadata).toContain('1005001');
  });

  it('skips already-imported products (idempotent re-run)', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue({ id: 'existing' });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: feedEnvelope([{ product_id: '1005001', product_title: 'Widget', sale_price: { amount: 19.99 } }]),
    });

    const res = await service.importCatalog({ feedName: 'F', country: 'BR', categoryId: 'cat-1', limit: 25 });
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('backfills SKU variants from aliexpress.ds.product.get when enrich=true', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: 'prod-1' });
    mockedAxios.post
      .mockResolvedValueOnce({
        status: 200,
        data: feedEnvelope([{ product_id: '1005001', product_title: 'Widget', product_main_image_url: 'https://img/1.jpg', sale_price: { amount: 19.99 } }]),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          aliexpress_ds_product_get_response: {
            resp_result: { resp_code: 200 },
            result: {
              product: {
                product_id: '1005001',
                product_title: 'Widget',
                product_desc: 'A detailed description',
                ae_item_sku_info_dtos: [
                  { sku_id: 'a1', sku_price: { amount: 19.99, currencyCode: 'USD' }, sku_available_stock: 42 },
                ],
              },
            },
          },
        },
      });

    const res = await service.importCatalog({ feedName: 'F', country: 'BR', categoryId: 'cat-1', limit: 25, enrich: true });
    expect(res.imported).toBe(1);
    expect(res.enrichedVariants).toBe(1);

    const data = (prismaMock.product.create.mock.calls[0][0] as any).data;
    expect(data.description).toBe('A detailed description');
    expect(data.variants).toEqual({
      create: [expect.objectContaining({ sku: 'AE-1005001-Va1', price: 12_000, attributes: '{}' })],
    });
  });

  it('surfaces API failures safely in preview (no secret/params leaked)', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200, data: { error_response: { code: 400, msg: 'InsufficientPermission' } } });
    const res = await service.previewFeed({ feedName: 'F', country: 'BR', page: 1, pageSize: 5 });
    expect(res.products).toEqual([]);
    expect(res.error).toContain('InsufficientPermission');
    expect(JSON.stringify(res)).not.toContain('real-secret');
    expect(JSON.stringify(res)).not.toContain('accessToken');
  });
});

describe('AliExpressService import job engine', () => {
  const STORED = {
    appKey: 'valid-key',
    appSecret: 'real-secret-not-placeholder',
    accessToken: 'tok',
    verified: true,
  };

  beforeEach(() => {
    config.set(READY_ENV);
    suppliersServiceMock.getAliExpressConfig.mockResolvedValue(STORED);
  });

  it('createImportJob rejects a missing category with 400', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);
    await expect(
      service.createImportJob({ feedName: 'F', country: 'BR', categoryId: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createImportJob persists a PENDING job with defaults, without fetching', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    const job = await service.createImportJob({ feedName: 'F', country: 'BR', categoryId: 'cat-1' });
    expect(job.status).toBe('PENDING');
    expect(job.nextPage).toBe(1);
    expect(job.perRunLimit).toBe(25);
    expect(job.mode).toBe('update');
    expect(job.currency).toBe('INR');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('advanceJob imports one page and persists the resume cursor (Run 1 → nextPage 2)', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: 'p' });
    const created = await service.createImportJob({
      feedName: 'F',
      country: 'BR',
      categoryId: 'cat-1',
      perRunLimit: 25,
    });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: feedEnvelope(
        [
          { product_id: '1005001', product_title: 'Widget', product_main_image_url: 'https://img/1.jpg', sale_price: { amount: 10, currencyCode: 'USD' } },
          { product_id: '1005002', product_title: 'Gadget', sale_price: { amount: 5, currencyCode: 'USD' } },
        ],
        false,
      ),
    });

    const res = await service.advanceJob(created.id);
    expect(res.status).toBe('PAUSED');
    expect(res.nextPage).toBe(2);
    expect(res.isFeedFinished).toBe(false);
    expect(res.processedCount).toBe(2);
    expect(res.importedCount).toBe(2);
  });

  it('advanceJob updates existing products in update mode — feed fields only', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue({ id: 'existing', basePrice: 1000, name: 'Admin Name', status: 'ACTIVE', categoryId: 'cat-1' });
    prismaMock.product.update.mockResolvedValue({ id: 'existing' });
    const created = await service.createImportJob({
      feedName: 'F',
      country: 'BR',
      categoryId: 'cat-1',
      mode: 'update',
    });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: feedEnvelope(
        [{ product_id: '1005001', product_title: 'Widget', product_main_image_url: 'https://img/new.jpg', sale_price: { amount: 15, currencyCode: 'USD' } }],
        true,
      ),
    });

    const res = await service.advanceJob(created.id);
    expect(res.updatedCount).toBe(1);
    expect(res.importedCount).toBe(0);
    expect(res.status).toBe('COMPLETED');

    const upd = prismaMock.product.update.mock.calls[0][0] as any;
    expect(upd.where.id).toBe('existing');
    expect(upd.data.basePrice).toBe(1500);
    expect(upd.data.currency).toBe('USD');
    // admin-owned fields are never overwritten
    expect(upd.data.name).toBeUndefined();
    expect(upd.data.status).toBeUndefined();
    expect(upd.data.categoryId).toBeUndefined();
    // images refreshed
    expect(prismaMock.productImage.deleteMany).toHaveBeenCalled();
    expect(prismaMock.productImage.createMany).toHaveBeenCalled();
  });

  it('advanceJob skips existing products in skip mode', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue({ id: 'existing' });
    const created = await service.createImportJob({
      feedName: 'F',
      country: 'BR',
      categoryId: 'cat-1',
      mode: 'skip',
    });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: feedEnvelope([{ product_id: '1005001', product_title: 'W', sale_price: { amount: 1, currencyCode: 'USD' } }], true),
    });

    const res = await service.advanceJob(created.id);
    expect(res.skippedCount).toBe(1);
    expect(res.importedCount).toBe(0);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('advanceJob counts a per-product (non-auth) failure into failedIds', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    // product.findUnique returns null, but create throws a unique violation to
    // simulate a row that collides only at write time.
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockRejectedValue(new Error('disk full'));
    const created = await service.createImportJob({ feedName: 'F', country: 'BR', categoryId: 'cat-1' });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: feedEnvelope([{ product_id: '1005001', product_title: 'W', sale_price: { amount: 1, currencyCode: 'USD' } }], true),
    });

    const res = await service.advanceJob(created.id);
    expect(res.errorCount).toBe(1);
    expect(res.failedIds).toEqual(['1005001']);
    // job is not marked failed — transient failures are retryable
    expect(res.status).toBe('COMPLETED');
  });

  it('cancelJob marks a paused job cancelled; further advance → 409', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: 'p' });
    const created = await service.createImportJob({ feedName: 'F', country: 'BR', categoryId: 'cat-1' });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: feedEnvelope([{ product_id: '1', product_title: 'W', sale_price: { amount: 1, currencyCode: 'USD' } }], false),
    });
    const paused = await service.advanceJob(created.id);
    expect(paused.status).toBe('PAUSED');

    const cancelled = await service.cancelJob(created.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).not.toBeNull();
    await expect(service.advanceJob(created.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('advanceJob rejects a completed job with 409', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    const created = await service.createImportJob({ feedName: 'F', country: 'BR', categoryId: 'cat-1' });
    mockedAxios.post.mockResolvedValue({ status: 200, data: feedEnvelope([], true) });
    const done = await service.advanceJob(created.id);
    expect(done.status).toBe('COMPLETED');
    await expect(service.advanceJob(created.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('retryFailed re-fetches a failed id via ds.product.get and clears it', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: 'p' });
    // Seed a job that already recorded one failed product id.
    jobsStore.push({
      id: 'job-retry',
      feedName: 'F',
      country: 'BR',
      categoryId: 'cat-1',
      perRunLimit: 25,
      currency: 'INR',
      enrich: false,
      mode: 'update',
      status: 'PAUSED',
      nextPage: 2,
      isFeedFinished: false,
      processedCount: 1,
      importedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      enrichedVariantCount: 0,
      enrichFailedCount: 0,
      failedIds: JSON.stringify(['1005001']),
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
    });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: {
        aliexpress_ds_product_get_response: {
          resp_result: { resp_code: 200 },
          result: {
            product: {
              product_id: '1005001',
              product_title: 'Recovered Widget',
              product_desc: 'Recovered',
              product_main_image_url: 'https://img/recovered.jpg',
              sale_price: { amount: 9.99, currencyCode: 'USD' },
            },
          },
        },
      },
    });

    const res = await service.retryFailed('job-retry');
    expect(res.errorCount).toBe(0);
    expect(res.importedCount).toBe(1);
    expect(res.failedIds).toEqual([]);
  });

  it('getLatestJob returns the most recent job or null', async () => {
    (prismaMock.productImportJob.findFirst as jest.Mock).mockResolvedValue(null);
    expect(await service.getLatestJob({ feedName: 'F', country: 'BR', categoryId: 'cat-1' })).toBeNull();

    prismaMock.productImportJob.create.mockImplementation(async ({ data }: any) => {
      const job = { id: 'latest-1', ...data, status: 'PAUSED', nextPage: 3, isFeedFinished: false, processedCount: 50, importedCount: 50, updatedCount: 0, skippedCount: 0, errorCount: 0, enrichedVariantCount: 0, enrichFailedCount: 0, failedIds: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date(), startedAt: null, completedAt: null, cancelledAt: null };
      jobsStore.push(job);
      return Promise.resolve(job);
    });
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    await service.createImportJob({ feedName: 'F', country: 'BR', categoryId: 'cat-1' });
    (prismaMock.productImportJob.findFirst as jest.Mock).mockResolvedValue(jobsStore[0]);

    const latest = await service.getLatestJob({ feedName: 'F', country: 'BR', categoryId: 'cat-1' });
    expect(latest?.id).toBe('latest-1');
    expect(latest?.nextPage).toBe(3);
    // safe fields only — never credentials
    expect(JSON.stringify(latest)).not.toContain('secret');
    expect(JSON.stringify(latest)).not.toContain('accessToken');
  });

  it('inventory dry-run flags multi-SKU products without changing sellable quantity', async () => {
    const getProductDetail = jest.fn().mockResolvedValue({
      skus: [{ sku_stock: 4 }, { sku_stock: 6 }],
    });
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        supplierProductId: 'ae-1',
        metadata: JSON.stringify({ country: 'US' }),
        variants: [],
        inventory: [{ id: 'inv-1' }],
      },
    ]);
    (service as any).buildAdapter = jest.fn().mockResolvedValue({ getProductDetail });

    const result = await service.syncInventoryBatch({ limit: 1, dryRun: true });

    expect(result.needsVariantSetup).toBe(1);
    expect(result.items[0]).toMatchObject({
      outcome: 'NEEDS_VARIANTS',
      skuCount: 2,
      supplierStock: 10,
    });
    expect(getProductDetail).toHaveBeenCalledWith(
      'ae-1',
      'IN',
      expect.objectContaining({ targetCurrency: 'INR' }),
    );
    expect(prismaMock.inventory.update).not.toHaveBeenCalled();
  });

  it('inventory live sync updates a single-SKU product', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'p2',
        supplierProductId: 'ae-2',
        metadata: '{}',
        variants: [],
        inventory: [{ id: 'inv-2' }],
      },
    ]);
    (service as any).buildAdapter = jest.fn().mockResolvedValue({
      getProductDetail: jest.fn().mockResolvedValue({ skus: [{ sku_stock: 17 }] }),
    });

    const result = await service.syncInventoryBatch({ limit: 1, dryRun: false });

    expect(result.updated).toBe(1);
    expect(prismaMock.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-2' },
        data: expect.objectContaining({
          quantity: 17,
          supplierStock: 17,
          trackQuantity: true,
          allowBackorder: false,
          syncStatus: 'SUCCESS',
        }),
      }),
    );
  });
});
