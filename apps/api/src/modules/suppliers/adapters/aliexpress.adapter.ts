import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import {
  SupplierCode,
  SupplierCredentials,
  AuthResult,
  SearchQuery,
  ProductSearchResult,
  SupplierProduct,
  SupplierVariant,
  InventoryResult,
  PriceResult,
  SupplierOrderRequest,
  SupplierOrderResult,
  OrderStatusResult,
  TrackingResult,
  SupplierCapabilityStatus,
  SupplierCapability,
  SupplierApiErrorCode,
} from '@aurevo/shared/types';
import { SupplierAdapter } from './supplier.adapter';
import { SupplierApiError } from './supplier-api.error';

export interface AliExpressAdapterConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  /**
   * Overseas production API base URL. Defaults to the legacy
   * `https://api-sg.aliexpress.com/sync` used by the original skeleton.
   *
   * NOTE: This endpoint and the signing scheme MUST be confirmed against the
   * current official AliExpress Open Platform documentation before relying on
   * it in production. The official docs currently document
   * `https://api-sg.aliexpress.com/rest` as the overseas production endpoint.
   * Until a real request succeeds, all live capabilities are reported as
   * UNVERIFIED (see {@link getCapabilities}).
   */
  apiBaseUrl?: string;
}

/**
 * A featured/promo feed returned by `aliexpress.ds.feedname.get` (live-confirmed
 * granted for app 544330). Feeds are region-specific: a feed must be read with
 * its matching `country` (e.g. `BR` for `AEB_BR_DropiSelectedItems_20241106`).
 */
export interface AliExpressFeedSummary {
  feedName: string;
  country: string;
  categoryId?: string;
  productNum?: number;
}

/** A single product row inside a `aliexpress.ds.recommend.feed.get` page. */
export interface AliExpressFeedProduct {
  productId: string;
  title: string;
  images: string[];
  mainImage?: string;
  /** Price in the feed's target currency (major units). */
  priceAmount?: number;
  priceCurrency?: string;
  originalPriceAmount?: number;
  firstLevelCategoryName?: string;
  secondLevelCategoryName?: string;
  productUrl?: string;
}

/** One page of a featured feed (paginated — live-confirmed `total_record_count`). */
export interface AliExpressFeedPage {
  products: AliExpressFeedProduct[];
  totalRecordCount: number;
  currentRecordCount: number;
  isFinished: boolean;
  page: number;
}

@Injectable()
export class AliExpressAdapter implements SupplierAdapter {
  readonly code: SupplierCode = SupplierCode.ALIEXPRESS;
  readonly name = 'AliExpress';

  private readonly defaultBaseUrl = 'https://api-sg.aliexpress.com/sync';
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(config: AliExpressAdapterConfig) {
    this.appKey = config.appKey;
    this.appSecret = config.appSecret;
    this.accessToken = config.accessToken;
    this.baseUrl = config.apiBaseUrl ?? this.defaultBaseUrl;
  }

  /**
   * Honest per-operation capability report. No operation is claimed to work
   * until it has been confirmed against the live API, so with a token present
   * operations are UNVERIFIED — and NOT_AUTHORIZED when no token exists.
   */
  getCapabilities(): SupplierCapability[] {
    const authorized = Boolean(this.accessToken && this.accessToken.length > 0);
    const status = authorized
      ? SupplierCapabilityStatus.UNVERIFIED
      : SupplierCapabilityStatus.NOT_AUTHORIZED;
    const note = authorized
      ? 'Implemented but not yet confirmed against the live AliExpress API.'
      : 'Requires an access token (seller authorization).';

    const ops: Array<[string, string]> = [
      ['PRODUCT_SEARCH', 'Product search'],
      ['PRODUCT_DETAIL', 'Product detail'],
      ['INVENTORY', 'Inventory / price retrieval'],
      ['ORDER_CREATE', 'Supplier order creation'],
      ['ORDER_STATUS', 'Supplier order status'],
      ['TRACKING', 'Tracking retrieval'],
    ];

    return ops.map(([operation, label]) => ({ operation, label, status, note }));
  }

  /**
   * Signature for dotted router methods on the `/sync` gateway (e.g.
   * `aliexpress.ds.category.get`, `aliexpress.affiliate.*`). This is the scheme
   * the live `api-sg.aliexpress.com/sync` gateway accepts: HMAC-SHA256 over the
   * sorted `key=value` pairs (the `method` parameter included), with NO secret
   * braces — confirmed live against app 544330. It differs from {@link
   * generateIopSignature}, which prepends the IOP API path for the `/rest`
   * token endpoints.
   */
  static generateSignature(appSecret: string, params: Record<string, any>): string {
    const payload = Object.keys(params)
      .filter((key) => key !== 'sign' && params[key] !== '' && params[key] != null)
      .sort()
      .map((key) => key + params[key])
      .join('');
    return crypto.createHmac('sha256', appSecret).update(payload).digest('hex').toUpperCase();
  }

  /**
   * IOP token-path signature used by the OAuth token endpoints
   * (`/auth/token/create`, `/auth/token/refresh`). This is the signing scheme
   * the system (non-router) token paths require: the API path is prepended to
   * the sorted `key=value` pairs and there are no secret braces around them —
   * HMAC(appSecret, apiPath + sorted{key:value}…), uppercase hex. It differs
   * from {@link generateSignature} (TOP router style), so the token exchange
   * in `AliExpressService.exchangeCode()` must use this one.
   */
  static generateIopSignature(
    appSecret: string,
    apiPath: string,
    params: Record<string, any>,
  ): string {
    const payload = Object.keys(params)
      .filter((key) => key !== 'sign' && params[key] !== '' && params[key] != null)
      .sort()
      .map((key) => key + params[key])
      .join('');
    return crypto
      .createHmac('sha256', appSecret)
      .update(apiPath + payload)
      .digest('hex')
      .toUpperCase();
  }

  /** Instance wrapper delegating to the static signing method. */
  private generateSignature(params: Record<string, any>): string {
    return AliExpressAdapter.generateSignature(this.appSecret, params);
  }

  /** ISO-3166 alpha-2 codes that appear as standalone tokens in DS feed names.
   * Only a whitelisted code is accepted as a region token so non-country
   * 2-letter tokens (e.g. the `DS` in `DS_Beauty_bestsellers`) never match. */
  private static readonly FEED_ISO_CODES = new Set(
    [
      'US', 'UK', 'GB', 'CA', 'MX', 'BR', 'FR', 'DE', 'ES', 'IT', 'PT', 'NL',
      'BE', 'CH', 'AT', 'IE', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR',
      'RS', 'SI', 'UA', 'RU', 'TR', 'AE', 'SA', 'IL', 'EG', 'MA', 'DZ', 'TN',
      'ZA', 'NG', 'KE', 'GH', 'IN', 'PK', 'BD', 'LK', 'NP', 'ID', 'MY', 'TH',
      'VN', 'PH', 'SG', 'HK', 'TW', 'KR', 'JP', 'CN', 'AU', 'NZ', 'AR', 'CL',
      'CO', 'PE', 'UY', 'PY', 'EC', 'VE',
    ],
  );

  /**
   * Infer the region a DS featured-feed is meant to be read with, from its name.
   *
   * `aliexpress.ds.feedname.get` returns no country field, but every
   * `aliexpress.ds.recommend.feed.get` call must send the country matching the
   * feed's region — a blank/mismatched country yields zero products (live
   * confirmed). Feed names embed the code in several spellings:
   *
   *   `AEB_BR_DropiSelectedItems_20241106` → BR   (prefix code)
   *   `AEB_ ComputerAccessories_EG`  → EG        (trailing code)
   *   `AEB_US_Local Items_...&Home&Furniture...` → US
   *   `AEB_Mexico_SelectedItems`     → MX         (full country name)
   *   `_ZA topsellers_`              → ZA
   *   `USA` / `SHIPTOUS` / `ShipFromUS` → US
   *   `DS_Beauty_bestsellers`        → US         (global feed; US fallback)
   *
   * Highest-confidence signals are tried first; `US` is the documented default
   * fallback (live-proven to return products for the global `DS_*` feeds).
   */
  static inferFeedCountry(feedName: string): string {
    const name = (feedName ?? '').trim();
    if (!name) return 'US';

    const tokens = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
    const upper = tokens.map((t) => t.toUpperCase());

    // US shipping markers anywhere in the name.
    if (
      upper.some((t) =>
        ['USA', 'SHIPTOUS', 'SHIPFROMUS', 'SHIPTOUSA', 'SHIPFROMUSA'].includes(t),
      )
    ) {
      return 'US';
    }

    // Full country names embedded in the name, matched token-by-token (not via
    // `\b` word boundaries — JS treats `_` as a word char, so `\bMexico\b`
    // would never fire inside `AEB_Mexico_...`).
    const lower = tokens.map((t) => t.toLowerCase());
    const fullNameCodes: Array<[string[], string]> = [
      [['united', 'states'], 'US'],
      [['united', 'kingdom'], 'UK'],
      [['england'], 'UK'],
      [['south', 'africa'], 'ZA'],
      [['saudi', 'arabia'], 'SA'],
      [['mexico'], 'MX'],
      [['poland'], 'PL'],
      [['iraq'], 'IQ'],
      [['brazil'], 'BR'],
      [['france'], 'FR'],
      [['germany'], 'DE'],
      [['spain'], 'ES'],
      [['italy'], 'IT'],
      [['india'], 'IN'],
      [['canada'], 'CA'],
      [['australia'], 'AU'],
      [['egypt'], 'EG'],
      [['indonesia'], 'ID'],
      [['thailand'], 'TH'],
    ];
    for (let i = 0; i < lower.length; i++) {
      for (const [names, code] of fullNameCodes) {
        if (names.every((n, k) => lower[i + k] === n)) return code;
      }
    }

    // ISO-3166 codes only in high-confidence positions: the `AEB_<CC>_` prefix,
    // a trailing `_<CC>` suffix, or a code directly before a feed-kind keyword
    // (e.g. `AEB_ZA topsellers`). A bare mid-name 2-letter token is deliberately
    // ignored — an English word uppercases onto a code (`In $50` → `IN` India,
    // `IT items` → Italy) and a mismatched country is what makes a feed read
    // empty. If nothing credible matches, default to `US` (live-proven to read
    // the global `DS_*`/`SHOPLAZZA` feeds).
    const isCode = (t: string) => AliExpressAdapter.FEED_ISO_CODES.has(t);
    if (upper[0] === 'AEB' && upper.length > 1 && isCode(upper[1])) {
      return upper[1];
    }
    const last = upper[upper.length - 1];
    if (last && isCode(last)) return last;
    const feedKindTokens = new Set([
      'topsellers', 'top', 'bestsellers', 'selecteditems', 'localstock',
      'platformoperation', 'avasam', 'spicy', 'hottest', 'daily',
    ]);
    for (let i = 0; i < lower.length - 1; i++) {
      if (isCode(upper[i]) && feedKindTokens.has(lower[i + 1])) return upper[i];
    }

    return 'US';
  }

  /** Idle wait for rate-limit/transient backoff (no concurrency — sequential only). */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** True when the gateway/HTTP error means the seller token is dead and the
   * admin must re-authorize (vs. a transient or unrelated failure). `status`/
   * `code` are the numeric AOP codes; `msg` is the human message. */
  private isAuthFailure(msg: unknown, status: unknown, code: unknown): boolean {
    if (status === 401 || status === 403) return true;
    if (code === 'InvalidSession') return true;
    if (typeof msg === 'string') {
      return /invalid.?session|session.?expired|token.?expired|(access_?|authorization).?(token|expired)|unauthorized/i.test(
        msg,
      );
    }
    return false;
  }

  /** True for a rate-limit signal (HTTP 429 or AOP code 429) — retried, never fatal. */
  private isRateLimited(status: unknown, code: unknown): boolean {
    return status === 429 || code === 429 || code === '429';
  }

  /**
   * Signed AliExpress business call with rate-limit/transient retry.
   *
   * Transient failures (HTTP 429 / 5xx / network drop, and AOP `error_response`
   * code 429) are retried with exponential backoff + jitter (up to 3 retries).
   * Never concurrent — the catalog importer calls pages strictly sequentially.
   * Expired/revoked seller auth is detected and surfaced as NOT_AUTHORIZED with
   * a "re-authorization required" hint (no auto-refresh is attempted — the
   * refresh path is unverified, and per policy we never fabricate success).
   * HTTP-200 `error_response` envelopes and non-200 method `resp_code` remain
   * failures (never success).
   */
  private async request(method: string, apiName: string, params: Record<string, any> = {}) {
    if (!this.accessToken) {
      throw new SupplierApiError(
        SupplierApiErrorCode.NOT_AUTHORIZED,
        'AliExpress access token is required. Authorize the seller first.',
        401,
      );
    }

    // Epoch milliseconds — the live /rest gateway rejects the compact format.
    const timestamp = String(Date.now());
    const commonParams: Record<string, any> = {
      app_key: this.appKey,
      sign_method: 'sha256',
      timestamp,
      format: 'json',
      v: '2.0',
      access_token: this.accessToken,
      method: apiName,
      ...params,
    };

    commonParams.sign = this.generateSignature(commonParams);

    const maxAttempts = 4; // initial + up to 3 backoff retries
    let lastError: SupplierApiError | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // Exponential backoff with jitter: 1s, 2s, 4s (+ up to 250ms).
        const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250);
        await this.sleep(backoff);
      }

      try {
        const response = await axios.post(this.baseUrl, null, { params: commonParams });
        const data = response.data ?? {};

        // The live gateway returns errors as HTTP 200 envelopes too — never treat
        // them as success. This is what keeps `authenticate()` and every
        // operation honest (no fabricated "verified").
        if (data?.error_response) {
          const apiError = data.error_response;
          const status =
            typeof apiError.code === 'number' && apiError.code !== 0 ? apiError.code : 0;
          if (this.isRateLimited(status, apiError.code) && attempt < maxAttempts - 1) {
            lastError = new SupplierApiError(
              SupplierApiErrorCode.API_ERROR,
              'AliExpress API is rate-limiting requests',
              status,
            );
            continue;
          }
          const auth = this.isAuthFailure(apiError.msg, status, apiError.code);
          throw new SupplierApiError(
            auth ? SupplierApiErrorCode.NOT_AUTHORIZED : SupplierApiErrorCode.API_ERROR,
            auth
              ? `${apiError.msg || 'AliExpress authorization expired or revoked'}. Re-authorize from the connection card.`
              : apiError.msg || 'AliExpress API request failed',
            status,
          );
        }

        // AOP method-response envelope: a non-200 rsp/resp code means the call did
        // not succeed even though the transport was fine (e.g. ITEM_ID_NOT_FOUND).
        const rootKey = Object.keys(data).find(
          (k) => k.endsWith('_response') && data[k] && typeof data[k] === 'object',
        );
        if (rootKey) {
          const root = data[rootKey] ?? {};
          const respCode = root.code ?? root.rsp_code ?? root.resp_code ?? root.resp_result?.resp_code;
          const codeStr = respCode === undefined ? undefined : String(respCode);
          if (codeStr !== undefined && codeStr !== '200' && codeStr !== '0') {
            const msg =
              root.resp_result?.resp_msg ?? root.rsp_msg ?? root.resp_msg ?? '';
            throw new SupplierApiError(
              SupplierApiErrorCode.API_ERROR,
              String(msg || 'AliExpress API request failed'),
              0,
            );
          }
        }

        return data;
      } catch (error: any) {
        // A SupplierApiError (e.g. an HTTP-200 gateway error envelope detected
        // above) carries its own safe message/code — do not re-wrap it.
        if (error instanceof SupplierApiError) {
          throw error;
        }
        const status = error.response?.status;
        // Transient HTTP/network failures are retried with backoff.
        if (
          attempt < maxAttempts - 1 &&
          (this.isRateLimited(status, error.response?.data?.error_response?.code) ||
            (status != null && status >= 500) ||
            !error.response)
        ) {
          lastError = new SupplierApiError(
            SupplierApiErrorCode.API_ERROR,
            'AliExpress API request failed',
            status ?? 0,
          );
          continue;
        }
        if (error.response?.data?.error_response) {
          const apiError = error.response.data.error_response;
          const auth = this.isAuthFailure(apiError.msg, status, apiError.code);
          // Surface only a safe, generic message — never the request params or
          // credentials that were part of the call.
          throw new SupplierApiError(
            status === 401 || status === 403
              ? SupplierApiErrorCode.NOT_AUTHORIZED
              : SupplierApiErrorCode.API_ERROR,
            auth
              ? `${apiError.msg || 'AliExpress authorization expired or revoked'}. Re-authorize from the connection card.`
              : apiError.msg || 'AliExpress API request failed',
            status,
          );
        }
        throw new SupplierApiError(
          SupplierApiErrorCode.API_ERROR,
          'AliExpress API request failed',
          status ?? 0,
        );
      }
    }

    throw (
      lastError ??
      new SupplierApiError(SupplierApiErrorCode.API_ERROR, 'AliExpress API request failed', 0)
    );
  }

  async authenticate(credentials: SupplierCredentials): Promise<AuthResult> {
    // `connectCredentials` is derived from the stored/encrypted config; the
    // constructor values are the ones actually used for signed calls.
    const token = this.accessToken;
    if (!token) {
      return { success: false, message: 'No access token — seller authorization required.' };
    }
    try {
      // Real API call: only a genuine success returns success:true. No fake 200.
      // `aliexpress.ds.category.get` is granted to this app (confirmed live:
      // resp_code 200 "Call succeeds" with real category data) and needs no
      // business parameters, so it is a clean token/credential probe. The
      // request() layer rejects HTTP-200 error envelopes and non-200 resp_code,
      // so an IncompleteSignature / InsufficientPermission / InvalidSession reply
      // can never be reported as success.
      await this.request('POST', 'aliexpress.ds.category.get', {});
      return { success: true, message: 'Authenticated successfully' };
    } catch (error: any) {
      return {
        success: false,
        message:
          error instanceof SupplierApiError
            ? error.message
            : 'AliExpress authentication failed',
      };
    }
  }

  // -- DS catalog feed pipeline (granted for app 544330; live-confirmed) -------
  //
  // These methods replace the dead `aliexpress.affiliate.product.query` search
  // path, which the app is denied (`InsufficientPermission`). They use the
  // granted `aliexpress.ds.*` family only. `request()` already rejects HTTP-200
  // `error_response` and non-200 `resp_code` envelopes, so a denied/failed call
  // can never be reported as an imported catalog.

  /** List featured/promo feeds with their region and product counts. */
  async listFeedNames(): Promise<AliExpressFeedSummary[]> {
    const data = await this.request('POST', 'aliexpress.ds.feedname.get', {});
    const root = this.findMethodRoot(data);
    // Live-confirmed layout: `aliexpress_ds_feedname_get_response.resp_result.result.promos.promo[]`.
    // Each promo carries `promo_name` (the feed name, e.g. "AEB_ ComputerAccessories_EG")
    // and `product_num`. The response does NOT include a country field, so country is
    // inferred from the feed name (needed to read the feed — a blank country yields
    // zero products).
    const result = root?.resp_result?.result ?? {};
    const feeds = result?.promos?.promo ?? [];
    const list = Array.isArray(feeds) ? feeds : [];
    return list
      .map((f: any) => {
        const name = String(f?.promo_name ?? f?.feed_name ?? '').trim();
        return {
          feedName: name,
          // Honor an explicit country if the API ever supplies one, else infer
          // the region the name encodes.
          country:
            String(f?.country ?? f?.country_code ?? '').trim() ||
            AliExpressAdapter.inferFeedCountry(name),
          categoryId: f?.category_id != null ? String(f.category_id) : undefined,
          productNum: f?.product_num != null ? Number(f.product_num) : undefined,
        };
      })
      .filter((f) => f.feedName.length > 0);
  }

  /**
   * Fetch one page of a featured feed. `page_no`/`page_size` are sent as
   * strings (live-confirmed requirement of `aliexpress.ds.recommend.feed.get`),
   * and `country` must match the feed's region exactly — a blank/mismatched
   * country returns zero products (live confirmed). `country` is therefore
   * resolved here from the feed name (US fallback) when the caller did not
   * supply one, and `target_currency` defaults to `USD` so the response always
   * carries the converted `target_sale_price` the importer displays/stores.
   */
  async getFeedProducts(opts: {
    feedName: string;
    country: string;
    page?: number;
    pageSize?: number;
    targetCurrency?: string;
    targetLanguage?: string;
  }): Promise<AliExpressFeedPage> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 25;

    const country = (
      (opts.country ?? '').trim() || AliExpressAdapter.inferFeedCountry(opts.feedName)
    ).toUpperCase();
    const targetCurrency = (opts.targetCurrency ?? '').trim() || 'USD';
    const targetLanguage = (opts.targetLanguage ?? '').trim() || 'EN';

    const params: Record<string, any> = {
      feed_name: opts.feedName,
      country,
      page_no: String(page),
      page_size: String(pageSize),
      target_currency: targetCurrency,
      target_language: targetLanguage,
    };

    const data = await this.request('POST', 'aliexpress.ds.recommend.feed.get', params);
    const root = this.findMethodRoot(data);
    const result = root?.result ?? root;
    // Live-confirmed layout: products live under `result.products.traffic_product_d_t_o[]`
    const productList = result?.products?.traffic_product_d_t_o ?? result?.products?.product ?? [];
    const list = Array.isArray(productList) ? productList : Array.isArray(result?.products) ? result.products : [];

    return {
      products: list.map((p: any) => this.mapFeedProduct(p)),
      totalRecordCount: Number(result?.total_record_count ?? 0),
      currentRecordCount: Number(result?.current_record_count ?? 0),
      isFinished: this.isTrue(result?.is_finished),
      page,
    };
  }

  /**
   * Full product detail via `aliexpress.ds.product.get` (singular `product_id`
   * + `ship_to_country` — both live-confirmed). Returns the normalized
   * {@link SupplierProduct} including per-SKU pricing/stock.
   */
  async getProductDetail(
    productId: string,
    shipToCountry: string,
    opts?: { targetCurrency?: string; targetLanguage?: string },
  ): Promise<SupplierProduct> {
    const params: Record<string, any> = {
      product_id: productId,
      ship_to_country: shipToCountry,
    };
    if (opts?.targetCurrency) params.target_currency = opts.targetCurrency;
    if (opts?.targetLanguage) params.target_language = opts.targetLanguage;

    const data = await this.request('POST', 'aliexpress.ds.product.get', params);
    const root = this.findMethodRoot(data);
    const result = root?.result ?? {};
    const product = result?.product ?? {};
    return this.transformDsProduct(product, shipToCountry);
  }

  async searchProducts(query: SearchQuery): Promise<ProductSearchResult> {
    const params = {
      keywords: query.query ?? '',
      page_no: query.page ?? 1,
      page_size: query.limit ?? 20,
      sort: query.sort ?? 'SALE_PRICE_ASC',
      category_ids: query.categoryId,
      min_sale_price: query.minPrice ? query.minPrice * 100 : undefined,
      max_sale_price: query.maxPrice ? query.maxPrice * 100 : undefined,
      ship_to_country: query.country ?? 'IN',
    };

    const result = await this.request('POST', 'aliexpress.affiliate.product.query', params);

    return {
      products: result.result?.products?.product ?? [],
      total: result.result?.total_count ?? 0,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  async getProduct(supplierProductId: string): Promise<SupplierProduct> {
    const result = await this.request('POST', 'aliexpress.affiliate.productdetail.get', {
      product_ids: supplierProductId,
      target_currency: 'INR',
      target_language: 'EN',
    });

    const product = result.result?.products?.product?.[0];
    if (!product) {
      throw new SupplierApiError(
        SupplierApiErrorCode.API_ERROR,
        'AliExpress product not found',
        404,
      );
    }

    return this.transformProduct(product);
  }

  async getVariants(supplierProductId: string): Promise<SupplierVariant[]> {
    const product = await this.getProduct(supplierProductId);
    return product.skus?.map(sku => ({
      id: sku.sku_id,
      productId: supplierProductId,
      attributes: sku.sku_attrs?.reduce((acc: any, attr: any) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}) ?? {},
      price: sku.sku_price?.amount ?? 0,
      inventory: sku.sku_stock ?? 0,
      barcode: sku.sku_code,
    })) ?? [];
  }

  async getInventory(supplierProductId: string, variantIds?: string[]): Promise<InventoryResult> {
    const variants = await this.getVariants(supplierProductId);

    const filtered = variantIds?.length
      ? variants.filter(v => variantIds.includes(v.id))
      : variants;

    return {
      productId: supplierProductId,
      variants: filtered.map(v => ({
        variantId: v.id,
        quantity: v.inventory,
        available: v.inventory > 0,
      })),
    };
  }

  /**
   * Stock refreshes for imported dropshipping products must use the DS detail
   * API, not the affiliate detail API. The latter is not granted to every
   * dropshipping application and caused valid imported products to be skipped.
   */
  async getDropshippingInventory(
    supplierProductId: string,
    shipToCountry: string,
  ): Promise<InventoryResult> {
    const product = await this.getProductDetail(supplierProductId, shipToCountry, {
      targetCurrency: 'INR',
      targetLanguage: 'EN',
    });

    return {
      productId: supplierProductId,
      variants: (product.skus ?? []).map((sku) => ({
        variantId: sku.sku_id,
        quantity: Math.max(0, Number(sku.sku_stock) || 0),
        available: Math.max(0, Number(sku.sku_stock) || 0) > 0,
      })),
    };
  }

  async getPrice(supplierProductId: string, variantIds?: string[]): Promise<PriceResult> {
    const product = await this.getProduct(supplierProductId);

    return {
      productId: supplierProductId,
      basePrice: product.price?.amount ?? 0,
      currency: product.price?.currency ?? 'INR',
      variants: product.skus?.map(sku => ({
        variantId: sku.sku_id,
        price: sku.sku_price?.amount ?? 0,
        originalPrice: sku.sku_original_price?.amount,
      })) ?? [],
    };
  }

  async createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const result = await this.request('POST', 'aliexpress.trade.order.create', {
      out_order_id: order.orderId,
      product_orders: order.items.map(item => ({
        product_id: item.supplierProductId,
        sku_id: item.supplierVariantId,
        quantity: item.quantity,
      })),
      shipping_address: {
        name: order.shippingAddress.firstName + ' ' + order.shippingAddress.lastName,
        country: order.shippingAddress.country,
        province: order.shippingAddress.state,
        city: order.shippingAddress.city,
        detail_address: order.shippingAddress.address1 + (order.shippingAddress.address2 ? ' ' + order.shippingAddress.address2 : ''),
        zip: order.shippingAddress.postalCode,
        phone: order.shippingAddress.phone,
      },
    });

    return {
      supplierOrderId: result.result?.order_id,
      status: 'PENDING',
      trackingNumber: null,
      estimatedShipDate: null,
    };
  }

  async getOrderStatus(supplierOrderId: string): Promise<OrderStatusResult> {
    const result = await this.request('POST', 'aliexpress.trade.order.get', {
      order_id: supplierOrderId,
    });

    const order = result.result?.order;
    if (!order) {
      throw new SupplierApiError(
        SupplierApiErrorCode.API_ERROR,
        'AliExpress order not found',
        404,
      );
    }

    return {
      supplierOrderId: order.order_id,
      status: this.mapOrderStatus(order.order_status),
      items: order.product_orders?.map((item: any) => ({
        supplierProductId: item.product_id,
        supplierVariantId: item.sku_id,
        quantity: item.quantity,
        status: this.mapOrderStatus(item.order_status),
      })) ?? [],
    };
  }

  async getTracking(supplierOrderId: string): Promise<TrackingResult> {
    const result = await this.request('POST', 'aliexpress.logistics.tracking.get', {
      order_id: supplierOrderId,
    });

    const tracking = result.result?.tracking_info;
    if (!tracking) {
      return { supplierOrderId, events: [] };
    }

    return {
      supplierOrderId,
      carrier: tracking.logistics_company,
      trackingNumber: tracking.tracking_number,
      trackingUrl: tracking.tracking_url,
      events: tracking.tracking_details?.map((detail: any) => ({
        timestamp: new Date(detail.time).toISOString(),
        status: detail.status,
        location: detail.location,
        description: detail.description,
      })) ?? [],
    };
  }

  verifyWebhook(payload: any, signature: string): boolean {
    const expectedSign = this.generateSignature(payload);
    return expectedSign === signature;
  }

  /** Locate the `*_response` root object of a `/sync` method envelope. */
  private findMethodRoot(data: any): any {
    if (!data || typeof data !== 'object') return {};
    const key = Object.keys(data).find(
      (k) => k.endsWith('_response') && data[k] && typeof data[k] === 'object',
    );
    return key ? data[key] : data;
  }

  private isTrue(v: any): boolean {
    return v === true || v === 1 || v === 'true' || v === '1';
  }

  /** First finite positive money value among the candidate price fields. */
  private feedAmount(...candidates: any[]): number | undefined {
    for (const c of candidates) {
      if (c == null) continue;
      const n = typeof c === 'object' ? Number(c?.amount) : Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return undefined;
  }

  /** Map a `aliexpress.ds.recommend.feed.get` product row. */
  private mapFeedProduct(p: any): AliExpressFeedProduct {
    const images = Array.isArray(p?.product_image)
      ? p.product_image.filter((u: any) => typeof u === 'string' && u.length > 0)
      : typeof p?.product_main_image_url === 'string' && p.product_main_image_url.length > 0
      ? [p.product_main_image_url]
      : [];
    return {
      productId: String(p?.product_id ?? ''),
      title: String(p?.product_title ?? ''),
      images,
      mainImage: typeof p?.product_main_image_url === 'string' ? p.product_main_image_url : undefined,
      // Prices come back as scalar strings (e.g. sale_price "1.25", and the
      // target_* fields are the `target_currency`-converted amounts). Prefer the
      // converted `target_sale_price` — that is what we display/store.
      priceAmount: this.feedAmount(
        p?.target_sale_price,
        p?.sale_price,
        p?.product_sale_price,
        p?.product_price,
        p?.product_min_price,
      ),
      priceCurrency:
        p?.target_sale_price_currency ??
        p?.sale_price_currency ??
        p?.sale_price?.currencyCode ??
        p?.target_sale_price?.currencyCode ??
        '',
      originalPriceAmount: this.feedAmount(p?.target_original_price, p?.original_price, p?.product_original_price),
      firstLevelCategoryName: p?.first_level_category_name ?? p?.category_name,
      secondLevelCategoryName: p?.second_level_category_name,
      productUrl: typeof p?.product_detail_url === 'string' ? p.product_detail_url : typeof p?.product_url === 'string' ? p.product_url : undefined,
    };
  }

  /** Map `aliexpress.ds.product.get` detail to the shared SupplierProduct shape. */
  private transformDsProduct(product: any, shipToCountry: string): SupplierProduct {
    const skuList = product?.ae_item_sku_info_dtos ?? [];
    const skus = (Array.isArray(skuList) ? skuList : []).map((sku: any) => ({
      sku_id: String(sku?.sku_id ?? ''),
      sku_price: sku?.sku_price,
      sku_original_price: sku?.sku_original_price,
      sku_stock: Number(sku?.sku_available_stock ?? 0),
      sku_code: sku?.sku_code,
      sku_attrs: sku?.sku_attr,
    }));
    const images = Array.isArray(product?.product_image)
      ? product.product_image.filter((u: any) => typeof u === 'string' && u.length > 0)
      : typeof product?.product_main_image_url === 'string'
      ? [product.product_main_image_url]
      : [];
    return {
      id: String(product?.product_id ?? ''),
      title: String(product?.product_title ?? ''),
      description: String(product?.product_desc ?? product?.detail_desc ?? ''),
      price: {
        amount: this.feedAmount(product?.sale_price?.amount, product?.product_price) ?? 0,
        currency:
          product?.sale_price?.currencyCode ??
          product?.product_price?.currencyCode ??
          shipToCountry,
      },
      originalPrice: {
        amount: this.feedAmount(product?.original_price?.amount) ?? 0,
        currency: '',
      },
      images,
      categoryId: product?.category_id != null ? String(product.category_id) : undefined,
      categoryName: product?.category_name,
      skus,
      shipping: product?.shipping_fee,
      rating: product?.rating,
      ordersCount: product?.trade_number,
    };
  }

  private transformProduct(product: any): SupplierProduct {
    return {
      id: product.product_id,
      title: product.product_title,
      description: product.product_desc,
      price: {
        amount: product.sale_price?.amount ?? product.target_sale_price?.amount ?? 0,
        currency: product.sale_price?.currencyCode ?? product.target_sale_price?.currencyCode ?? 'INR',
      },
      originalPrice: {
        amount: product.original_price?.amount ?? 0,
        currency: product.original_price?.currencyCode ?? 'INR',
      },
      images: product.product_main_image_url ? [product.product_main_image_url] : [],
      categoryId: product.category_id,
      categoryName: product.category_name,
      skus: product.skus?.map((sku: any) => ({
        sku_id: sku.sku_id,
        sku_price: sku.sku_price,
        sku_original_price: sku.sku_original_price,
        sku_stock: sku.sku_stock,
        sku_code: sku.sku_code,
        sku_attrs: sku.sku_attrs,
      })) ?? [],
      shipping: product.logistics_desc,
      rating: product.rating,
      ordersCount: product.orders_count,
    };
  }

  private mapOrderStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'WAIT_SELLER_SEND_GOODS': 'PENDING',
      'SELLER_SEND_GOODS': 'IN_TRANSIT',
      'WAIT_BUYER_ACCEPT_GOODS': 'IN_TRANSIT',
      'FUND_PROCESSING': 'PROCESSING',
      'FINISH': 'DELIVERED',
      'CLOSED': 'CANCELLED',
      'FROZEN': 'ON_HOLD',
    };
    return statusMap[status] ?? status;
  }
}
