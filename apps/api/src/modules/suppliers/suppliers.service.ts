import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierCode, SupplierCredentials } from '@aurevo/shared/types';
import { AliExpressAdapter } from './adapters/aliexpress.adapter';
import { IndiaMARTAdapter } from './adapters/indiamart.adapter';
import * as crypto from 'crypto';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);
  private adapters: Map<SupplierCode, any> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.initializeAdapters();
  }

  private initializeAdapters() {
    // AliExpress
    const aliexpressKey = this.configService.get<string>('ALIEXPRESS_APP_KEY');
    const aliexpressSecret = this.configService.get<string>('ALIEXPRESS_APP_SECRET');
    const aliexpressToken = this.configService.get<string>('ALIEXPRESS_ACCESS_TOKEN');

    if (aliexpressKey && aliexpressSecret && aliexpressToken) {
      this.adapters.set(SupplierCode.ALIEXPRESS, new AliExpressAdapter({
        appKey: aliexpressKey,
        appSecret: aliexpressSecret,
        accessToken: aliexpressToken,
      }));
    }

    // IndiaMART
    const indiamartCrmId = this.configService.get<string>('INDIAMART_CRM_ID');
    const indiamartApiKey = this.configService.get<string>('INDIAMART_API_KEY');

    if (indiamartCrmId && indiamartApiKey) {
      this.adapters.set(SupplierCode.INDIAMART, new IndiaMARTAdapter({
        crmId: indiamartCrmId,
        apiKey: indiamartApiKey,
      }));
    }
  }

  private encryptConfig(config: Record<string, any>): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(
      this.configService.get<string>('ENCRYPTION_KEY')!,
      'salt',
      32
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decryptConfig(encrypted: string): Record<string, any> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(
      this.configService.get<string>('ENCRYPTION_KEY')!,
      'salt',
      32
    );
    const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedData = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return JSON.parse(decrypted.toString());
  }

  private getAdapter(code: SupplierCode) {
    const adapter = this.adapters.get(code);
    if (!adapter) {
      throw new BadRequestException(`Supplier adapter for ${code} not initialized. Check credentials.`);
    }
    return adapter;
  }

  /**
   * Credentials never leave the API. Every supplier response (list, detail,
   * create, update) is passed through this helper so the encrypted `apiConfig`
   * ciphertext — or worse, a decrypted config — is never serialized to the
   * client. Only non-secret business fields survive.
   */
  private maskSupplier<T extends { apiConfig?: string | null }>(supplier: T): Omit<T, 'apiConfig'> {
    const { apiConfig, ...rest } = supplier;
    return rest;
  }

  /** True when a config field name hints it holds a credential. */
  private isSecretField(key: string): boolean {
    const k = key.toLowerCase();
    return (
      k.includes('key') ||
      k.includes('secret') ||
      k.includes('token') ||
      k.includes('password') ||
      k.includes('credential')
    );
  }

  /**
   * Safe display form of a decrypted config: keeps non-secret fields but masks
   * the value of any `*key*` / `*secret*` / `*token*` field as `****`. The
   * admin UI can still see WHICH credentials are set (and which are blank)
   * without ever receiving their values.
   */
  private maskConfigKeys(config: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};
    for (const [k, v] of Object.entries(config ?? {})) {
      masked[k] = this.isSecretField(k) && typeof v === 'string' && v.length > 0 ? '****' : v;
    }
    return masked;
  }

  async findAll() {
    const suppliers = await this.prisma.supplier.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return suppliers.map((s) => this.maskSupplier(s));
  }

  // ---------------------------------------------------------------------------
  // AliExpress OAuth config facades (Phase 8)
  // ---------------------------------------------------------------------------
  // The AliExpress OAuth flow stores credentials (access token, expiry, etc.)
  // inside the existing encrypted `apiConfig` column using the same AES-256-GCM
  // `encryptConfig`/`decryptConfig` used everywhere else — no schema change.

  async ensureAliExpressSupplier() {
    const existing = await this.prisma.supplier.findUnique({
      where: { code: SupplierCode.ALIEXPRESS },
    });
    if (existing) return existing;
    return this.prisma.supplier.create({
      data: {
        name: 'AliExpress',
        code: SupplierCode.ALIEXPRESS,
        apiConfig: this.encryptConfig({}),
        isActive: true,
        syncEnabled: false,
      },
    });
  }

  /** Decrypted (contains secrets) AliExpress config — only used server-side. */
  async getAliExpressConfig(): Promise<Record<string, any>> {
    const supplier = await this.ensureAliExpressSupplier();
    try {
      return this.decryptConfig(supplier.apiConfig);
    } catch {
      return {};
    }
  }

  /** Merge-and-encrypt a partial update into the AliExpress supplier config. */
  async saveAliExpressConfig(partial: Record<string, any>): Promise<void> {
    const supplier = await this.ensureAliExpressSupplier();
    const current = await this.getAliExpressConfig();
    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { apiConfig: this.encryptConfig({ ...current, ...partial }) },
    });
  }

  /** Remove authorization/token fields (keeps non-secret config). */
  async clearAliExpressAuth(): Promise<void> {
    const supplier = await this.ensureAliExpressSupplier();
    const config = await this.getAliExpressConfig();
    const rest: Record<string, any> = {};
    for (const [k, v] of Object.entries(config)) {
      if (['accessToken', 'refreshToken', 'tokenExpiresAt', 'storedAt'].includes(k)) continue;
      rest[k] = v;
    }
    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { apiConfig: this.encryptConfig(rest) },
    });
  }

  // ---------------------------------------------------------------------------
  // CJdropshipping config facades (Phase 9)
  // ---------------------------------------------------------------------------
  // Same encrypted `apiConfig` pattern as AliExpress — CJ credentials and
  // access/refresh tokens are stored AES-256-GCM encrypted at rest and are
  // never returned to the frontend (only booleans + masked key are).

  async ensureCJSupplier() {
    const existing = await this.prisma.supplier.findUnique({
      where: { code: SupplierCode.CJDROPSHIPPING },
    });
    if (existing) return existing;
    return this.prisma.supplier.create({
      data: {
        name: 'CJdropshipping',
        code: SupplierCode.CJDROPSHIPPING,
        apiConfig: this.encryptConfig({}),
        isActive: true,
        syncEnabled: false,
      },
    });
  }

  /** Decrypted (contains secrets) CJ config — only used server-side. */
  async getCJConfig(): Promise<Record<string, any>> {
    const supplier = await this.ensureCJSupplier();
    try {
      return this.decryptConfig(supplier.apiConfig);
    } catch {
      return {};
    }
  }

  /** Merge-and-encrypt a partial update into the CJ supplier config. */
  async saveCJConfig(partial: Record<string, any>): Promise<void> {
    const supplier = await this.ensureCJSupplier();
    const current = await this.getCJConfig();
    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { apiConfig: this.encryptConfig({ ...current, ...partial }) },
    });
  }

  /** Remove authorization/token fields (keeps non-secret config). */
  async clearCJAuth(): Promise<void> {
    const supplier = await this.ensureCJSupplier();
    const config = await this.getCJConfig();
    const rest: Record<string, any> = {};
    for (const [k, v] of Object.entries(config)) {
      if (
        ['accessToken', 'refreshToken', 'accessTokenExpiresAt', 'refreshTokenExpiresAt', 'lastVerifiedAt'].includes(k)
      ) {
        continue;
      }
      rest[k] = v;
    }
    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { apiConfig: this.encryptConfig(rest) },
    });
  }

  async findById(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        supplierProducts: { include: { product: { select: { id: true, name: true, sku: true, status: true } } } },
        products: { select: { id: true, name: true, sku: true, status: true, basePrice: true } },
        _count: { select: { products: true, supplierProducts: true } },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    // Return the supplier with apiConfig stripped, plus a MASKED view of the
    // decrypted config so admins can see which credentials are set without
    // ever receiving their values. The plaintext config never leaves this
    // method (and never enters the response).
    let maskedConfig: Record<string, any> = {};
    if (supplier.apiConfig) {
      try {
        maskedConfig = this.maskConfigKeys(this.decryptConfig(supplier.apiConfig));
      } catch {
        // Unreadable ciphertext (key rotation, corruption): show nothing.
        maskedConfig = {};
      }
    }
    return {
      ...this.maskSupplier(supplier),
      apiConfig: maskedConfig,
    };
  }

  async create(dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Supplier with code ${dto.code} already exists`);
    }

    const encryptedConfig = this.encryptConfig(dto.apiConfig ?? {});

    const supplier = await this.prisma.supplier.create({
      data: {
        name: dto.name,
        code: dto.code,
        contact: dto.contact,
        notes: dto.notes,
        apiConfig: encryptedConfig,
        isActive: dto.isActive ?? true,
        syncEnabled: dto.syncEnabled ?? false,
      },
    });

    return this.maskSupplier(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Supplier not found');
    }

    const data: any = { ...dto };
    if (dto.apiConfig) {
      data.apiConfig = this.encryptConfig(dto.apiConfig);
    }

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data,
    });

    return this.maskSupplier(supplier);
  }

  async delete(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const hasProducts = await this.prisma.supplierProduct.count({ where: { supplierId: id } });
    if (hasProducts > 0) {
      throw new ConflictException('Cannot delete supplier with mapped products');
    }

    await this.prisma.supplier.delete({ where: { id } });
    return { message: 'Supplier deleted successfully' };
  }

  async testConnection(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const config = supplier.apiConfig ? this.decryptConfig(supplier.apiConfig) : {};
    const adapter = this.getAdapter(supplier.code as SupplierCode);

    try {
      const result = await adapter.authenticate(config);
      await this.prisma.supplier.update({
        where: { id },
        data: { lastSyncedAt: new Date() },
      });
      // `details` may carry AuthResult token fields — strip access/refresh
      // tokens before the result ever reaches the client.
      const { accessToken, refreshToken, ...safeDetails } = result ?? {};
      return { success: true, message: 'Connection successful', details: safeDetails };
    } catch (error) {
      return { success: false, message: getErrorMessage(error) };
    }
  }

  async syncCatalog(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (!supplier.syncEnabled) {
      throw new ConflictException('Sync is not enabled for this supplier');
    }

    const config = supplier.apiConfig ? this.decryptConfig(supplier.apiConfig) : {};
    const adapter = this.getAdapter(supplier.code as SupplierCode);

    try {
      const result = await adapter.searchProducts({ limit: 100 });
      // TODO: Process and store products
      await this.prisma.supplier.update({
        where: { id },
        data: { lastSyncedAt: new Date() },
      });
      return { success: true, message: 'Catalog sync completed', count: result.products?.length ?? 0 };
    } catch (error) {
      return { success: false, message: getErrorMessage(error) };
    }
  }

  async syncInventory(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const config = supplier.apiConfig ? this.decryptConfig(supplier.apiConfig) : {};
    const adapter = this.getAdapter(supplier.code as SupplierCode);

    const mappings = await this.prisma.supplierProduct.findMany({
      where: { supplierId: id },
      include: { product: { include: { inventory: true, variants: { include: { inventory: true } } } } },
    });

    let updated = 0;
    for (const mapping of mappings) {
      try {
        const result = await adapter.getInventory(mapping.supplierProductId);
        // TODO: Update inventory records
        updated++;
      } catch (error) {
        this.logger.error(`Failed to sync inventory for ${mapping.supplierProductId}:`, error);
      }
    }

    await this.prisma.supplier.update({
      where: { id },
      data: { lastSyncedAt: new Date() },
    });

    return { success: true, message: 'Inventory sync completed', updated };
  }

  async pushOrderToSupplier(supplierId: string, orderId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const config = supplier.apiConfig ? this.decryptConfig(supplier.apiConfig) : {};
    const adapter = this.getAdapter(supplier.code as SupplierCode);

    const supplierOrderItems = order.items.map(item => ({
      supplierProductId: item.supplierProductId ?? '',
      supplierVariantId: item.supplierVariantId ?? '',
      quantity: item.quantity,
    }));

    const result = await adapter.createOrder({
      orderId: order.orderNumber,
      items: supplierOrderItems,
      shippingAddress: order.shippingAddress,
    });

    return result;
  }

  async getSupplierOrderStatus(supplierId: string, supplierOrderId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const config = supplier.apiConfig ? this.decryptConfig(supplier.apiConfig) : {};
    const adapter = this.getAdapter(supplier.code as SupplierCode);

    return adapter.getOrderStatus(supplierOrderId);
  }

  async getSupplierTracking(supplierId: string, supplierOrderId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const config = supplier.apiConfig ? this.decryptConfig(supplier.apiConfig) : {};
    const adapter = this.getAdapter(supplier.code as SupplierCode);

    return adapter.getTracking(supplierOrderId);
  }

  async mapProduct(supplierId: string, data: {
    supplierProductId: string;
    supplierVariantId?: string;
    productId: string;
    variantId?: string;
    mappingData?: Record<string, any>;
  }) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const existing = await this.prisma.supplierProduct.findFirst({
      where: {
        supplierId,
        supplierProductId: data.supplierProductId,
        supplierVariantId: data.supplierVariantId ?? null,
      },
    });

    if (existing) {
      throw new ConflictException('Product already mapped to this supplier');
    }

    return this.prisma.supplierProduct.create({
      data: {
        supplierId,
        supplierProductId: data.supplierProductId,
        supplierVariantId: data.supplierVariantId,
        productId: data.productId,
        variantId: data.variantId,
        mappingData: data.mappingData ? JSON.stringify(data.mappingData) : undefined,
      },
    });
  }

  async getMappedProducts(supplierId: string) {
    return this.prisma.supplierProduct.findMany({
      where: { supplierId },
      include: {
        product: { select: { id: true, name: true, sku: true, status: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
    });
  }

  async linkProduct(supplierId: string, productId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: { supplierId },
      select: { id: true, name: true, sku: true, supplierId: true },
    });
  }

  async unlinkProduct(supplierId: string, productId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.supplierId !== supplierId) {
      throw new BadRequestException('Product is not linked to this supplier');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: { supplierId: null },
      select: { id: true, name: true, sku: true, supplierId: true },
    });
  }

  async unmapProduct(supplierId: string, mappingId: string) {
    const mapping = await this.prisma.supplierProduct.findUnique({
      where: { id: mappingId },
    });

    if (!mapping || mapping.supplierId !== supplierId) {
      throw new NotFoundException('Supplier product mapping not found');
    }

    await this.prisma.supplierProduct.delete({
      where: { id: mappingId },
    });

    return { message: 'Mapping removed successfully' };
  }
}