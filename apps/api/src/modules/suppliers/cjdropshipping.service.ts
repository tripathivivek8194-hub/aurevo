import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { SuppliersService } from './suppliers.service';
import { CJDropshippingAdapter, CJTokenStore } from './adapters/cjdropshipping.adapter';
import { SupplierApiError } from './adapters/supplier-api.error';
import { ConfigureCJDropshippingDto } from './dto/configure-cjdropshipping.dto';
import { CreateCJImportJobDto } from './dto/cjdropshipping-import.dto';
import { SearchCJDto } from './dto/cjdropshipping-import.dto';
import {
  CJDropshippingConnectionStatus,
  CJDropshippingImportJobResult,
  CJDropshippingProductListResult,
  SupplierCapability,
  SupplierCapabilityStatus,
  SupplierApiErrorCode,
  SupplierProduct,
} from '@aurevo/shared/types';
import { computeMinSellPrice } from '@aurevo/shared';

/** Safe search result for the admin UI (no credentials). */
export interface CJSearchResult {
  configured: boolean;
  products: CJDropshippingProductListResult['products'];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}

/** Safe shipping-methods result. */
export interface CJShippingMethodsResult {
  configured: boolean;
  methods: Array<{ id: string; name: string }>;
  error?: string;
}

const CJ_SUPPLIER_CODE = 'CJDROPSHIPPING';

/**
 * CJdropshipping supplier integration for AUREVO (Phase 9).
 *
 * Security invariants (mirroring the AliExpress Phase 8 pattern):
 * - The CJ credential is a single `apiKey` (current API v2.0 auth — no app
 *   secret, no email/password). It and the access/refresh tokens are stored
 *   AES-256-GCM encrypted at rest in `Supplier.apiConfig` and are NEVER returned
 *   to the frontend, logged, or echoed in errors — only booleans and a masked
 *   api key are exposed.
 * - The access token (~15 days) is refreshed via the OFFICIAL refresh endpoint
 *   using the refresh token (~180 days). A failed refresh surfaces a clear
 *   "re-authorization required" state — never fabricated success.
 * - No capability is reported SUPPORTED until a real CJ API call has succeeded
 *   (verified against the live API). Until then it stays UNVERIFIED.
 * - Catalog import reuses the generic resumable ProductImportJob engine.
 */
@Injectable()
export class CJDropshippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly suppliersService: SuppliersService,
  ) {}

  private env(key: string): string | undefined {
    const v = this.configService.get<string>(key);
    return v && v.trim().length > 0 ? v.trim() : undefined;
  }

  private isPlaceholder(v?: string): boolean {
    return !v || /^(your_|dev_|placeholder|change|test_)/i.test(v);
  }

  private get apiBaseUrl(): string {
    return this.env('CJ_API_BASE_URL') ?? 'https://developers.cjdropshipping.com/api2.0/v1';
  }

  private maskApiKey(key: string | undefined): string | null {
    if (!key) return null;
    if (key.length <= 8) return `${key.slice(0, 2)}…`;
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
  }

  // -- stored credential access (DB-preferred, env fallback) -------------------

  private async storedConfig(): Promise<Record<string, any>> {
    return this.suppliersService.getCJConfig();
  }

  private async apiKeyValue(): Promise<string | undefined> {
    const cfg = await this.storedConfig();
    if (cfg.apiKey && !this.isPlaceholder(cfg.apiKey)) return cfg.apiKey;
    const envKey = this.env('CJ_API_KEY');
    return envKey && !this.isPlaceholder(envKey) ? envKey : undefined;
  }

  /** True when the API key is available (the only CJ auth credential). */
  private async hasCredentials(): Promise<boolean> {
    return Boolean(await this.apiKeyValue());
  }

  /** Adapter built from decrypted stored config; 400 when not configured. */
  private async buildAdapter(): Promise<CJDropshippingAdapter> {
    const apiKey = await this.apiKeyValue();
    if (!apiKey) {
      throw new BadRequestException('CJdropshipping is not configured.');
    }
    return new CJDropshippingAdapter({
      apiKey,
      baseUrl: this.apiBaseUrl,
      tokenStore: this.tokenStore(),
    });
  }

  /** Server-side token store backed by the encrypted CJ config. */
  private tokenStore(): CJTokenStore {
    return {
      getTokens: async () => {
        const c = await this.storedConfig();
        return {
          accessToken: c.accessToken ?? '',
          refreshToken: c.refreshToken ?? '',
          accessTokenExpiresAt: c.accessTokenExpiresAt ? Number(c.accessTokenExpiresAt) : undefined,
          refreshTokenExpiresAt: c.refreshTokenExpiresAt ? Number(c.refreshTokenExpiresAt) : undefined,
        };
      },
      saveTokens: async (t) => {
        await this.suppliersService.saveCJConfig({
          accessToken: t.accessToken || null,
          refreshToken: t.refreshToken || null,
          accessTokenExpiresAt: t.accessTokenExpiresAt ? String(t.accessTokenExpiresAt) : null,
          refreshTokenExpiresAt: t.refreshTokenExpiresAt ? String(t.refreshTokenExpiresAt) : null,
          lastVerifiedAt: new Date().toISOString(),
        });
      },
    };
  }

  // -- capability model (honest — SUPPORTED only after live verification) ------

  private buildCapabilities(opts: {
    configured: boolean;
    hasToken: boolean;
    verified: boolean;
  }): SupplierCapability[] {
    const ops: Array<[string, string]> = [
      ['PRODUCT_SEARCH', 'Product search / list'],
      ['PRODUCT_DETAIL', 'Product detail'],
      ['INVENTORY', 'Inventory / price retrieval'],
      ['SHIPPING', 'Shipping methods / cost'],
      ['ORDER_CREATE', 'Supplier order creation'],
      ['ORDER_STATUS', 'Supplier order status'],
      ['TRACKING', 'Tracking retrieval'],
      ['WEBHOOKS', 'Webhook events'],
    ];
    let status: SupplierCapabilityStatus;
    let note: string;
    if (!opts.configured) {
      status = SupplierCapabilityStatus.NOT_CONFIGURED;
      note = 'CJ credentials are not configured.';
    } else if (!opts.hasToken) {
      status = SupplierCapabilityStatus.NOT_AUTHORIZED;
      note = 'Requires CJ authorization (access token).';
    } else if (opts.verified) {
      status = SupplierCapabilityStatus.SUPPORTED;
      note = 'Confirmed against the live CJ API.';
    } else {
      status = SupplierCapabilityStatus.UNVERIFIED;
      note = 'Implemented but not yet confirmed against the live CJ API.';
    }
    return ops.map(([operation, label]) => ({ operation, label, status, note }));
  }

  // -- public operations -------------------------------------------------------

  /** Persist admin-provided CJ credentials. All fields optional; secrets are
   *  encrypted at rest and never returned. Changing credentials clears the
   *  stored tokens (forcing a fresh authorize). */
  async configure(dto: ConfigureCJDropshippingDto): Promise<CJDropshippingConnectionStatus> {
    const updates: Record<string, any> = {};
    if (dto.apiKey !== undefined) {
      const v = dto.apiKey.trim();
      if (v.length < 8 || this.isPlaceholder(v)) {
        throw new BadRequestException('CJ API Key looks invalid — placeholders are not accepted.');
      }
      updates.apiKey = v;
    }

    const changedCredentials = updates.apiKey !== undefined;
    await this.suppliersService.saveCJConfig(updates);
    if (changedCredentials) {
      // A changed key means the old token is stale — force a fresh authorize.
      await this.suppliersService.clearCJAuth();
    }
    return this.getStatus();
  }

  async getStatus(): Promise<CJDropshippingConnectionStatus> {
    const cfg = await this.storedConfig();
    const configured = await this.hasCredentials();
    const hasAccessToken = Boolean(cfg.accessToken);
    const hasRefreshToken = Boolean(cfg.refreshToken);
    const tokenExpiresAt = cfg.accessTokenExpiresAt ? new Date(Number(cfg.accessTokenExpiresAt)).toISOString() : null;
    const refreshTokenExpiresAt = cfg.refreshTokenExpiresAt ? new Date(Number(cfg.refreshTokenExpiresAt)).toISOString() : null;
    const apiKey = await this.apiKeyValue();

    let state: 'READY' | 'NOT_CONFIGURED' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR' = 'NOT_CONFIGURED';
    if (configured) {
      state = hasAccessToken ? 'CONNECTED' : 'DISCONNECTED';
    }

    return {
      configured,
      connected: hasAccessToken,
      apiKeyMasked: this.maskApiKey(apiKey),
      hasAccessToken,
      hasRefreshToken,
      tokenExpiresAt,
      refreshTokenExpiresAt,
      lastVerifiedAt: cfg.lastVerifiedAt ? String(cfg.lastVerifiedAt) : null,
      capabilities: this.buildCapabilities({
        configured,
        hasToken: hasAccessToken,
        verified: Boolean(cfg.verified),
      }),
      state,
      message: configured ? 'CJdropshipping is configured.' : undefined,
    };
  }

  /** Test the connection against the live CJ API (getAccessToken). Never
   *  fabricates success. Stores the resulting token set on success. */
  async verify(): Promise<{ success: boolean; message: string }> {
    try {
      const adapter = await this.buildAdapter();
      const result = await adapter.authenticate({
        code: 'CJDROPSHIPPING' as any,
        apiConfig: {},
      });
      if (result.success) {
        await this.suppliersService.saveCJConfig({ verified: true });
      }
      return { success: result.success, message: result.message };
    } catch (err) {
      // buildAdapter throws 400 when not configured — surface as a safe no-op,
      // matching the AliExpress verify behavior (never fabricate success).
      return {
        success: false,
        message:
          err instanceof BadRequestException
            ? 'CJdropshipping is not configured.'
            : err instanceof SupplierApiError
              ? err.message
              : 'CJ verification failed.',
      };
    }
  }

  /** Clear stored CJ tokens (keeps credentials so a fresh authorize can re-run). */
  async clearAuth(): Promise<void> {
    await this.suppliersService.clearCJAuth();
  }

  // -- product catalog ---------------------------------------------------------

  async searchProducts(q: SearchCJDto): Promise<CJSearchResult> {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 25, 50);
    try {
      const adapter = await this.buildAdapter();
      const res = await adapter.searchProducts({
        query: q.query,
        page,
        limit: pageSize,
        categoryId: q.cjCategoryId,
      });
      return {
        configured: true,
        products: res.products.map((p) => this.toCJProduct(p)),
        total: res.total,
        page: res.page,
        pageSize: res.limit,
      };
    } catch (err) {
      return {
        configured: true,
        products: [],
        total: 0,
        page,
        pageSize,
        error: err instanceof SupplierApiError ? err.message : 'CJ product search failed.',
      };
    }
  }

  async listCategories(): Promise<{ configured: boolean; categories: Array<{ id: string; name: string }>; error?: string }> {
    try {
      const adapter = await this.buildAdapter();
      const categories = await adapter.listProductCategories();
      return { configured: true, categories };
    } catch (err) {
      return {
        configured: true,
        categories: [],
        error: err instanceof SupplierApiError ? err.message : 'CJ category request failed.',
      };
    }
  }

  private toCJProduct(p: SupplierProduct): CJDropshippingProductListResult['products'][number] {
    return {
      productId: p.id,
      title: p.title,
      images: p.images,
      priceAmount: p.price?.amount ?? null,
      priceCurrency: p.price?.currency ?? 'USD',
      description: p.description,
      productUrl: p.shipping,
      categoryName: p.categoryName,
      variants: (p.variants ?? []).map((v) => ({
        skuCode: v.id,
        skuPrice: v.price ?? null,
        skuImage: undefined,
        attributes: v.attributes,
        stock: v.inventory ?? null,
      })),
    };
  }

  // -- import job engine (reuses ProductImportJob) -----------------------------

  private parseFailedIds(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  private isAuthError(err: unknown): boolean {
    return err instanceof SupplierApiError && err.code === SupplierApiErrorCode.NOT_AUTHORIZED;
  }

  private jobToResult(job: any): CJDropshippingImportJobResult {
    return {
      id: job.id,
      source: job.feedName,
      categoryId: job.categoryId,
      perRunLimit: job.perRunLimit,
      currency: job.currency,
      mode: job.mode,
      status: job.status,
      nextPage: job.nextPage,
      isFeedFinished: job.isFeedFinished,
      processedCount: job.processedCount,
      importedCount: job.importedCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      failedIds: this.parseFailedIds(job.failedIds),
      errorMessage: job.errorMessage ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      cancelledAt: job.cancelledAt ? job.cancelledAt.toISOString() : null,
    };
  }

  /**
   * Upsert one CJ product (parent + its variants) into AUREVO. Parent dedup key
   * is the unique `CJ-<productId>` sku; variants use `CJ-<productId>-V<skuCode>`.
   * Create → DRAFT. Update (mode='update') refreshes feed-supplied fields only
   * (price, currency, images, variants' price/stock, source metadata) while
   * preserving admin-owned name/category/status.
   */
  private async upsertCJProduct(opts: {
    p: SupplierProduct;
    supplierId: string;
    mode: string;
    currency: string;
    categoryId: string;
    source: string;
  }): Promise<'imported' | 'updated' | 'skipped'> {
    const { p, supplierId, mode, currency, categoryId, source } = opts;
    const sku = `CJ-${p.id}`;
    const slug = `cj-${p.id}`;
    const cents = (n: number | null | undefined) => Math.round((n ?? 0) * 100);
    const safeCurrency = (v?: string) => (/^[A-Z]{3}$/.test(v ?? '') ? v : currency);
    const displayCurrency = safeCurrency(p.price?.currency);
    const images = p.images ?? [];
    const metadata = JSON.stringify({
      provider: 'CJDROPSHIPPING',
      source,
      productUrl: p.shipping ?? null,
      sourceCategory: p.categoryName ?? null,
      productId: p.id,
    });
    const variants = p.variants ?? [];

    let existing = await this.prisma.product.findUnique({ where: { sku } });
    if (!existing) existing = await this.prisma.product.findUnique({ where: { slug } });

    // Upsert each variant. Feed price is the variant's lane cost — the sell
    // price created here is the 30% margin floor. On update, refresh only the
    // active state: never clobber admin-owned variant sell prices.
    const upsertVariants = (productId: string) => {
      const data = variants.map((v, i) => ({
        name: v.attributes && Object.keys(v.attributes).length
          ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' / ')
          : `SKU ${i + 1}`,
        sku: `CJ-${p.id}-V${v.id}`,
        price: computeMinSellPrice(cents(v.price)) ?? 0,
        attributes: JSON.stringify(v.attributes ?? {}),
        sortOrder: i,
        isActive: true,
        compareAtPrice: null,
      }));
      return this.prisma.$transaction(
        data.map((d) =>
          this.prisma.productVariant.upsert({
            where: { sku: d.sku },
            create: { ...d, productId },
            update: { isActive: true },
          }),
        ),
      );
    };

    if (existing) {
      if (mode === 'skip') return 'skipped';
      await this.prisma.product.update({
        where: { id: existing.id },
        data: {
          cost: cents(p.price?.amount) || existing.cost,
          currency: displayCurrency,
          supplierProductId: p.id,
          metadata,
        },
      });
      if (images.length > 0) {
        await this.prisma.productImage.deleteMany({ where: { productId: existing.id } });
        await this.prisma.productImage.createMany({
          data: images.map((url, i) => ({
            productId: existing.id,
            url,
            sortOrder: i,
            isPrimary: i === 0,
          })),
        });
      }
      if (variants.length > 0) {
        await upsertVariants(existing.id);
      }
      return 'updated';
    }

    // Create new product (DRAFT) + variants. Feed price is the lane cost; sell
    // prices start at the 30% margin floor so an admin-ACTIVATED product never
    // needs re-pricing. No cost data → blocked from ACTIVE by the service.
    const costPaise = cents(p.price?.amount);
    const sellPaise = computeMinSellPrice(costPaise) ?? 0;

    await this.prisma.product.create({
      data: {
        name: p.title,
        slug,
        sku,
        description: p.description || `Imported from CJdropshipping (${p.id}).`,
        basePrice: sellPaise,
        cost: costPaise || null,
        compareAtPrice: p.originalPrice ? cents(p.originalPrice.amount) : null,
        currency: displayCurrency,
        status: 'DRAFT',
        isFeatured: false,
        categoryId,
        supplierId,
        supplierProductId: p.id,
        metadata,
        images: images.length
          ? {
              create: images.map((url, i) => ({
                url,
                sortOrder: i,
                isPrimary: i === 0,
              })),
            }
          : undefined,
        variants: variants.length
          ? {
              create: variants.map((v, i) => ({
                name: v.attributes && Object.keys(v.attributes).length
                  ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' / ')
                  : `SKU ${i + 1}`,
                sku: `CJ-${p.id}-V${v.id}`,
                price: computeMinSellPrice(cents(v.price)) ?? 0,
                attributes: JSON.stringify(v.attributes ?? {}),
                sortOrder: i,
                isActive: true,
                compareAtPrice: null,
              })),
            }
          : undefined,
      },
    });
    return 'imported';
  }

  async createImportJob(dto: CreateCJImportJobDto): Promise<CJDropshippingImportJobResult> {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('Category not found');
    if (!dto.source || dto.source.trim().length === 0) {
      throw new BadRequestException('A search source is required.');
    }
    const job = await this.prisma.productImportJob.create({
      data: {
        feedName: dto.source.trim(),
        country: '',
        categoryId: dto.categoryId,
        perRunLimit: Math.min(dto.perRunLimit ?? 25, 50),
        currency: dto.currency ?? 'INR',
        enrich: false,
        mode: dto.mode ?? 'update',
        status: 'PENDING',
        nextPage: 1,
      },
    });
    return this.jobToResult(job);
  }

  async advanceJob(id: string): Promise<CJDropshippingImportJobResult> {
    const job = await this.prisma.productImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      throw new ConflictException(`Import job is already ${job.status.toLowerCase()} — no more pages to advance.`);
    }
    const adapter = await this.buildAdapter();
    const supplier = await this.suppliersService.ensureCJSupplier();
    const category = await this.prisma.category.findUnique({ where: { id: job.categoryId } });
    if (!category) throw new BadRequestException('Category not found');

    const failedIds = this.parseFailedIds(job.failedIds);
    const delta = { imported: 0, updated: 0, skipped: 0, failed: 0 };

    try {
      await this.prisma.productImportJob.update({
        where: { id },
        data: { status: 'RUNNING', errorMessage: null },
      });

      const res = await adapter.searchProducts({
        query: job.feedName,
        page: job.nextPage,
        limit: job.perRunLimit,
      });

      for (const p of res.products) {
        try {
          const result = await this.upsertCJProduct({
            p,
            supplierId: supplier.id,
            mode: job.mode,
            currency: job.currency,
            categoryId: job.categoryId,
            source: job.feedName,
          });
          delta[result]++;
        } catch (err) {
          if (this.isAuthError(err)) throw err;
          delta.failed++;
          if (!failedIds.includes(p.id)) failedIds.push(p.id);
        }
      }

      const isFinished = res.products.length === 0;
      const nextPage = job.nextPage + 1;
      const status = isFinished ? 'COMPLETED' : 'PAUSED';

      const updated = await this.prisma.productImportJob.update({
        where: { id },
        data: {
          status,
          nextPage,
          isFeedFinished: isFinished || job.isFeedFinished,
          processedCount: job.processedCount + res.products.length,
          importedCount: job.importedCount + delta.imported,
          updatedCount: job.updatedCount + delta.updated,
          skippedCount: job.skippedCount + delta.skipped,
          errorCount: job.errorCount + delta.failed,
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

  async cancelJob(id: string): Promise<CJDropshippingImportJobResult> {
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

  async getJob(id: string): Promise<CJDropshippingImportJobResult> {
    const job = await this.prisma.productImportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import job not found');
    return this.jobToResult(job);
  }

  async getLatestJob(query: { source: string; categoryId: string }): Promise<CJDropshippingImportJobResult | null> {
    const job = await this.prisma.productImportJob.findFirst({
      where: {
        feedName: query.source,
        country: '',
        categoryId: query.categoryId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return job ? this.jobToResult(job) : null;
  }

  // -- inventory / price sync --------------------------------------------------

  async syncInventory(maxProducts = 20): Promise<{ success: boolean; updated: number; skipped: number; message?: string }> {
    const adapter = await this.buildAdapter();
    const supplier = await this.suppliersService.ensureCJSupplier();
    // CJ imports store their supplier link directly on Product.  Older imports
    // did not create SupplierProduct rows, so reading that table leaves every
    // imported CJ product untracked even though it is linked correctly.
    const candidates = await this.prisma.product.findMany({
      where: {
        OR: [
          { supplierId: supplier.id, supplierProductId: { not: null } },
          // Backward compatibility for catalog rows imported before the
          // supplier relation was persisted. The CJ SKU prefix is the stable
          // import identity, not a user-entered guess.
          { sku: { startsWith: 'CJ-' } },
        ],
      },
      include: { variants: { include: { inventory: true } }, inventory: true },
    });
    // Run the oldest product checks first. This keeps the scheduler below its
    // request timeout while ensuring every linked product is refreshed over
    // successive runs instead of repeatedly checking only the first page.
    const lastSyncAt = (product: typeof candidates[number]) => Math.max(
      0,
      ...product.inventory.map((inventory) => inventory.lastSyncedAt?.getTime() ?? 0),
      ...product.variants.map((variant) => variant.inventory?.lastSyncedAt?.getTime() ?? 0),
    );
    const products = candidates
      .sort((left, right) => lastSyncAt(left) - lastSyncAt(right))
      .slice(0, maxProducts);
    let updated = 0;
    let skipped = 0;
    for (const product of products) {
      try {
        // Older catalog imports stored the CJ identity in the SKU only. The
        // prefix is generated by this app, so it is a safe migration path.
        const sourceProductId = product.supplierProductId ?? product.sku.slice('CJ-'.length);
        if (!sourceProductId) {
          skipped++;
          continue;
        }
        const inv = await adapter.getInventory(sourceProductId);
        const totalQuantity = inv.variants.reduce(
          (total, item) => total + Math.max(0, Number(item.quantity) || 0),
          0,
        );
        // The admin list displays product-level inventory, so update it for
        // every product, including products that also have variants.
        const productInventory = await this.prisma.inventory.findFirst({
          where: { productId: product.id, variantId: null },
          select: { id: true },
        });
        const stockUpdate = {
          quantity: totalQuantity,
          supplierStock: totalQuantity,
          trackQuantity: true,
          lastSyncedAt: new Date(),
          syncStatus: 'SYNCED',
        };
        if (productInventory) {
          await this.prisma.inventory.update({
            where: { id: productInventory.id },
            data: stockUpdate,
          });
        } else {
          await this.prisma.inventory.create({
            data: { productId: product.id, variantId: null, ...stockUpdate },
          });
        }
        if (product.variants.length > 0) {
          // Map each variant's stock by matching CJ sku code (variant sku suffix).
          for (const variant of product.variants) {
            const skuCode = variant.sku.replace(/^CJ-.*-V/, '');
            const match = inv.variants.find((v) => v.variantId === skuCode);
            if (!match) continue;
            await this.prisma.inventory.upsert({
              where: { variantId: variant.id },
              create: {
                productId: product.id,
                variantId: variant.id,
                quantity: match.quantity,
                supplierStock: match.quantity,
                trackQuantity: true,
                lastSyncedAt: new Date(),
                syncStatus: 'SYNCED',
              },
              update: {
                quantity: match.quantity,
                supplierStock: match.quantity,
                trackQuantity: true,
                lastSyncedAt: new Date(),
                syncStatus: 'SYNCED',
              },
            });
          }
        }
        // Keep older successful imports linked for all later scheduled runs.
        if (product.supplierId !== supplier.id || product.supplierProductId !== sourceProductId) {
          await this.prisma.product.update({
            where: { id: product.id },
            data: { supplierId: supplier.id, supplierProductId: sourceProductId },
          });
        }
        updated++;
      } catch {
        // Keep the last verified quantity and expose this attempt as unknown.
        await this.prisma.inventory.updateMany({
          where: { productId: product.id },
          data: { syncStatus: 'FAILED', lastSyncedAt: new Date() },
        });
        skipped++;
      }
    }
    return { success: true, updated, skipped };
  }

  // -- shipping / logistics ----------------------------------------------------

  async listShippingMethods(): Promise<CJShippingMethodsResult> {
    try {
      const adapter = await this.buildAdapter();
      const methods = await adapter.listShippingMethods();
      return { configured: true, methods };
    } catch (err) {
      return {
        configured: true,
        methods: [],
        error: err instanceof SupplierApiError ? err.message : 'CJ shipping method request failed.',
      };
    }
  }

  // -- orders (guarded — never auto-pushed) ------------------------------------

  async createOrder(dto: any): Promise<any> {
    const adapter = await this.buildAdapter();
    return adapter.createOrder(dto);
  }

  async getOrderStatus(supplierOrderId: string): Promise<any> {
    const adapter = await this.buildAdapter();
    return adapter.getOrderStatus(supplierOrderId);
  }

  async getTracking(supplierOrderId: string): Promise<any> {
    const adapter = await this.buildAdapter();
    return adapter.getTracking(supplierOrderId);
  }
}
