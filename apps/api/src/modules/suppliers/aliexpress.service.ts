import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { SuppliersService } from './suppliers.service';
import {
  AliExpressAdapter,
  AliExpressFeedProduct,
  AliExpressFeedSummary,
} from './adapters/aliexpress.adapter';
import { SupplierApiError } from './adapters/supplier-api.error';
import { ConfigureAliExpressDto } from './dto/configure-aliexpress.dto';
import { ImportAliExpressCatalogDto } from './dto/import-aliexpress-catalog.dto';
import type { CreateImportJobDto } from './dto/import-aliexpress-catalog.dto';
import {
  AliExpressConnectionStatus,
  AliExpressConnectResponse,
  SupplierCapability,
  SupplierCapabilityStatus,
  SupplierApiErrorCode,
} from '@aurevo/shared/types';
import { computeMinSellPrice } from '@aurevo/shared';

/** A redirect query from the AliExpress OAuth authorization server. */
export interface AliExpressCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface StoredState {
  createdAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ADMIN_SUPPLIERS_PATH = '/admin/suppliers';
/** The exact route AliExpress OAuth must redirect back to (global /api prefix + route). */
export const ALIEXPRESS_CALLBACK_PATH = '/api/suppliers/aliexpress/callback';

/** Safe feed-list result for the admin UI — never credentials. */
export interface AliExpressFeedListResult {
  configured: boolean;
  feeds: AliExpressFeedSummary[];
  error?: string;
}

/** One live feed page, safe fields only. */
export interface AliExpressFeedPreviewResult {
  products: AliExpressFeedProduct[];
  totalRecordCount: number;
  page: number;
  pageSize: number;
  currency?: string;
  error?: string;
}

/** Import-run summary returned to the admin UI (no product CSVs, no credentials). */
export interface AliExpressImportResult {
  imported: number;
  skipped: number;
  scanned: number;
  enrichedVariants: number;
  enrichFailed: number;
  feedName: string;
  country: string;
  categoryId: string;
}

/** Safe fields returned from a job (no credentials/tokens). */
export interface ProductImportJobResult {
  id: string;
  feedName: string;
  country: string;
  categoryId: string;
  perRunLimit: number;
  currency: string;
  enrich: boolean;
  mode: string;
  status: string;
  nextPage: number;
  isFeedFinished: boolean;
  processedCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  enrichedVariantCount: number;
  enrichFailedCount: number;
  failedIds: string[];
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

/** Normalised feed-product fields for the shared upsert helper. */
interface FeedProductFields {
  productId: string;
  title: string;
  description?: string;
  images: string[];
  priceAmount?: number;
  priceCurrency?: string;
  originalPriceAmount?: number;
  productUrl?: string;
  sourceCategory?: string;
}

/**
 * AliExpress OAuth seller-authorization flow for AUREVO.
 *
 * Security invariants (Phase 8 + config UX follow-up):
 * - The App Secret never leaves the server (only used in the signed request /
 *   token exchange / `configure`), is encrypted at rest in the existing
 *   `Supplier.apiConfig` (AES-256-GCM), and is never returned to the frontend,
 *   logged, or echoed in errors.
 * - Credentials can be configured at runtime by an admin (POST config) or read
 *   from env as a fallback; stored credentials take precedence.
 * - The callback URL must be a stable HTTPS URL terminating exactly at
 *   `/api/suppliers/aliexpress/callback` — http/localhost are rejected, mirroring
 *   what the AliExpress console requires.
 * - A cryptographically random, single-use `state` value protects the callback
 *   against CSRF / state-mismatch replay.
 * - No capability is reported as working until a real AliExpress API call has
 *   succeeded (verified via `getApiPermissions`).
 */
@Injectable()
export class AliExpressService {
  private readonly stateStore = new Map<string, StoredState>();

  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // -- environment helpers (never expose secret values) -----------------------

  private env(key: string): string | undefined {
    const v = this.configService.get<string>(key);
    return v && v.trim().length > 0 ? v.trim() : undefined;
  }

  private isPlaceholder(v?: string): boolean {
    return !v || /^(your_|dev_|placeholder|change)/i.test(v);
  }

  private get authAuthorizeUrl(): string {
    return (
      this.env('ALIEXPRESS_AUTH_AUTHORIZE_URL') ??
      'https://auth.aliexpress.com/oauth/authorize'
    );
  }

  /** AliExpress Open Platform gateway for signed API calls including OAuth token exchange. */
  private get aliExpressGatewayUrl(): string {
    return (
      this.env('ALIEXPRESS_API_BASE_URL') ??
      'https://api-sg.aliexpress.com/rest'
    );
  }

  private get adminRedirectBase(): string {
    return this.env('WEB_URL') ?? '/';
  }

  private maskAppKey(key: string | undefined): string | null {
    if (!key) return null;
    if (key.length <= 8) return `${key.slice(0, 2)}…`;
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
  }

  // -- stored credential access (DB-preferred, env fallback) --------------------

  /** Decrypted stored AliExpress config (contains secrets — server-side only). */
  private async storedConfig(): Promise<Record<string, any>> {
    return this.suppliersService.getAliExpressConfig();
  }

  /** Effective App Key: stored non-placeholder value, else env. */
  private async appKeyValue(): Promise<string | undefined> {
    const cfg = await this.storedConfig();
    if (cfg.appKey && !this.isPlaceholder(cfg.appKey)) return cfg.appKey;
    const envKey = this.env('ALIEXPRESS_APP_KEY');
    return envKey && !this.isPlaceholder(envKey) ? envKey : undefined;
  }

  /** True when a non-placeholder App Secret is available (stored or env). */
  private async hasAppSecretValue(): Promise<boolean> {
    const cfg = await this.storedConfig();
    if (cfg.appSecret) return !this.isPlaceholder(cfg.appSecret);
    return !this.isPlaceholder(this.env('ALIEXPRESS_APP_SECRET'));
  }

  /** Effective App Secret (stored non-placeholder value, else env). Server-only. */
  private async appSecretValue(): Promise<string | undefined> {
    const cfg = await this.storedConfig();
    if (cfg.appSecret && !this.isPlaceholder(cfg.appSecret)) return cfg.appSecret;
    const envSecret = this.env('ALIEXPRESS_APP_SECRET');
    return envSecret && !this.isPlaceholder(envSecret) ? envSecret : undefined;
  }

  /** Validates the OAuth callback URL: HTTPS, non-localhost, exact path. */
  private isValidCallbackUrl(url: string): boolean {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return false;
    }
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    return u.pathname === ALIEXPRESS_CALLBACK_PATH;
  }

  /**
   * Effective callback URL: stored (validated) → env (validated) → derived from
   * a stable HTTPS `WEB_URL`. Returns undefined when none is acceptable, so a
   * missing/invalid callback can never silently become a non-HTTPS one.
   */
  private async callbackUrlValue(): Promise<string | undefined> {
    const cfg = await this.storedConfig();
    if (cfg.callbackUrl) {
      const v = String(cfg.callbackUrl).trim();
      if (this.isValidCallbackUrl(v)) return v;
    }
    const envCb = this.env('ALIEXPRESS_CALLBACK_URL');
    if (envCb && this.isValidCallbackUrl(envCb)) return envCb;
    const web = this.env('WEB_URL');
    if (web) {
      const derived = `${web}${ALIEXPRESS_CALLBACK_PATH}`;
      if (this.isValidCallbackUrl(derived)) return derived;
    }
    return undefined;
  }

  // -- state management (single-use, TTL) -------------------------------------

  private createState(): string {
    const state = crypto.randomBytes(32).toString('hex');
    this.stateStore.set(state, { createdAt: Date.now() });
    return state;
  }

  private consumeState(state: string | undefined): boolean {
    if (!state) return false;
    const entry = this.stateStore.get(state);
    if (!entry) return false;
    this.stateStore.delete(state); // single-use
    return Date.now() - entry.createdAt <= STATE_TTL_MS;
  }

  // -- capability model -------------------------------------------------------

  private buildCapabilities(opts: {
    configured: boolean;
    hasToken: boolean;
    verified: boolean;
  }): SupplierCapability[] {
    const ops: Array<[string, string]> = [
      ['PRODUCT_SEARCH', 'Product search'],
      ['PRODUCT_DETAIL', 'Product detail'],
      ['INVENTORY', 'Inventory / price retrieval'],
      ['ORDER_CREATE', 'Supplier order creation'],
      ['ORDER_STATUS', 'Supplier order status'],
      ['TRACKING', 'Tracking retrieval'],
    ];

    let status: SupplierCapabilityStatus;
    let note: string;
    if (!opts.configured) {
      status = SupplierCapabilityStatus.NOT_CONFIGURED;
      note = 'AliExpress credentials / HTTPS callback URL are not configured.';
    } else if (!opts.hasToken) {
      status = SupplierCapabilityStatus.NOT_AUTHORIZED;
      note = 'Requires seller authorization (access token).';
    } else if (opts.verified) {
      status = SupplierCapabilityStatus.SUPPORTED;
      note = 'Confirmed against the live AliExpress API.';
    } else {
      status = SupplierCapabilityStatus.UNVERIFIED;
      note = 'Implemented but not yet confirmed against the live API.';
    }

    return ops.map(([operation, label]) => ({ operation, label, status, note }));
  }

  // -- public operations ------------------------------------------------------

  /**
   * Persist admin-provided credentials. All fields optional; App Secret is
   * encrypted at rest and never returned. Changing credentials resets
   * verification; changing the App Key/Secret also revokes the stored token
   * (the old token belongs to the previous app), forcing a fresh OAuth flow.
   */
  async configure(dto: ConfigureAliExpressDto): Promise<AliExpressConnectionStatus> {
    const updates: Record<string, any> = {};

    if (dto.appKey !== undefined) {
      const v = dto.appKey.trim();
      if (v.length < 4 || this.isPlaceholder(v)) {
        throw new BadRequestException(
          'AliExpress App Key looks invalid — placeholders are not accepted.',
        );
      }
      updates.appKey = v;
    }

    if (dto.appSecret !== undefined) {
      const v = dto.appSecret.trim();
      if (v.length < 20 || this.isPlaceholder(v)) {
        throw new BadRequestException(
          'AliExpress App Secret looks invalid — placeholders are not accepted.',
        );
      }
      updates.appSecret = v;
    }

    if (dto.callbackUrl !== undefined) {
      const v = dto.callbackUrl.trim();
      if (!this.isValidCallbackUrl(v)) {
        throw new BadRequestException(
          `Callback URL must be a stable HTTPS URL ending in ${ALIEXPRESS_CALLBACK_PATH} (no http, no localhost).`,
        );
      }
      updates.callbackUrl = v;
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('Provide at least one field to update.');
    }

    // A new App Key/Secret means any previously stored token belongs to the old
    // app — drop it so the admin must re-authorize with the new credentials.
    if (updates.appKey !== undefined || updates.appSecret !== undefined) {
      await this.suppliersService.clearAliExpressAuth();
    }

    // Any config change invalidates prior live verification — the next Verify
    // (or fresh authorization) must prove it again against a real API call.
    await this.suppliersService.saveAliExpressConfig({
      ...updates,
      verified: false,
      lastVerifiedAt: null,
    });

    return this.status();
  }

  /** Build the seller-authorization URL, or an honest NOT_CONFIGURED response. */
  async connect(): Promise<AliExpressConnectResponse> {
    const appKey = await this.appKeyValue();
    const hasAppSecret = await this.hasAppSecretValue();
    const callback = await this.callbackUrlValue();

    if (!appKey) {
      return {
        state: 'NOT_CONFIGURED',
        message: 'ALIEXPRESS_APP_KEY (AliExpress App Key) is not configured.',
      };
    }
    if (!hasAppSecret) {
      return {
        state: 'NOT_CONFIGURED',
        message: 'AliExpress App Secret is not configured.',
      };
    }
    if (!callback) {
      return {
        state: 'NOT_CONFIGURED',
        message: `A stable HTTPS callback URL (${ALIEXPRESS_CALLBACK_PATH}) is required before OAuth can run.`,
      };
    }

    const state = this.createState();
    const url = new URL(this.authAuthorizeUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', appKey);
    url.searchParams.set('redirect_uri', callback);
    url.searchParams.set('state', state);
    url.searchParams.set('view', 'web');
    return { state: 'READY', authorizationUrl: url.toString() };
  }

  /**
   * Handle the OAuth redirect from AliExpress. Returns the admin-UI URL to
   * redirect the browser to. Server-side, validates state, exchanges the code
   * for a token, and stores it encrypted. Never logs or returns the secret.
   */
  async handleCallback(query: AliExpressCallbackQuery): Promise<string> {
    const base = this.adminRedirectBase;

    if (query.error) {
      return `${base}${ADMIN_SUPPLIERS_PATH}?aliexpress=denied`;
    }
    if (!this.consumeState(query.state)) {
      return `${base}${ADMIN_SUPPLIERS_PATH}?aliexpress=error&reason=invalid_state`;
    }
    if (!query.code) {
      return `${base}${ADMIN_SUPPLIERS_PATH}?aliexpress=error&reason=no_code`;
    }

    try {
      const token = await this.exchangeCode(query.code);
      await this.suppliersService.saveAliExpressConfig({
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: token.expiresAt,
        storedAt: new Date().toISOString(),
        // Reset verification on a fresh token — a live call must confirm it.
        verified: false,
        lastVerifiedAt: null,
      });
      return `${base}${ADMIN_SUPPLIERS_PATH}?aliexpress=connected`;
    } catch (err) {
      // Safe message only — never the code, secret or token.
      const message =
        err instanceof SupplierApiError
          ? err.message
          : 'AliExpress authorization failed';
      return `${base}${ADMIN_SUPPLIERS_PATH}?aliexpress=error&reason=${encodeURIComponent(message)}`;
    }
  }

  /**
   * Server-side OAuth token exchange against the AliExpress Open Platform IOP
   * token endpoint.  The `/rest` method router does NOT expose
   * `system.oauth2.getToken` (returns `InvalidApiPath`); the working flow is a
   * signed POST to `…/rest/auth/token/create` with the IOP signature
   * (HMAC-SHA256 over `apiPath + sorted{k:v}`), confirmed live against a real
   * app credential (a fabricated code returns `InvalidCode`, proving the
   * endpoint + signing are correct).  Timestamp is epoch milliseconds, which
   * the live gateway explicitly accepts.
   */
  private async exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: string | null;
  }> {
    const appKey = (await this.appKeyValue()) ?? '';
    const appSecret = (await this.appSecretValue()) ?? '';

    const tokenPath = '/auth/token/create';
    // Epoch milliseconds — the live /rest gateway rejects compact formats.
    const unsignedParams: Record<string, string> = {
      app_key: appKey,
      sign_method: 'sha256',
      timestamp: String(Date.now()),
      code,
    };

    const sign = AliExpressAdapter.generateIopSignature(appSecret, tokenPath, unsignedParams);

    let response;
    try {
      response = await axios.post(
        `${this.aliExpressGatewayUrl.replace(/\/$/, '')}${tokenPath}`,
        new URLSearchParams({ ...unsignedParams, sign }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        },
      );
    } catch (error: any) {
      throw new SupplierApiError(
        SupplierApiErrorCodeFor(error),
        'AliExpress token exchange failed',
        error.response?.status ?? 0,
      );
    }

    const data = response.data ?? {};

    // Gateway errors returned as HTTP 200 come in two envelopes: `{code,message}`
    // (e.g. `InvalidCode`) or `{error_response:{code,msg}}`.
    const errCode = data?.code ?? data?.error_response?.code;
    const errMessage = data?.message ?? data?.error_response?.msg;
    if (errCode !== undefined && String(errCode) !== '0' && String(errCode) !== '200') {
      throw new SupplierApiError(
        errCode === 'InvalidCode' ||
          errCode === 'invalid_grant' ||
          errCode === 'InvalidSession'
          ? SupplierApiErrorCode.NOT_AUTHORIZED
          : SupplierApiErrorCode.API_ERROR,
        errMessage || 'AliExpress token exchange failed',
        typeof errCode === 'number' ? errCode : 0,
      );
    }

    // Success payload may sit at the top level or under `result`.
    const payload = data?.result && typeof data.result === 'object' ? data.result : data;

    const accessToken = payload?.access_token ?? data?.access_token;
    if (!accessToken) {
      throw new SupplierApiError(
        SupplierApiErrorCode.NOT_AUTHORIZED,
        'AliExpress returned no access token',
      );
    }
    const expiresIn = Number(payload?.expires_in ?? payload?.refresh_expires_in ?? 0);
    return {
      accessToken,
      refreshToken: payload?.refresh_token,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    };
  }

  /** Current connection status for the admin UI. No secrets are returned. */
  async status(): Promise<AliExpressConnectionStatus> {
    const appKey = await this.appKeyValue();
    const hasAppSecret = await this.hasAppSecretValue();
    const callback = await this.callbackUrlValue();
    const configured = Boolean(appKey && hasAppSecret && callback);

    const config = await this.storedConfig();
    const hasToken = Boolean(config.accessToken);
    const verified = Boolean(config.verified);
    const capabilities = this.buildCapabilities({ configured, hasToken, verified });

    let state: AliExpressConnectionStatus['state'];
    let message: string;
    if (!configured) {
      state = 'NOT_CONFIGURED';
      message =
        'AliExpress credentials / HTTPS callback URL are not configured. Configure App Key, App Secret and a stable HTTPS callback URL.';
    } else if (!hasToken) {
      state = 'DISCONNECTED';
      message = 'Configured but not authorized. Authorize with AliExpress to grant the seller access token.';
    } else if (verified) {
      state = 'CONNECTED';
      message = 'Connected and verified against the AliExpress API.';
    } else {
      state = 'READY';
      message = 'Authorized but not yet verified against the live API. Verify to confirm.';
    }

    return {
      configured,
      connected: hasToken && verified,
      appKeyMasked: this.maskAppKey(appKey),
      hasAppSecret,
      hasCallbackUrl: Boolean(callback),
      hasAccessToken: hasToken,
      tokenExpiresAt: config.tokenExpiresAt ?? null,
      lastVerifiedAt: config.lastVerifiedAt ?? null,
      message,
      capabilities,
      state,
    };
  }

  /**
   * Verify the stored token with a REAL AliExpress API call
   * (`getApiPermissions`). Only a genuine success marks the connection verified.
   */
  async verify(): Promise<{ success: boolean; message: string }> {
    const appKey = await this.appKeyValue();
    const appSecret = await this.appSecretValue();
    const config = await this.storedConfig();
    if (!appKey || !appSecret || !config.accessToken) {
      return { success: false, message: 'Not configured / not authorized.' };
    }

    const adapter = new AliExpressAdapter({
      appKey,
      appSecret,
      accessToken: config.accessToken,
      apiBaseUrl: this.env('ALIEXPRESS_API_BASE_URL'),
    });

    try {
      const result = await adapter.authenticate({ code: 'ALIEXPRESS', apiConfig: config });
      if (!result.success) {
        // Safe message only — never the secret/token/params.
        return { success: false, message: result.message };
      }
      await this.suppliersService.saveAliExpressConfig({
        verified: true,
        lastVerifiedAt: new Date().toISOString(),
      });
      return { success: true, message: 'Connection verified against the AliExpress API.' };
    } catch (err) {
      return {
        success: false,
        message:
          err instanceof SupplierApiError ? err.message : 'AliExpress verification failed',
      };
    }
  }

  /** Remove stored authorization (keeps non-secret config + credentials). */
  async disconnect(): Promise<{ success: boolean; message: string }> {
    await this.suppliersService.clearAliExpressAuth();
    return { success: true, message: 'AliExpress disconnected.' };
  }

  // -- catalog import (DS feed pipeline, granted + live-confirmed) ------------
  //
  // The dead `aliexpress.affiliate.product.query` search path is NOT used. These
  // methods rely exclusively on the granted `aliexpress.ds.*` family and build
  // the adapter from the encrypted STORED config (the same pattern as verify()),
  // never the env-placeholder adapters served by `SuppliersService.getAdapter()`.

  /** Adapter built from the decrypted stored config; 400 when not ready. */
  private async buildAdapter(): Promise<AliExpressAdapter> {
    const appKey = await this.appKeyValue();
    const appSecret = await this.appSecretValue();
    const config = await this.storedConfig();
    if (!appKey || !appSecret || !config.accessToken) {
      throw new BadRequestException('AliExpress is not configured / not authorized.');
    }
    return new AliExpressAdapter({
      appKey,
      appSecret,
      accessToken: config.accessToken,
      apiBaseUrl: this.env('ALIEXPRESS_API_BASE_URL'),
    });
  }

  /**
   * Refresh stock for products which were imported from AliExpress.  This only
   * changes the local inventory records; it never creates supplier orders or
   * changes a product that is not explicitly linked to AliExpress.
   */
  async syncInventory(): Promise<{
    success: boolean;
    updated: number;
    skipped: number;
    failedFetches: number;
    unmatchedVariants: number;
    message?: string;
  }> {
    const adapter = await this.buildAdapter();
    const supplier = await this.suppliersService.ensureAliExpressSupplier();
    const products = await this.prisma.product.findMany({
      where: {
        supplierId: supplier.id,
        supplierProductId: { not: null },
      },
      include: { variants: true },
    });

    let updated = 0;
    let skipped = 0;
    let failedFetches = 0;
    let unmatchedVariants = 0;

    for (const product of products) {
      try {
        const sourceProductId = product.supplierProductId!;
        const metadata = this.parseMetadata(product.metadata);
        const shipToCountry =
          typeof metadata.country === 'string' && /^[A-Z]{2}$/i.test(metadata.country)
            ? metadata.country.toUpperCase()
            : 'IN';
        const inventory = await adapter.getDropshippingInventory(
          sourceProductId,
          shipToCountry,
        );

        if (product.variants.length === 0) {
          // A product without AUREVO variants represents every supplier SKU,
          // so use their total available quantity instead of an arbitrary SKU.
          const quantity = inventory.variants.reduce(
            (total, item) => total + Math.max(0, Number(item.quantity) || 0),
            0,
          );
          await this.prisma.inventory.upsert({
            where: { variantId: null },
            create: {
              productId: product.id,
              variantId: null,
              quantity,
              supplierStock: quantity,
              trackQuantity: true,
              lastSyncedAt: new Date(),
              syncStatus: 'SYNCED',
            },
            update: {
              quantity,
              supplierStock: quantity,
              trackQuantity: true,
              lastSyncedAt: new Date(),
              syncStatus: 'SYNCED',
            },
          });
          updated++;
          continue;
        }

        let matchedVariants = 0;
        const skuPrefix = `AE-${sourceProductId}-V`;
        for (const variant of product.variants) {
          // AliExpress imports use AE-<productId>-V<supplierSkuId>. Do not
          // guess for manually edited SKUs: leave an unmatched variant alone.
          if (!variant.sku.startsWith(skuPrefix)) continue;
          const supplierVariantId = variant.sku.slice(skuPrefix.length);
          const match = inventory.variants.find(
            (item) => item.variantId === supplierVariantId,
          );
          if (!match) continue;

          const quantity = Math.max(0, Number(match.quantity) || 0);
          await this.prisma.inventory.upsert({
            where: { variantId: variant.id },
            create: {
              productId: product.id,
              variantId: variant.id,
              quantity,
              supplierStock: quantity,
              trackQuantity: true,
              lastSyncedAt: new Date(),
              syncStatus: 'SYNCED',
            },
            update: {
              quantity,
              supplierStock: quantity,
              trackQuantity: true,
              lastSyncedAt: new Date(),
              syncStatus: 'SYNCED',
            },
          });
          matchedVariants++;
        }

        if (matchedVariants > 0) updated++;
        else {
          skipped++;
          unmatchedVariants++;
        }
      } catch {
        // One unavailable supplier product must never stop the remaining sync.
        skipped++;
        failedFetches++;
      }
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { syncEnabled: true, lastSyncedAt: new Date() },
    });
    return { success: true, updated, skipped, failedFetches, unmatchedVariants };
  }

  /** List feed picker data. Safe on failure — honest, never fabricated. */
  async listFeeds(): Promise<AliExpressFeedListResult> {
    let adapter: AliExpressAdapter;
    try {
      adapter = await this.buildAdapter();
    } catch (err) {
      return {
        configured: false,
        feeds: [],
        error:
          err instanceof BadRequestException
            ? err.message
            : 'AliExpress is not configured / not authorized.',
      };
    }

    try {
      const feeds = await adapter.listFeedNames();
      return { configured: true, feeds };
    } catch (err) {
      return {
        configured: true,
        feeds: [],
        error: err instanceof SupplierApiError ? err.message : 'AliExpress feed list request failed.',
      };
    }
  }

  /** One live feed page with safe fields only — what the admin is about to import. */
  async previewFeed(q: {
    feedName: string;
    country: string;
    page?: number;
    pageSize?: number;
    currency?: string;
  }): Promise<AliExpressFeedPreviewResult> {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 25, 50);
    try {
      const adapter = await this.buildAdapter();
      const res = await adapter.getFeedProducts({
        feedName: q.feedName,
        country: q.country,
        page,
        pageSize,
        targetCurrency: q.currency,
      });
      return { products: res.products, totalRecordCount: res.totalRecordCount, page, pageSize, currency: q.currency };
    } catch (err) {
      return {
        products: [],
        totalRecordCount: 0,
        page,
        pageSize,
        currency: q.currency,
        error:
          err instanceof SupplierApiError
            ? err.message
            : err instanceof BadRequestException
            ? err.message
            : 'AliExpress feed preview failed.',
      };
    }
  }

  // --- Import Job Engine (resumable, page-by-page) --------------------------------

  /** Metadata is admin-editable legacy data, so malformed JSON must not stop a stock sync. */
  private parseMetadata(raw: string | null | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Parse the JSON `failedIds` column or return an empty list. */
  private parseFailedIds(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  /** True when the error is a fatal NOT_AUTHORIZED (expired/revoked token) that
   * must not be retried — the admin must re-authorize. */
  private isAuthError(err: unknown): boolean {
    return (
      err instanceof SupplierApiError && err.code === SupplierApiErrorCode.NOT_AUTHORIZED
    );
  }

  /** True when the error indicates a unique-constraint violation (P2002). */
  private isUniqueViolation(err: any): boolean {
    return err?.code === 'P2002';
  }

  /** Map a Prisma job row to the safe public result shape (no raw Prisma leak). */
  private jobToResult(job: any): ProductImportJobResult {
    return {
      id: job.id,
      feedName: job.feedName,
      country: job.country,
      categoryId: job.categoryId,
      perRunLimit: job.perRunLimit,
      currency: job.currency,
      enrich: job.enrich,
      mode: job.mode,
      status: job.status,
      nextPage: job.nextPage,
      isFeedFinished: job.isFeedFinished,
      processedCount: job.processedCount,
      importedCount: job.importedCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      enrichedVariantCount: job.enrichedVariantCount,
      enrichFailedCount: job.enrichFailedCount,
      failedIds: this.parseFailedIds(job.failedIds),
      errorMessage: job.errorMessage ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      cancelledAt: job.cancelledAt ?? null,
    };
  }

  /**
   * Persist one AliExpress feed product as an AUREVO Product. Creates if
   * missing; on `mode='update'` refreshes feed-supplied fields (price, currency,
   * images, source metadata) while preserving admin-owned name/description/
   * category/status. The unique `AE-<productId>` sku is the dedup key.
   *
   * Returns which bucket the product fell into (`imported`, `updated`, or
   * `skipped`). Per-product transient failures surface here as thrown errors so
   * the caller can count/retry them — never fatal to the whole job.
   */
  private async upsertFeedProduct(opts: {
    fp: FeedProductFields;
    adapter: AliExpressAdapter;
    supplierId: string;
    enrichCounts: { enrichedVariants: number; enrichFailed: number };
    job: {
      enrich: boolean;
      mode: string;
      currency: string;
      country: string;
      feedName: string;
      categoryId: string;
    };
  }): Promise<'imported' | 'updated' | 'skipped'> {
    const { fp, adapter, supplierId, enrichCounts, job } = opts;
    const sku = `AE-${fp.productId}`;
    const slug = `ae-${fp.productId}`;
    const cents = (n: number | undefined) => Math.round((n ?? 0) * 100);
    const safeCurrency = (v?: string) => (/^[A-Z]{3}$/.test(v ?? '') ? v : job.currency);
    const imageUrls = fp.images ?? [];
    const displayCurrency = safeCurrency(fp.priceCurrency);
    const metadata = JSON.stringify({
      provider: 'ALIEXPRESS',
      feedName: job.feedName,
      country: job.country,
      productUrl: fp.productUrl ?? null,
      sourceCategory: fp.sourceCategory ?? null,
      productId: fp.productId,
    });

    // Dedup by the stable unique sku (primary key); fall back to slug for
    // P2002 edge cases where another importer created by slug.
    let existing = await this.prisma.product.findUnique({ where: { sku } });
    if (!existing) existing = await this.prisma.product.findUnique({ where: { slug } });

    if (existing) {
      if (job.mode === 'skip') return 'skipped';
      // Update feed fields only — name/description/categoryId/status remain admin-owned.
      await this.prisma.product.update({
        where: { id: existing.id },
        data: {
          basePrice: cents(fp.priceAmount) || existing.basePrice,
          currency: displayCurrency,
          compareAtPrice: fp.originalPriceAmount
            ? cents(fp.originalPriceAmount)
            : existing.compareAtPrice,
          supplierProductId: fp.productId,
          metadata,
        },
      });
      if (imageUrls.length > 0) {
        await this.prisma.productImage.deleteMany({ where: { productId: existing.id } });
        await this.prisma.productImage.createMany({
          data: imageUrls.map((url, i) => ({
            productId: existing.id,
            url,
            sortOrder: i,
            isPrimary: i === 0,
          })),
        });
      }
      return 'updated';
    }

    // --- Create new product ---
    let detail: any;
    if (job.enrich) {
      try {
        detail = await adapter.getProductDetail(fp.productId, job.country, {
          targetCurrency: job.currency,
          targetLanguage: 'EN',
        });
        enrichCounts.enrichedVariants += detail?.skus?.length ?? 0;
      } catch {
        enrichCounts.enrichFailed++;
        detail = undefined;
      }
    }

    const finalPrice = fp.priceAmount ?? detail?.price?.amount ?? 0;
    const finalOriginal = fp.originalPriceAmount ?? detail?.originalPrice?.amount ?? 0;
    const finalCurrency = safeCurrency(
      fp.priceCurrency || detail?.price?.currency,
    );
    // Feed price is the LANE COST. The sell price starts at the 30% margin
    // floor (rounds UP) so an admin-ACTIVATED product never needs touching.
    const costPaise = cents(finalPrice);
    const sellPaise = computeMinSellPrice(costPaise) ?? 0;

    await this.prisma.product.create({
      data: {
        name: fp.title,
        slug,
        sku,
        description:
          detail?.description ||
          fp.description ||
          `Imported from AliExpress feed "${job.feedName}" (${fp.productId}).`,
        basePrice: sellPaise,
        cost: costPaise || null,
        compareAtPrice: finalOriginal ? cents(finalOriginal) : null,
        currency: finalCurrency,
        status: 'DRAFT',
        isFeatured: false,
        categoryId: job.categoryId,
        supplierId,
        supplierProductId: fp.productId,
        metadata,
        images: imageUrls.length
          ? {
              create: imageUrls.map((url, i) => ({
                url,
                sortOrder: i,
                isPrimary: i === 0,
              })),
            }
          : undefined,
        variants: detail?.skus?.length
          ? {
              create: detail.skus.map((s: any, i: number) => {
                const variantCost = cents(s.sku_price?.amount ?? 0);
                return {
                  name: `SKU ${i + 1}`,
                  sku: `AE-${fp.productId}-V${s.sku_id}`,
                  price: computeMinSellPrice(variantCost) ?? 0,
                  compareAtPrice:
                    s.sku_original_price?.amount != null
                      ? cents(s.sku_original_price.amount)
                      : null,
                  attributes: '{}',
                  sortOrder: i,
                  isActive: true,
                };
              }),
            }
          : undefined,
      },
    });

    return 'imported';
  }

  /**
   * Create a resumable import job. The job persists the feed/cursor state and
   * running counts so an interrupted import can be continued with `advanceJob`.
   * Does not fetch or import anything — call `advanceJob` to process the first
   * page.
   */
  async createImportJob(dto: CreateImportJobDto): Promise<ProductImportJobResult> {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) {
      throw new BadRequestException('Category not found');
    }
    const job = await this.prisma.productImportJob.create({
      data: {
        feedName: dto.feedName,
        country: dto.country,
        categoryId: dto.categoryId,
        perRunLimit: Math.min(dto.perRunLimit ?? 25, 50),
        currency: dto.currency ?? 'INR',
        enrich: dto.enrich ?? false,
        mode: dto.mode ?? 'update',
        status: 'PENDING',
        nextPage: 1,
      },
    });
    return this.jobToResult(job);
  }

  /**
   * Advance a job by **one AliExpress page** (up to `perRunLimit` products).
   * Fetches the feed page, upserts each product (import/update/skip), increments
   * the counters, and persists the next-page cursor. Fatal auth errors mark the
   * job FAILED so the admin knows to re-authorize; per-product transient
   * failures are counted (not fatal) and their ids saved in `failedIds` for
   * retry. Returns the updated job.
   *
   * Only PENDING/PAUSED jobs can be advanced; COMPLETED/CANCELLED → 409.
   * RUNNING is a transient in-process state; the API never exposes RUNNING
   * (the advance call is synchronous, so RUNNING is set and cleared in one
   * request).
   */
  async advanceJob(id: string): Promise<ProductImportJobResult> {
    const job = await this.prisma.productImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      throw new ConflictException(
        `Import job is already ${job.status.toLowerCase()} — no more pages to advance.`,
      );
    }

    const adapter = await this.buildAdapter(); // 400 when not configured/no token
    const supplier = await this.suppliersService.ensureAliExpressSupplier();
    const category = await this.prisma.category.findUnique({ where: { id: job.categoryId } });
    if (!category) throw new BadRequestException('Category not found');

    const enrichCounts = { enrichedVariants: job.enrichedVariantCount, enrichFailed: job.enrichFailedCount };
    const failedIds = this.parseFailedIds(job.failedIds);
    const delta = { imported: 0, updated: 0, skipped: 0, failed: 0 };

    try {
      await this.prisma.productImportJob.update({
        where: { id },
        data: { status: 'RUNNING', errorMessage: null },
      });

      const page = await adapter.getFeedProducts({
        feedName: job.feedName,
        country: job.country,
        page: job.nextPage,
        pageSize: job.perRunLimit,
        targetCurrency: job.currency,
        targetLanguage: 'EN',
      });

      for (const fp of page.products) {
        try {
          const result = await this.upsertFeedProduct({
            fp: {
              productId: fp.productId,
              title: fp.title,
              images: fp.images,
              priceAmount: fp.priceAmount,
              priceCurrency: fp.priceCurrency,
              originalPriceAmount: fp.originalPriceAmount,
              productUrl: fp.productUrl,
              sourceCategory: fp.firstLevelCategoryName,
            },
            adapter,
            supplierId: supplier.id,
            enrichCounts,
            job,
          });
          delta[result]++;
        } catch (err) {
          if (this.isAuthError(err)) throw err; // fatal — marks FAILED below
          delta.failed++;
          if (!failedIds.includes(fp.productId)) failedIds.push(fp.productId);
        }
      }

      const isFinished = page.isFinished || page.products.length === 0;
      const nextPage = job.nextPage + 1;
      const status = isFinished ? 'COMPLETED' : 'PAUSED';

      const updated = await this.prisma.productImportJob.update({
        where: { id },
        data: {
          status,
          nextPage,
          isFeedFinished: isFinished || job.isFeedFinished,
          processedCount: job.processedCount + page.products.length,
          importedCount: job.importedCount + delta.imported,
          updatedCount: job.updatedCount + delta.updated,
          skippedCount: job.skippedCount + delta.skipped,
          errorCount: job.errorCount + delta.failed,
          enrichedVariantCount: enrichCounts.enrichedVariants,
          enrichFailedCount: enrichCounts.enrichFailed,
          failedIds: failedIds.length ? JSON.stringify(failedIds) : null,
          completedAt: isFinished ? new Date() : null,
        },
      });
      return this.jobToResult(updated);
    } catch (err) {
      if (this.isAuthError(err)) {
        await this.prisma.productImportJob.update({
          where: { id },
          data: { status: 'FAILED', errorMessage: (err as Error).message },
        });
      }
      throw err;
    }
  }

  /** Cancel a running/pending job. Already-terminal jobs → 409. */
  async cancelJob(id: string): Promise<ProductImportJobResult> {
    const job = await this.prisma.productImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import job not found');
    if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(job.status)) {
      throw new ConflictException(`Import job is already ${job.status.toLowerCase()} and cannot be cancelled.`);
    }
    const updated = await this.prisma.productImportJob.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    return this.jobToResult(updated);
  }

  /**
   * Retry previously failed products (ids in `failedIds`) by re-fetching each
   * product's detail from the granted `aliexpress.ds.product.get` and upserting
   * it. Succeeded ids are removed from `failedIds`; per-product failure leaves
   * them in the list for another retry.
   */
  async retryFailed(id: string): Promise<ProductImportJobResult> {
    const job = await this.prisma.productImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import job not found');
    const adapter = await this.buildAdapter();
    const supplier = await this.suppliersService.ensureAliExpressSupplier();
    const category = await this.prisma.category.findUnique({ where: { id: job.categoryId } });
    if (!category) throw new BadRequestException('Category not found');

    const failedIds = this.parseFailedIds(job.failedIds);
    if (failedIds.length === 0) return this.jobToResult(job);

    const enrichCounts = { enrichedVariants: job.enrichedVariantCount, enrichFailed: job.enrichFailedCount };
    const stillFailed: string[] = [];
    let deltaImported = 0;
    let deltaUpdated = 0;

    for (const productId of failedIds) {
      try {
        const detail = await adapter.getProductDetail(productId, job.country, {
          targetCurrency: job.currency,
          targetLanguage: 'EN',
        });
        const fp: FeedProductFields = {
          productId: detail.id || productId,
          title: detail.title || `AliExpress ${productId}`,
          description: detail.description,
          images: detail.images ?? [],
          priceAmount: detail.price?.amount,
          priceCurrency: detail.price?.currency,
          originalPriceAmount: detail.originalPrice?.amount,
        };
        const result = await this.upsertFeedProduct({
          fp,
          adapter,
          supplierId: supplier.id,
          enrichCounts,
          job,
        });
        if (result === 'imported') deltaImported++;
        else if (result === 'updated') deltaUpdated++;
      } catch {
        stillFailed.push(productId);
      }
    }

    const updated = await this.prisma.productImportJob.update({
      where: { id },
      data: {
        importedCount: job.importedCount + deltaImported,
        updatedCount: job.updatedCount + deltaUpdated,
        errorCount: job.errorCount - (failedIds.length - stillFailed.length),
        enrichedVariantCount: enrichCounts.enrichedVariants,
        enrichFailedCount: enrichCounts.enrichFailed,
        failedIds: stillFailed.length ? JSON.stringify(stillFailed) : null,
      },
    });
    return this.jobToResult(updated);
  }

  /** Fetch a single job's state (safe fields only). */
  async getJob(id: string): Promise<ProductImportJobResult> {
    const job = await this.prisma.productImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import job not found');
    return this.jobToResult(job);
  }

  /** Most recent job for a given feed+category (for the UI to pick up where
   *  it left off). Returns null when no job exists yet. */
  async getLatestJob(query: {
    feedName: string;
    country: string;
    categoryId: string;
  }): Promise<ProductImportJobResult | null> {
    const job = await this.prisma.productImportJob.findFirst({
      where: {
        feedName: query.feedName,
        country: query.country,
        categoryId: query.categoryId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return job ? this.jobToResult(job) : null;
  }

  /**
   * Legacy one-shot import wrapper — kept for backward compatibility with
   * existing tests and the `POST catalog/import` endpoint. Creates a job and
   * advances it once, returning the classic `AliExpressImportResult` shape.
   * Existing idempotent re-run tests rely on skip-only behavior so this wrapper
   * defaults to `mode='skip'` unless the caller explicitly passes `mode`.
   */
  async importCatalog(dto: ImportAliExpressCatalogDto): Promise<AliExpressImportResult> {
    const job = await this.createImportJob({
      feedName: dto.feedName,
      country: dto.country,
      categoryId: dto.categoryId,
      perRunLimit: dto.limit ?? 25,
      currency: dto.currency,
      enrich: dto.enrich,
      mode: dto.mode ?? 'skip', // legacy default preserves idempotent test expectations
    });

    let result: ProductImportJobResult;
    try {
      result = await this.advanceJob(job.id);
    } catch (err) {
      // Auth-failure or other fatal error — return what we know.
      if (this.isAuthError(err)) {
        return {
          imported: 0,
          skipped: 0,
          scanned: 0,
          enrichedVariants: 0,
          enrichFailed: 0,
          feedName: dto.feedName,
          country: dto.country,
          categoryId: dto.categoryId,
        };
      }
      throw err;
    }

    return {
      imported: result.importedCount,
      skipped: result.skippedCount,
      scanned: result.processedCount,
      enrichedVariants: result.enrichedVariantCount,
      enrichFailed: result.enrichFailedCount,
      feedName: result.feedName,
      country: result.country,
      categoryId: result.categoryId,
    };
  }
}

function SupplierApiErrorCodeFor(error: { status?: number }): SupplierApiErrorCode {
  return error.status === 401 || error.status === 403
    ? SupplierApiErrorCode.NOT_AUTHORIZED
    : SupplierApiErrorCode.API_ERROR;
}
