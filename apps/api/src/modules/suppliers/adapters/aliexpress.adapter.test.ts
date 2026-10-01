import axios from 'axios';
import * as crypto from 'crypto';
import { AliExpressAdapter } from './aliexpress.adapter';
import { SupplierApiError } from './supplier-api.error';
import { SupplierApiErrorCode, SupplierCapabilityStatus, SupplierCode } from '@aurevo/shared/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Phase 8 unit coverage for the audited AliExpress adapter: honest capability
 * reporting (nothing claimed as working until confirmed), configurable base
 * URL, and safe non-secret errors.
 */
describe('AliExpressAdapter', () => {
  const BASE = 'https://api.example.com/rest';
  let adapter: AliExpressAdapter;

  const makeAdapter = (accessToken = '') =>
    new AliExpressAdapter({
      appKey: 'key',
      appSecret: 'secret',
      accessToken,
      apiBaseUrl: BASE,
    });

  beforeEach(() => {
    mockedAxios.post.mockReset();
  });

  describe('code', () => {
    it('is ALIEXPRESS', () => {
      expect(makeAdapter().code).toBe(SupplierCode.ALIEXPRESS);
    });
  });

  describe('getCapabilities', () => {
    it('reports every operation NOT_AUTHORIZED when no token is present', () => {
      const caps = makeAdapter('').getCapabilities();
      expect(caps.length).toBeGreaterThan(0);
      for (const cap of caps) {
        expect(cap.status).toBe(SupplierCapabilityStatus.NOT_AUTHORIZED);
      }
    });

    it('reports every operation UNVERIFIED (never SUPPORTED) with a token', () => {
      const caps = makeAdapter('some-token').getCapabilities();
      for (const cap of caps) {
        // No real call has run, so nothing is claimed to work.
        expect(cap.status).toBe(SupplierCapabilityStatus.UNVERIFIED);
      }
    });
  });

  describe('authenticate', () => {
    it('returns success:false (not a fabricated 200) when there is no token', async () => {
      const res = await makeAdapter('').authenticate({});
      expect(res.success).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns success:true only when a real API call succeeds', async () => {
      // A genuine success: HTTP 200, a method-response envelope with
      // resp_code 200 and real data (the shape the live gateway returns).
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          aliexpress_ds_category_get_response: {
            resp_result: { resp_code: 200, resp_msg: 'Call succeeds' },
          },
        },
      });
      const res = await makeAdapter('token').authenticate({});
      expect(res.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        BASE,
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            method: 'aliexpress.ds.category.get',
            access_token: 'token',
          }),
        }),
      );
    });

    it('does NOT report success on an HTTP 200 error_response envelope', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { error_response: { code: 21, msg: 'InvalidSession' } },
      });
      const res = await makeAdapter('expired-token').authenticate({});
      expect(res.success).toBe(false);
      expect(res.message).toContain('InvalidSession');
    });

    it('does NOT report success when the method envelope has a non-200 resp code', async () => {
      // Live shape example: aliexpress.ds.product.get with a bad id → rsp_code 605.
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          aliexpress_ds_product_get_response: { rsp_code: 605, rsp_msg: 'ITEM_ID_NOT_FOUND' },
        },
      });
      const res = await makeAdapter('token').authenticate({});
      expect(res.success).toBe(false);
    });

    it('surfaces a safe failure message on a 401 (no secret, no params)', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 401, data: { error_response: { msg: 'invalid token' } } },
      });
      const res = await makeAdapter('stale-token').authenticate({});
      expect(res.success).toBe(false);
      expect(res.message).toContain('invalid token');
    });
  });

  describe('request error handling', () => {
    it('throws a NOT_AUTHORIZED SupplierApiError for 401/403 responses', async () => {
      const a = makeAdapter('tok');
      mockedAxios.post.mockRejectedValue({
        response: { status: 403, data: { error_response: { msg: 'forbidden' } } },
      });
      await expect(a.authenticate({})).resolves.toMatchObject({ success: false });
    });
  });

  describe('generateSignature (static)', () => {
    it('produces a deterministic uppercase HMAC-SHA256 hex digest (no secret braces)', () => {
      const secret = 'my-app-secret';
      const params = { app_key: 'key1', method: 'aliexpress.ds.category.get', timestamp: '12345' };
      const sig = AliExpressAdapter.generateSignature(secret, params);

      // /sync spec: HMAC(appSecret, sorted{key:value}…) — method included, no
      // secret braces. Verified manually.
      const sorted = Object.keys(params)
        .sort()
        .map((k) => k + params[k])
        .join('');
      const expected = crypto
        .createHmac('sha256', secret)
        .update(sorted)
        .digest('hex')
        .toUpperCase();

      expect(sig).toBe(expected);
      expect(sig).toMatch(/^[A-F0-9]{64}$/);
      // Regression guard: the old TOP braces form must NOT be produced.
      expect(sig).not.toBe(
        crypto
          .createHmac('sha256', secret)
          .update(secret + sorted + secret)
          .digest('hex')
          .toUpperCase(),
      );
    });

    it('is independent of param insertion order', () => {
      const secret = 's';
      const a = AliExpressAdapter.generateSignature(secret, { z: '1', a: '2' });
      const b = AliExpressAdapter.generateSignature(secret, { a: '2', z: '1' });
      expect(a).toBe(b);
    });

    it('excludes empty values and the sign key', () => {
      const secret = 's';
      const withEmpty = AliExpressAdapter.generateSignature(secret, { code: 'a', empty: '', sign: 'x' });
      const without = AliExpressAdapter.generateSignature(secret, { code: 'a' });
      expect(withEmpty).toBe(without);
    });
  });

  describe('timestamp format', () => {
    it('sends epoch milliseconds (13-digit string) in request params', async () => {
      const adapter = makeAdapter('token');
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await adapter.authenticate({});

      const [, , opts] = mockedAxios.post.mock.calls[0];
      expect(opts.params.timestamp).toMatch(/^\d{13}$/);
      // Should be within 2 seconds of now.
      const ts = Number(opts.params.timestamp);
      expect(Math.abs(Date.now() - ts)).toBeLessThan(2000);
    });
  });

  describe('generateIopSignature (static, token-path signing)', () => {
    it('produces the deterministic IOP HMAC over apiPath + sorted{k:v}', () => {
      const secret = 'my-app-secret';
      const apiPath = '/auth/token/create';
      const params = { app_key: 'key1', code: 'abc', sign_method: 'sha256', timestamp: '9000000000000' };

      const sig = AliExpressAdapter.generateIopSignature(secret, apiPath, params);

      // Manual check: HMAC(appSecret, apiPath + sorted(k=v)) uppercase hex — no
      // secret braces (differs from the TOP-style generateSignature).
      const sorted = Object.keys(params).sort().map((k) => k + params[k]).join('');
      const expected = crypto
        .createHmac('sha256', secret)
        .update(apiPath + sorted)
        .digest('hex')
        .toUpperCase();

      expect(sig).toBe(expected);
      expect(sig).toMatch(/^[A-F0-9]{64}$/);
    });

    it('depends on the API path (different path → different signature)', () => {
      const secret = 's';
      const params = { code: 'abc', app_key: 'k' };
      const a = AliExpressAdapter.generateIopSignature(secret, '/auth/token/create', params);
      const b = AliExpressAdapter.generateIopSignature(secret, '/auth/token/refresh', params);
      expect(a).not.toBe(b);
    });

    it('excludes empty values and the sign key itself', () => {
      const secret = 's';
      const withEmpty = AliExpressAdapter.generateIopSignature(
        secret,
        '/auth/token/create',
        { code: 'abc', uuid: '', app_key: 'k' },
      );
      const withoutEmpty = AliExpressAdapter.generateIopSignature(
        secret,
        '/auth/token/create',
        { code: 'abc', app_key: 'k' },
      );
      expect(withEmpty).toBe(withoutEmpty);
    });
  });

  describe('rate-limit / transient retry with backoff', () => {
    it('retries an HTTP 429 then succeeds (3 total calls)', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 429, data: {} } })
        .mockRejectedValueOnce({ response: { status: 429, data: {} } })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            aliexpress_ds_feedname_get_response: {
              resp_result: { resp_code: 200, result: { promos: { promo: [{ promo_name: 'F' }] } } },
            },
          },
        });
      const feeds = await adapter.listFeedNames();
      expect(feeds.length).toBe(1);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('retries an AOP error_response code 429 then succeeds', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post
        .mockResolvedValueOnce({ status: 200, data: { error_response: { code: 429, msg: 'too many' } } })
        .mockResolvedValueOnce({
          status: 200,
          data: { aliexpress_ds_feedname_get_response: { resp_result: { resp_code: 200, result: { promos: { promo: [] } } } } },
        });
      const feeds = await adapter.listFeedNames();
      expect(feeds).toEqual([]);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('retries a 5xx up to the cap then fails (never fabricates success)', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post.mockRejectedValue({ response: { status: 500, data: {} } });
      await expect(adapter.listFeedNames()).rejects.toThrow(SupplierApiError);
      // initial + 3 backoff retries
      expect(mockedAxios.post).toHaveBeenCalledTimes(4);
    }, 20000);

    it('does not retry a non-transient HTTP 400', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post.mockRejectedValue({ response: { status: 400, data: { error_response: { msg: 'bad' } } } });
      await expect(adapter.listFeedNames()).rejects.toThrow(SupplierApiError);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('expired / revoked authorization detection', () => {
    it('surfaces an HTTP-200 InvalidSession envelope as NOT_AUTHORIZED with a re-authorization hint', async () => {
      const adapter = makeAdapter('stale-token');
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { error_response: { code: 21, msg: 'InvalidSession' } },
      });
      const err = await adapter.listFeedNames().catch((e) => e);
      expect(err).toBeInstanceOf(SupplierApiError);
      expect(err.code).toBe(SupplierApiErrorCode.NOT_AUTHORIZED);
      expect(err.message).toMatch(/Re-authorize/i);
      expect(err.message).not.toContain('stale-token');
    });

    it('surfaces an HTTP-200 "session expired" message as NOT_AUTHORIZED', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { error_response: { code: 15, msg: 'Session Expired' } },
      });
      const err = await adapter.listFeedNames().catch((e) => e);
      expect(err.code).toBe(SupplierApiErrorCode.NOT_AUTHORIZED);
    });

    it('never leaks the access token or app secret in auth errors', async () => {
      const adapter = new AliExpressAdapter({
        appKey: 'SUPER_SECRET_APP_KEY_123',
        appSecret: 'SUPER_SECRET_APP_SECRET_456',
        accessToken: 'SUPER_SECRET_ACCESS_TOKEN_789',
        apiBaseUrl: BASE,
      });
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { error_response: { code: 21, msg: 'InvalidSession' } },
      });
      const err = await adapter.listFeedNames().catch((e) => e);
      for (const secret of ['SUPER_SECRET_APP_KEY_123', 'SUPER_SECRET_APP_SECRET_456', 'SUPER_SECRET_ACCESS_TOKEN_789']) {
        expect(err.message).not.toContain(secret);
      }
    });
  });

  describe('inferFeedCountry (region from feed name)', () => {
    it('resolves the prefix code convention AEB_<CC>_…', () => {
      expect(AliExpressAdapter.inferFeedCountry('AEB_BR_DropiSelectedItems_20241106')).toBe('BR');
      expect(AliExpressAdapter.inferFeedCountry('AEB_MX_ShipFromMX_20241119')).toBe('MX');
      expect(AliExpressAdapter.inferFeedCountry('AEB_US_Local Items_Home&Furniture&Outdoor&Sport&Beauty')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry('AEB_UK Local Items')).toBe('UK');
      expect(AliExpressAdapter.inferFeedCountry('AEB_AU_HomeImprovement&Furniture&Lights&Tools&Luggage')).toBe('AU');
      expect(AliExpressAdapter.inferFeedCountry('AEB_FR_LocalStock_PlatformOperation_20240926')).toBe('FR');
    });

    it('resolves a trailing _<CC> code', () => {
      expect(AliExpressAdapter.inferFeedCountry('AEB_ ComputerAccessories_EG')).toBe('EG');
    });

    it('resolves full country names even when flanked by underscores / dashes', () => {
      // JS \b treats `_` as a word char, so \bMexico\b would never fire in
      // `AEB_Mexico_...` — the token matcher must.
      expect(AliExpressAdapter.inferFeedCountry('AEB_Mexico_SelectedItems_20241014')).toBe('MX');
      expect(AliExpressAdapter.inferFeedCountry('AEB_Poland_LocalStock_PlatformOperation_20241028')).toBe('PL');
      expect(AliExpressAdapter.inferFeedCountry('AEB_Iraq_Akkooo_WomenClothing_20241031')).toBe('IQ');
    });

    it('resolves a code adjacent to a feed-kind keyword (…_ZA topsellers_…)', () => {
      expect(AliExpressAdapter.inferFeedCountry('Security_ZA topsellers_ 20240423')).toBe('ZA');
      expect(AliExpressAdapter.inferFeedCountry('Sports_ZA topsellers_ 20240423')).toBe('ZA');
    });

    it('resolves ship-to markers to US', () => {
      expect(AliExpressAdapter.inferFeedCountry('AEB_JingYun_Automotive&Motorcycle_SHIPTOUS_20250107')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry('AEB_BR_ShipFromBR_20241114')).toBe('BR'); // ShipFrom<CC> feeds keep their code
    });

    it('never mistakes English words for country codes (In $50 / EAN / CE)', () => {
      // "In $50" means "under $50" — must NOT become IN (India).
      expect(AliExpressAdapter.inferFeedCountry('AEB_ClawEden_SexItem&Applicance_In$50_20241206')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry('AEB_EAN Items')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry('AEB_CETagItems_20241017')).toBe('US');
    });

    it('falls back to US for global/no-code feeds and unknowns', () => {
      expect(AliExpressAdapter.inferFeedCountry('DS_Beauty_bestsellers')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry('AEB_SHOPLAZZA_WomenClothing_$10~30_20241115')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry('AEB_EE&FI&LV&LT_CHOICE_Bestsellers_$150')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry('gibberish feed')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry('')).toBe('US');
      expect(AliExpressAdapter.inferFeedCountry(undefined as unknown as string)).toBe('US');
    });
  });

  describe('DS catalog feed pipeline (granted methods)', () => {
    it('listFeedNames parses the feed list from aliexpress.ds.feedname.get', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          aliexpress_ds_feedname_get_response: {
            resp_result: { result: { promos: { promo: [{ promo_name: 'AEB_BR_DropiSelectedItems_20241106', product_num: 132557 }] } }, resp_code: 200 },
          },
        },
      });

      const feeds = await adapter.listFeedNames();
      expect(feeds[0]).toMatchObject({
        feedName: 'AEB_BR_DropiSelectedItems_20241106',
        productNum: 132557,
      });
      // The live feed-list response carries no country field, so country is
      // inferred from the feed name (needed to read the feed — a blank country
      // returns zero products).
      expect(feeds[0].country).toBe('BR');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        BASE,
        null,
        expect.objectContaining({
          params: expect.objectContaining({ method: 'aliexpress.ds.feedname.get' }),
        }),
      );
    });

    it('rejects an error envelope for the feed list (never fabricates feeds)', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { error_response: { code: 400, msg: 'InsufficientPermission' } },
      });
      await expect(makeAdapter('tok').listFeedNames()).rejects.toThrow('InsufficientPermission');
    });

    it('getFeedProducts sends page_no/page_size as strings and parses pagination', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          aliexpress_ds_recommend_feed_get_response: {
            resp_result: { resp_code: 200 },
            result: {
              total_record_count: 1000,
              current_record_count: 1,
              is_finished: false,
              products: {
                traffic_product_d_t_o: [
                  { product_id: 'p1', product_title: 'Widget', product_main_image_url: 'https://img/1.jpg', sale_price: '12.5', sale_price_currency: 'USD' },
                ],
              },
            },
          },
        },
      });

      const page = await adapter.getFeedProducts({ feedName: 'F', country: 'BR', page: 3, pageSize: 40 });
      expect(page.totalRecordCount).toBe(1000);
      expect(page.isFinished).toBe(false);
      expect(page.products[0]).toMatchObject({ productId: 'p1', title: 'Widget', priceAmount: 12.5, priceCurrency: 'USD' });
      expect(page.products[0].images).toEqual(['https://img/1.jpg']);

      const params = (mockedAxios.post.mock.calls[0][2] as any).params;
      expect(params.method).toBe('aliexpress.ds.recommend.feed.get');
      expect(params.feed_name).toBe('F');
      expect(params.country).toBe('BR');
      expect(params.page_no).toBe('3'); // strings, live-confirmed requirement
      expect(params.page_size).toBe('40');
    });

    it('infers the country when a blank one is passed (the empty-feed fix) and defaults target_currency to USD', async () => {
      const adapter = makeAdapter('tok');
      const ok = {
        status: 200,
        data: {
          aliexpress_ds_recommend_feed_get_response: {
            resp_result: { resp_code: 200 },
            result: {
              total_record_count: 0,
              current_record_count: 0,
              is_finished: true,
              products: { traffic_product_d_t_o: [] },
            },
          },
        },
      };
      mockedAxios.post.mockResolvedValue(ok);

      // Passed blank country → normalized to the code the feed name encodes.
      await adapter.getFeedProducts({ feedName: 'AEB_BR_DropiSelectedItems_20241106', country: '' });
      let params = (mockedAxios.post.mock.calls[0][2] as any).params;
      expect(params.country).toBe('BR');
      expect(params.target_currency).toBe('USD');
      expect(params.target_language).toBe('EN');

      // Explicit lowercase country is sent uppercase (DS API expects the code).
      await adapter.getFeedProducts({ feedName: 'AEB_UK Local Items', country: 'uk' });
      params = (mockedAxios.post.mock.calls[1][2] as any).params;
      expect(params.country).toBe('UK');

      // Global feed + blank country → US fallback (live-proven to read DS_* feeds).
      await adapter.getFeedProducts({ feedName: 'DS_Beauty_bestsellers', country: '' });
      params = (mockedAxios.post.mock.calls[2][2] as any).params;
      expect(params.country).toBe('US');
    });

    it('getProductDetail uses singular product_id + ship_to_country (no affiliate plural ids)', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          aliexpress_ds_product_get_response: {
            resp_result: { resp_code: 200 },
            result: {
              product: {
                product_id: '111',
                product_title: 'X',
                product_main_image_url: 'https://img/x.jpg',
                ae_item_sku_info_dtos: [
                  { sku_id: 's1', sku_price: { amount: 9.99, currencyCode: 'USD' }, sku_available_stock: 5 },
                ],
              },
            },
          },
        },
      });

      const product = await adapter.getProductDetail('111', 'BR');
      expect(product.id).toBe('111');
      expect(product.skus[0]).toMatchObject({ sku_id: 's1', sku_stock: 5 });

      const params = (mockedAxios.post.mock.calls[0][2] as any).params;
      expect(params.method).toBe('aliexpress.ds.product.get');
      expect(params.product_id).toBe('111');
      expect(params.ship_to_country).toBe('BR');
      expect(params.product_ids).toBeUndefined();
    });

    it('parses the official direct result shape and documented SKU stock fields', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          aliexpress_ds_product_get_response: {
            result: {
              product_id: '222',
              ae_item_sku_info_dtos: [
                { id: 'official-1', ipm_sku_stock: 17, sku_stock: true },
                { id: 'official-2', sku_stock: true },
              ],
            },
          },
        },
      });

      const inventory = await adapter.getDropshippingInventory('222', 'IN');
      expect(inventory.variants).toEqual([
        { variantId: 'official-1', quantity: 17, available: true },
        { variantId: 'official-2', quantity: 1, available: true },
      ]);
    });

    it('rejects unrecognized stock instead of fabricating zero', async () => {
      const adapter = makeAdapter('tok');
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          aliexpress_ds_product_get_response: {
            result: { product_id: '333', ae_item_sku_info_dtos: [{ id: 'unknown' }] },
          },
        },
      });

      await expect(adapter.getDropshippingInventory('333', 'IN')).rejects.toThrow(
        'without a recognized stock field',
      );
    });
  });
});
