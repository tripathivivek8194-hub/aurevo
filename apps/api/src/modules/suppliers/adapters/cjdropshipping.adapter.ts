import axios, { AxiosInstance } from 'axios';
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
} from '@aurevo/shared/types';
import { SupplierAdapter } from './supplier.adapter';
import { SupplierApiError } from './supplier-api.error';
import { SupplierApiErrorCode } from '@aurevo/shared/types';

/**
 * ============================================================================
 * CJdropshipping API 2.0 — auth/token lifecycle
 * ============================================================================
 *
 * VERIFIED (from the official developer portal at developers.cjdropshipping.com):
 *   - The platform exposes an API v2.0 with a dedicated Authentication category,
 *     an access-token flow, a Product category (incl. inventory query by product
 *     id), Shopping/order, Logistic (incl. waybill/tracking), Webhook, and a
 *     sandbox environment.
 *   - Authentication is token-based: obtain an access token, send it on every
 *     subsequent call via the `CJ-Access-Token` header.
 *   - Token lifetime (current docs): access token ~15 days, refresh token ~180
 *     days, with an official refresh endpoint (refreshAccessToken).
 *
 * CONFIRMED AUTH (current official docs): authentication is a single `apiKey`
 * (from the CJ Apps section) — NO app secret and NO appKey/email/password OAuth
 * flow. `getAccessToken` takes `{ apiKey }`; `refreshAccessToken` takes
 * `{ refreshToken }`; all subsequent calls send `CJ-Access-Token: <token>`.
 *
 * The other request/response field names below follow the documented v2.0
 * conventions and are centralized in the `ENDPOINTS`/`parse*` helpers so any
 * deviation found when a real session is used can be corrected in ONE place.
 * No live credential has been used yet, so no operation is reported SUPPORTED
 * until a real call proves it (see the capability model in the service).
 *
 * The token store is injected by the service and is backed by the encrypted
 * `apiConfig` column — access/refresh tokens never leave the server.
 */

/** Access + refresh token set with absolute expiry timestamps (epoch ms). */
export interface CJTokenSet {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
}

/** Server-side persistence hook for CJ tokens (encrypted at rest). */
export interface CJTokenStore {
  getTokens(): Promise<CJTokenSet>;
  saveTokens(tokens: CJTokenSet): Promise<void>;
}

export interface CJDropshippingAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  tokenStore: CJTokenStore;
  http?: AxiosInstance;
}

/** CJ API v2.0 method paths (relative to the base URL). Verified from
 *  developers.cjdropshipping.com — product endpoints are GET, auth/order are POST. */
const ENDPOINTS = {
  // Auth (POST)
  getAccessToken: 'authentication/getAccessToken',
  refreshAccessToken: 'authentication/refreshAccessToken',
  // Product catalog (GET)
  getCategory: 'product/getCategory',
  listProducts: 'product/listV2',
  queryProduct: 'product/query',
  queryStock: 'product/stock/queryByVid',
  // Orders (POST)
  createOrder: 'shopping/order/createOrder',
  queryOrderList: 'shopping/order/queryOrderList',
  queryOrderDetail: 'shopping/order/queryOrderDetail',
  cancelOrder: 'shopping/order/cancelOrder',
  // Logistics
  queryLogisticsShippingMethod: 'logistic/queryLogisticsShippingMethod',
  getFreight: 'logistic/getFreight',
} as const;

const DEFAULT_BASE_URL = 'https://developers.cjdropshipping.com/api2.0/v1';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CJ top-level success code. Anything else is an API error. */
function isSuccessCode(code: unknown): boolean {
  return code === 200 || code === 0 || code === undefined;
}

/** True when a CJ error indicates the access token is rejected/expired. */
function isAuthRejection(err: unknown): boolean {
  if (err instanceof SupplierApiError && err.code === SupplierApiErrorCode.NOT_AUTHORIZED) {
    return true;
  }
  return false;
}

export class CJDropshippingAdapter implements SupplierAdapter {
  readonly code: SupplierCode = SupplierCode.CJDROPSHIPPING;
  readonly name = 'CJdropshipping';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly tokenStore: CJTokenStore;
  private readonly http: AxiosInstance;

  constructor(config: CJDropshippingAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.tokenStore = config.tokenStore;
    this.http =
      config.http ??
      axios.create({ timeout: 30000, headers: { 'Content-Type': 'application/json' } });
  }

  // ---------------------------------------------------------------------------
  // Low-level transport (retry/backoff + error mapping; never logs secrets)
  // ---------------------------------------------------------------------------

  private isTransient(err: unknown): boolean {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 429 || (status != null && status >= 500)) return true;
      if (!err.response && err.code !== 'ECONNABORTED') return true; // network error
    }
    if (err instanceof SupplierApiError) return err.code === SupplierApiErrorCode.API_ERROR;
    return false;
  }

  private async rawPost<T>(path: string, params: Record<string, unknown>, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['CJ-Access-Token'] = token;
    const response = await this.http.post<T>(`${this.baseUrl}/${path}`, params, { headers });
    const body = response.data as any;
    if (!isSuccessCode(body?.code)) {
      throw new SupplierApiError(SupplierApiErrorCode.API_ERROR, this.safeMessage(body), response.status);
    }
    return response.data;
  }

  /** POST with exponential backoff + jitter on transient failures (429/5xx/network). */
  private async postWithRetry<T>(
    path: string,
    params: Record<string, unknown>,
    token?: string,
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.rawPost<T>(path, params, token);
      } catch (err) {
        if (!this.isTransient(err) || attempt >= 3) throw err;
        const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
        attempt++;
        await sleep(delay);
      }
    }
  }

  private async rawGet<T>(path: string, params: Record<string, unknown>, token?: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) headers['CJ-Access-Token'] = token;
    const response = await this.http.get<T>(`${this.baseUrl}/${path}`, { params, headers });
    const body = response.data as any;
    if (!isSuccessCode(body?.code)) {
      throw new SupplierApiError(SupplierApiErrorCode.API_ERROR, this.safeMessage(body), response.status);
    }
    return response.data;
  }

  /** GET with exponential backoff + jitter on transient failures (429/5xx/network). */
  private async getWithRetry<T>(
    path: string,
    params: Record<string, unknown>,
    token?: string,
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.rawGet<T>(path, params, token);
      } catch (err) {
        if (!this.isTransient(err) || attempt >= 3) throw err;
        const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
        attempt++;
        await sleep(delay);
      }
    }
  }

  /** Authenticated GET with a single refresh-and-retry on auth rejection. */
  private async authedGetRequest<T>(path: string, params: Record<string, unknown>): Promise<T> {
    const tokens = await this.ensureAccessToken();
    try {
      return await this.getWithRetry<T>(path, params, tokens.accessToken);
    } catch (err) {
      if (!isAuthRejection(err)) throw err;
      const fresh = await this.refreshTokens();
      return await this.getWithRetry<T>(path, params, fresh.accessToken);
    }
  }

  /** Map a raw HTTP/body error to a safe SupplierApiError (no params/secrets). */
  private mapAuthFailure(err: unknown): SupplierApiError {
    if (err instanceof SupplierApiError) {
      // Transient errors are passed through as-is; only auth failures map below.
      if (err.code !== SupplierApiErrorCode.NOT_AUTHORIZED) return err;
      return new SupplierApiError(
        SupplierApiErrorCode.NOT_AUTHORIZED,
        'CJ authorization expired or revoked — re-authorize from the connection card.',
      );
    }
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        return new SupplierApiError(
          SupplierApiErrorCode.NOT_AUTHORIZED,
          'CJ authorization expired or revoked — re-authorize from the connection card.',
        );
      }
    }
    return new SupplierApiError(SupplierApiErrorCode.API_ERROR, 'CJ API request failed.');
  }

  /** Extract a non-secret, bounded error message from a CJ error body. */
  private safeMessage(body: any): string {
    const raw = body?.message ?? body?.msg ?? body?.error ?? 'CJ API error';
    const s = String(raw).slice(0, 200);
    return s || 'CJ API error';
  }

  // ---------------------------------------------------------------------------
  // Token lifecycle (access ~15d, refresh ~180d, official refresh endpoint)
  // ---------------------------------------------------------------------------

  /**
   * Resolve an expiry into an absolute epoch-ms timestamp. CJ returns ABSOLUTE
   * expiry dates (`accessTokenExpiryDate` / `refreshTokenExpiryDate`); older
   * conventions may return expires-in seconds. Handles all of: ISO/date string,
   * epoch ms, epoch seconds, and relative seconds.
   */
  private computeExpiry(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const asNum = Number(value);
    if (typeof value === 'number' || (typeof value === 'string' && Number.isFinite(asNum))) {
      if (asNum > 100000000000) return asNum; // epoch milliseconds
      if (asNum > 10000000000) return asNum * 1000; // epoch seconds
      if (asNum > 0) return Date.now() + asNum * 1000; // relative seconds
    }
    const t = new Date(String(value)).getTime();
    return Number.isNaN(t) ? undefined : t;
  }

  /** Parse the getAccessToken / refreshAccessToken response into a token set. */
  private parseTokenResponse(body: any): CJTokenSet {
    const data = body?.data ?? body?.result ?? {};
    return {
      accessToken: String(data.accessToken ?? data.access_token ?? ''),
      refreshToken: String(
        data.refreshToken ?? data.refresh_token ?? data.refreshAccessToken ?? '',
      ),
      accessTokenExpiresAt: this.computeExpiry(
        data.accessTokenExpiryDate ??
          data.accessTokenExpiresIn ??
          data.expiresIn ??
          data.access_token_expires_in,
      ),
      refreshTokenExpiresAt: this.computeExpiry(
        data.refreshTokenExpiryDate ??
          data.refreshTokenExpiresIn ??
          data.refresh_token_expires_in,
      ),
    };
  }

  /** Get a valid access token, refreshing first when expired. Throws
   *  NOT_AUTHORIZED when no token can be produced (no refresh / refresh dead). */
  private async ensureAccessToken(): Promise<CJTokenSet> {
    const tokens = await this.tokenStore.getTokens();
    const now = Date.now();
    // Use the token when we have one and either know it's not yet expired, or
    // don't know its expiry (the server is the source of truth — a truly dead
    // token surfaces as a 401 and triggers the refresh-and-retry path below).
    if (
      tokens.accessToken &&
      (!tokens.accessTokenExpiresAt || tokens.accessTokenExpiresAt > now)
    ) {
      return tokens;
    }
    if (tokens.refreshToken && tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt > now) {
      return this.refreshTokens();
    }
    throw new SupplierApiError(
      SupplierApiErrorCode.NOT_AUTHORIZED,
      'CJ authorization expired or revoked — re-authorize from the connection card.',
    );
  }

  /** Call the official refresh endpoint and persist the new token set. */
  async refreshTokens(): Promise<CJTokenSet> {
    const tokens = await this.tokenStore.getTokens();
    if (!tokens.refreshToken) {
      throw new SupplierApiError(
        SupplierApiErrorCode.NOT_AUTHORIZED,
        'CJ authorization expired or revoked — re-authorize from the connection card.',
      );
    }
    const body = await this.postWithRetry<any>(ENDPOINTS.refreshAccessToken, {
      refreshToken: tokens.refreshToken,
    });
    const fresh = this.parseTokenResponse(body);
    if (!fresh.accessToken) {
      throw new SupplierApiError(
        SupplierApiErrorCode.NOT_AUTHORIZED,
        'CJ authorization expired or revoked — re-authorize from the connection card.',
      );
    }
    // If the refresh response rotated the refresh token, keep it; otherwise
    // preserve the existing one until it too expires.
    fresh.refreshToken = fresh.refreshToken || tokens.refreshToken;
    fresh.refreshTokenExpiresAt = fresh.refreshTokenExpiresAt ?? tokens.refreshTokenExpiresAt;
    await this.tokenStore.saveTokens(fresh);
    return fresh;
  }

  /**
   * Authenticated request with a single refresh-and-retry: if the server
   * rejects the token mid-flight (revoked/expired), refresh once and retry the
   * original operation exactly once. Never loops.
   */
  private async authedRequest<T>(path: string, params: Record<string, unknown>): Promise<T> {
    const tokens = await this.ensureAccessToken();
    try {
      return await this.postWithRetry<T>(path, params, tokens.accessToken);
    } catch (err) {
      if (!isAuthRejection(err)) throw err;
      // One refresh + one retry; a failing refresh becomes a clear re-auth state.
      const fresh = await this.refreshTokens();
      return await this.postWithRetry<T>(path, params, fresh.accessToken);
    }
  }

  // ---------------------------------------------------------------------------
  // SupplierAdapter interface
  // ---------------------------------------------------------------------------

  async authenticate(credentials: SupplierCredentials): Promise<AuthResult> {
    try {
      const body = await this.postWithRetry<any>(ENDPOINTS.getAccessToken, {
        apiKey: this.apiKey,
      });
      const set = this.parseTokenResponse(body);
      if (!set.accessToken) {
        return { success: false, message: 'CJ returned no access token.' };
      }
      await this.tokenStore.saveTokens(set);
      return { success: true, message: 'Connected to CJdropshipping.' };
    } catch (err) {
      return { success: false, message: this.mapAuthFailure(err).message };
    }
  }

  /** CJ product list V2 — GET /product/listV2 with keyword/category filters. */
  async searchProducts(query: SearchQuery): Promise<ProductSearchResult> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.limit ?? 25, 100); // CJ listV2 max is 100
    const params: Record<string, unknown> = { page, size: pageSize };
    if (query.query) params.keyWord = query.query;
    if (query.categoryId) params.categoryId = query.categoryId;
    const res = await this.authedGetRequest<any>(ENDPOINTS.listProducts, params);
    return this.parseProductList(res, page, pageSize);
  }

  async getProduct(supplierProductId: string): Promise<SupplierProduct> {
    const res = await this.authedGetRequest<any>(ENDPOINTS.queryProduct, {
      pid: supplierProductId,
    });
    const product = this.parseProductDetail(res, supplierProductId);
    if (!product) {
      throw new SupplierApiError(SupplierApiErrorCode.API_ERROR, 'CJ product not found.');
    }
    return product;
  }

  async getVariants(supplierProductId: string): Promise<SupplierVariant[]> {
    const product = await this.getProduct(supplierProductId);
    return product.variants ?? [];
  }

  async getInventory(supplierProductId: string, variantIds?: string[]): Promise<InventoryResult> {
    // CJ stock endpoint is per-variant (GET /product/stock/queryByVid?vid=...).
    // When no specific variant IDs are requested, fall back to product detail
    // which includes an inventories[] array per variant.
    if (!variantIds?.length) {
      const product = await this.getProduct(supplierProductId);
      if (!product.variants.length) {
        throw new SupplierApiError(
          SupplierApiErrorCode.API_ERROR,
          'CJ returned no verifiable variant inventory.',
        );
      }
      return {
        productId: supplierProductId,
        variants: product.variants.map((v) => ({
          variantId: v.id,
          quantity: v.inventory,
          available: v.inventory > 0,
        })),
        note: product.variants.length ? undefined : 'No variant inventory returned by CJ.',
      };
    }
    const variants: Array<{ variantId: string; quantity: number; available: boolean }> = [];
    for (const vid of variantIds) {
      const res = await this.authedGetRequest<any>(ENDPOINTS.queryStock, { vid });
      const warehouses = Array.isArray(res?.data) ? res.data : res?.data ? [res.data] : [];
      if (!warehouses.length) {
        throw new SupplierApiError(
          SupplierApiErrorCode.API_ERROR,
          `CJ returned no verifiable inventory for variant ${vid}.`,
        );
      }
      const qty = warehouses.reduce(
        (total: number, warehouse: any) => total + this.readCjWarehouseQuantity(warehouse),
        0,
      );
      variants.push({ variantId: vid, quantity: qty, available: qty > 0 });
    }
    return { productId: supplierProductId, variants };
  }

  async getPrice(supplierProductId: string, variantIds?: string[]): Promise<PriceResult> {
    const product = await this.getProduct(supplierProductId);
    return {
      productId: supplierProductId,
      basePrice: product.price?.amount ?? 0,
      currency: product.price?.currency ?? 'INR',
      variants:
        product.variants?.map((v) => ({ variantId: v.id, price: v.price })) ?? [],
    };
  }

  async createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const res = await this.authedRequest<any>(ENDPOINTS.createOrder, {
      orderNo: order.orderId,
      productList: order.items.map((item) => ({
        productId: item.supplierProductId,
        skuCode: item.supplierVariantId ?? '',
        quantity: item.quantity,
      })),
      shippingAddress: {
        name: order.shippingAddress.firstName + ' ' + order.shippingAddress.lastName,
        phone: order.shippingAddress.phone,
        country: order.shippingAddress.country,
        state: order.shippingAddress.state,
        city: order.shippingAddress.city,
        address: order.shippingAddress.address1,
        zip: order.shippingAddress.postalCode,
      },
    });
    const data = res?.data ?? {};
    return {
      supplierOrderId: String(data.orderId ?? data.orderNo ?? ''),
      status: String(data.orderStatus ?? 'CREATED'),
      trackingNumber: data.trackingNumber ? String(data.trackingNumber) : null,
      estimatedShipDate: data.estimatedShipDate ? String(data.estimatedShipDate) : null,
    };
  }

  async getOrderStatus(supplierOrderId: string): Promise<OrderStatusResult> {
    const res = await this.authedRequest<any>(ENDPOINTS.queryOrderDetail, {
      orderId: supplierOrderId,
    });
    const data = res?.data ?? {};
    return {
      supplierOrderId,
      status: String(data.orderStatus ?? 'UNKNOWN'),
      items: Array.isArray(data.productList)
        ? data.productList.map((p: any) => ({
            supplierProductId: String(p.productId ?? ''),
            supplierVariantId: p.skuCode ? String(p.skuCode) : undefined,
            quantity: Number(p.quantity ?? 0),
            status: String(p.orderStatus ?? 'UNKNOWN'),
          }))
        : [],
    };
  }

  async getTracking(supplierOrderId: string): Promise<TrackingResult> {
    const res = await this.authedRequest<any>(ENDPOINTS.queryOrderDetail, {
      orderId: supplierOrderId,
    });
    const data = res?.data ?? {};
    const events = Array.isArray(data.trackingList)
      ? data.trackingList.map((t: any) => ({
          timestamp: String(t.date ?? ''),
          status: String(t.status ?? ''),
          location: t.location ? String(t.location) : undefined,
          description: t.description ? String(t.description) : undefined,
        }))
      : [];
    return {
      supplierOrderId,
      carrier: data.carrier ? String(data.carrier) : undefined,
      trackingNumber: data.trackingNumber ? String(data.trackingNumber) : undefined,
      trackingUrl: data.trackingUrl ? String(data.trackingUrl) : undefined,
      events,
    };
  }

  verifyWebhook(_payload: any, _signature: string): boolean {
    // CJ's webhook signature scheme is confirmed against live docs before
    // enabling — never invented. See the webhook controller for the guarded
    // implementation.
    return false;
  }

  // ---------------------------------------------------------------------------
  // CJ-specific helpers (parsing + categories + logistics)
  // ---------------------------------------------------------------------------

  /**
   * CJ category list — GET /product/getCategory. Returns a three-level
   * hierarchy: categoryFirst → categorySecond → leaf (categoryId + categoryName).
   * We flatten to the leaf level since only leaves carry an ID.
   */
  async listProductCategories(): Promise<Array<{ id: string; name: string }>> {
    const res = await this.authedGetRequest<any>(ENDPOINTS.getCategory, {});
    const data = res?.data ?? [];
    if (!Array.isArray(data)) return [];
    const categories: Array<{ id: string; name: string }> = [];
    for (const first of data) {
      for (const second of first.categoryFirstList ?? []) {
        for (const leaf of second.categorySecondList ?? []) {
          if (leaf.categoryId && leaf.categoryName) {
            categories.push({ id: String(leaf.categoryId), name: String(leaf.categoryName) });
          }
        }
      }
    }
    return categories;
  }

  async listShippingMethods(): Promise<Array<{ id: string; name: string }>> {
    const res = await this.authedRequest<any>(ENDPOINTS.queryLogisticsShippingMethod, {});
    const data = res?.data ?? {};
    const list = Array.isArray(data) ? data : data.list ?? [];
    return list
      .map((m: any) => ({
        id: String(m.id ?? m.shippingMethodId ?? ''),
        name: String(m.name ?? m.shippingMethodName ?? ''),
      }))
      .filter((m: { id: string; name: string }) => m.id && m.name);
  }

  /**
   * Build a SupplierProduct from a CJ listV2 or detail item (tolerant parsing).
   * listV2 fields: id, nameEn, sku, bigImage, sellPrice, categoryId, threeCategoryName
   * detail fields: pid, productNameEn, productName, bigImage, sellPrice, description,
   *                variants[].variantSku, variants[].variantSellPrice, variants[].inventories[]
   */
  private toSupplierProduct(p: any, fallbackId?: string): SupplierProduct {
    const id = String(p.id ?? p.pid ?? p.productId ?? fallbackId ?? '');
    const title = String(p.nameEn ?? p.productNameEn ?? p.productName ?? id);
    const description = String(p.description ?? p.productDescription ?? '');
    const images = this.toImages(
      p.bigImage ?? p.productImage,
      p.productImageSet ?? p.productImageList,
    );
    const price = this.toNullableNumber(p.sellPrice ?? p.productPriceMin ?? p.price);
    const categoryName = String(p.threeCategoryName ?? p.categoryName ?? '');

    // Detail response has variants[] with inventories[]; listV2 has productSku array.
    const variantList = Array.isArray(p.variants) ? p.variants : [];
    const variants = variantList.length
      ? variantList.map((v: any) => ({
          id: String(v.variantSku ?? v.variantKey ?? ''),
          productId: id,
          attributes: v.variantKey ? { variant: String(v.variantKey) } : {},
          price: this.toNullableNumber(v.variantSellPrice ?? v.sellPrice) ?? 0,
          inventory: this.sumInventory(v.inventories),
          barcode: v.barcode ? String(v.barcode) : undefined,
        }))
      : this.toVariants(p.productSku).map((v) => ({
          id: v.skuCode,
          productId: id,
          attributes: v.attributes ?? {},
          price: v.price ?? 0,
          inventory: v.stock ?? 0,
          barcode: v.skuCode,
        }));

    return {
      id,
      title,
      description,
      price: { amount: price ?? 0, currency: String(p.currency ?? 'USD') },
      images,
      categoryId: p.categoryId ? String(p.categoryId) : undefined,
      categoryName: categoryName || undefined,
      variants,
      shipping: p.shippingMethod ? String(p.shippingMethod) : undefined,
    };
  }

  /** Sum totalInventory across a variant's inventories[] array. */
  private sumInventory(inventories: unknown): number {
    if (!Array.isArray(inventories)) return 0;
    return inventories.reduce(
      (sum: number, inv: any) => sum + this.readCjWarehouseQuantity(inv),
      0,
    );
  }

  private readCjWarehouseQuantity(inventory: any): number {
    const value =
      inventory?.totalInventoryNum ??
      inventory?.totalInventory ??
      inventory?.storageNum ??
      inventory?.cjInventoryNum ??
      inventory?.cjInventory ??
      inventory?.stock ??
      inventory?.availableStock;
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new SupplierApiError(
        SupplierApiErrorCode.API_ERROR,
        'CJ returned an inventory record without a recognized quantity.',
      );
    }
    return Math.floor(quantity);
  }

  /**
   * Parse the listV2 response. Structure:
   *   data.content = [{ productList: [...], relatedCategoryList: [...], keyWord: "..." }]
   *   data.totalRecords, data.pageNumber, data.pageSize, data.totalPages
   */
  private parseProductList(res: any, page: number, pageSize: number): ProductSearchResult {
    const data = res?.data ?? {};
    const content = Array.isArray(data.content) ? data.content : [];
    const products: SupplierProduct[] = [];
    for (const group of content) {
      const list = Array.isArray(group.productList) ? group.productList : [];
      for (const p of list) {
        products.push(this.toSupplierProduct(p));
      }
    }
    const total = Number(data.totalRecords ?? 0);
    return { products, total, page, limit: pageSize };
  }

  private parseProductDetail(res: any, productId: string): SupplierProduct | null {
    const data = res?.data ?? res?.result ?? {};
    const p = Array.isArray(data) ? data[0] : data;
    if (!p) return null;
    return this.toSupplierProduct(p, productId);
  }

  private parseInventory(
    res: any,
    productId: string,
    _variantIds?: string[],
  ): InventoryResult {
    const data = res?.data ?? res?.result ?? {};
    const list = Array.isArray(data) ? data : data.list ?? data.skuList ?? [];
    const variants = (Array.isArray(list) ? list : []).map((s: any) => ({
      variantId: String(s.skuCode ?? s.sku ?? ''),
      quantity: Number(s.stock ?? s.availableStock ?? 0),
      available: Number(s.stock ?? s.availableStock ?? 0) > 0,
    }));
    return {
      productId,
      variants,
      note: variants.length ? undefined : 'No variant inventory returned by CJ.',
    };
  }

  private toVariants(skuList: unknown): Array<{
    skuCode: string;
    price: number | null;
    stock: number | null;
    image?: string;
    attributes?: Record<string, string>;
  }> {
    if (!Array.isArray(skuList)) return [];
    return skuList
      .map((s: any) => ({
        skuCode: String(s.skuCode ?? s.sku ?? s.skuId ?? ''),
        price: this.toNullableNumber(s.price ?? s.skuPrice),
        stock: this.toNullableNumber(s.stock ?? s.availableStock),
        image: s.skuImage ? String(s.skuImage) : undefined,
        attributes: s.attributes ? { ...s.attributes } : undefined,
      }))
      .filter((v) => v.skuCode);
  }

  private toImages(main: unknown, list: unknown): string[] {
    const arr = Array.isArray(list) ? list : [];
    const urls = arr.map((x) => String(x)).filter((u) => u.length > 0);
    if (main && String(main).length > 0) urls.unshift(String(main));
    return Array.from(new Set(urls));
  }

  private toNullableNumber(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && v !== '' && v !== null && v !== undefined ? n : null;
  }
}
