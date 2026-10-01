import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductStatus } from '@aurevo/shared/types';
import { computeMinSellPrice, slugify, validateMargin, MIN_MARGIN_PCT } from '@aurevo/shared';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------------------------------------
  // 30% minimum margin enforcement — service-layer source of truth
  // -----------------------------------------------------------------------

  /**
   * Hard-enforce ≥30% margin on the sell price (margin-on-sale convention).
   * Throws BadRequestException with exact floor price and margin on violation.
   * Returns computed marginPct for attachment to API responses.
   */
  private assertMargin(opts: {
    cost: number | null | undefined;
    sellPrice: number;
    label: string;
    requireCost: boolean;
    variantPrices?: number[];
  }): number {
    const { sellPrice, label, requireCost, variantPrices } = opts;
    const cost = opts.cost ?? 0;

    if (!Number.isFinite(cost) || cost <= 0) {
      if (requireCost) {
        throw new BadRequestException(
          `${label}: landed cost is required before the product can be sold (ACTIVE). ` +
          `Set cost ≥ 1 and apply a minimum ${MIN_MARGIN_PCT}% margin.`,
        );
      }
      return 0;
    }

    const check = (price: number, what: string): number => {
      const v = validateMargin(cost, price);
      if (!v.passes) {
        throw new BadRequestException(
          `${label} ${what}: ${v.marginPct.toFixed(1)}% margin — below the ${MIN_MARGIN_PCT}% floor. ` +
          `Minimum sell price for cost ${cost} paise is ${v.minSellPrice} paise.`,
        );
      }
      return v.marginPct;
    };

    const pct = check(sellPrice, 'sell price');
    for (const vp of variantPrices ?? []) check(vp, 'variant price');
    return pct;
  }

  private parseMetadata(raw: string | null | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private packageContents(raw: string | null | undefined): string | undefined {
    const value = this.parseMetadata(raw).packageContents;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private mergedMetadata(
    existing: string | null | undefined,
    supplied?: Record<string, any>,
    packageContents?: string,
  ): string | null {
    const metadata = { ...this.parseMetadata(existing), ...(supplied ?? {}) };
    if (packageContents !== undefined) {
      const cleaned = packageContents.trim();
      if (cleaned) metadata.packageContents = cleaned;
      else delete metadata.packageContents;
    }
    return Object.keys(metadata).length ? JSON.stringify(metadata) : null;
  }

  /** Keep only customer-safe fields when returning a product to the storefront. */
  private stripCost<T extends Record<string, unknown>>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;
    const { cost: _, metadata, ...rest } = obj as any;
    const packageContents = this.packageContents(metadata);
    return (packageContents ? { ...rest, packageContents } : rest) as T;
  }

  /**
   * Admin-facing read: keep the cost field AND attach a computed marginPct
   * (floor-aware, from @aurevo/shared). Legacy ACTIVE products with no cost
   * yield marginPct: null so the UI can show "no cost data".
   */
  private withMargin<T>(obj: T): T {
    const anyRow = obj as any;
    const cost = anyRow?.cost;
    const basePrice = anyRow?.basePrice;
    const hasCost = typeof cost === 'number' && Number.isFinite(cost) && cost > 0;
    const hasPrice = typeof basePrice === 'number' && Number.isFinite(basePrice) && basePrice > 0;
    const marginPct = hasCost && hasPrice ? validateMargin(cost, basePrice).marginPct : null;
    return { ...obj, packageContents: this.packageContents(anyRow?.metadata), marginPct };
  }

  async findAll(
    params: {
      page?: number;
      limit?: number;
      categoryId?: string;
      status?: ProductStatus;
      isFeatured?: boolean;
      search?: string;
      supplierId?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    opts: { admin?: boolean } = {},
  ) {
    const {
      page = 1,
      limit = 20,
      categoryId,
      status,
      isFeatured,
      search,
      supplierId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    // Cap pagination so a hostile ?limit=99999999 cannot dump the full catalog
    // in one unbounded query.
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;

    const where: any = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (status) {
      where.status = status;
    }
    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }
    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (search) {
      // Case-insensitive substring match for catalog browsing.
      // The dedicated /products/search endpoint uses tsvector ranking
      // instead; this keeps the paginated findAll compatible with
      // Prisma's query engine (no raw SQL needed here).
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { where: { isPrimary: true }, take: 1 },
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          inventory: true,
          _count: { select: { reviews: true, wishlistItems: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products.map((p) => (opts.admin ? this.withMargin(p) : this.stripCost(p))),
      meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { inventory: true } },
        inventory: true,
        reviews: {
          where: { status: 'APPROVED' },
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { reviews: true, wishlistItems: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Strip landed cost — the storefront must never see it.
    return this.stripCost(product);
  }

  async findById(id: string, opts: { admin?: boolean } = {}) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: { sortOrder: 'asc' }, include: { inventory: true } },
        inventory: true,
        supplier: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Admin reads keep the cost and attach marginPct; public reads strip cost.
    return opts.admin ? this.withMargin(product) : this.stripCost(product);
  }

  async create(dto: CreateProductDto) {
    // Generate slug if not provided
    const slug = dto.slug || slugify(dto.name);

    // Check slug uniqueness
    let existing = await this.prisma.product.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('Product with this slug already exists');
    }

    // Check SKU uniqueness
    existing = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
    if (existing) {
      throw new ConflictException('Product with this SKU already exists');
    }

    // Validate category
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Validate supplier if provided
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
    }

    // 30% margin enforcement (service-layer source of truth)
    const targetStatus = dto.status ?? 'DRAFT';
    const marginPct = this.assertMargin({
      cost: dto.cost ?? null,
      sellPrice: dto.basePrice,
      label: `"${dto.name}"`,
      requireCost: targetStatus === 'ACTIVE',
      variantPrices: dto.variants?.map((v) => v.price),
    });

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        shortDescription: dto.shortDescription,
        sku: dto.sku,
        basePrice: dto.basePrice,
        compareAtPrice: dto.compareAtPrice,
        cost: dto.cost ?? undefined,
        currency: dto.currency,
        status: dto.status ?? 'DRAFT',
        isFeatured: dto.isFeatured ?? false,
        categoryId: dto.categoryId,
        supplierId: dto.supplierId,
        supplierProductId: dto.supplierProductId,
        supplierVariantId: dto.supplierVariantId,
        metadata: this.mergedMetadata(undefined, dto.metadata, dto.packageContents) ?? undefined,
        images: dto.images?.map((img, index) => ({
          url: img.url,
          alt: img.alt,
          sortOrder: index,
          isPrimary: index === 0,
        })) ? { create: dto.images.map((img, index) => ({
          url: img.url,
          alt: img.alt,
          sortOrder: index,
          isPrimary: index === 0,
        })) } : undefined,
        variants: dto.variants?.map((v, index) => ({
          name: v.name,
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          weight: v.weight,
          dimensions: v.dimensions ? JSON.stringify(v.dimensions) : undefined,
          attributes: v.attributes ? JSON.stringify(v.attributes) : '{}',
          sortOrder: index,
          isActive: v.isActive ?? true,
        })) ? { create: dto.variants.map((v, index) => ({
          name: v.name,
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          weight: v.weight,
          dimensions: v.dimensions ? JSON.stringify(v.dimensions) : undefined,
          attributes: v.attributes ? JSON.stringify(v.attributes) : '{}',
          sortOrder: index,
          isActive: v.isActive ?? true,
        })) } : undefined,
      },
      include: {
        images: true,
        variants: { include: { inventory: true } },
        inventory: true,
      },
    });

    // Create inventory record if not tracking variants
    if (!dto.variants || dto.variants.length === 0) {
      const existing = await this.prisma.inventory.findFirst({
        where: { productId: product.id, variantId: null },
      });
      if (!existing) {
        await this.prisma.inventory.create({
          data: {
            productId: product.id,
            quantity: dto.initialQuantity ?? 0,
            lowStockThreshold: dto.lowStockThreshold ?? 10,
            trackQuantity: dto.trackQuantity ?? true,
            allowBackorder: dto.allowBackorder ?? false,
          },
        });
      }
    }

    return { ...product, marginPct };
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.slug && dto.slug !== product.slug) {
      const existing = await this.prisma.product.findUnique({ where: { slug: dto.slug } });
      if (existing) {
        throw new ConflictException('Product with this slug already exists');
      }
    }

    if (dto.sku && dto.sku !== product.sku) {
      const existing = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (existing) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
    }

    // ===== 30% MARGIN ENFORCEMENT (service-layer source of truth) =====
    const resultingStatus = dto.status ?? product.status;
    const touchesPricing =
      dto.cost !== undefined || dto.basePrice !== undefined || dto.status !== undefined;
    let marginPct = 0;
    if (touchesPricing) {
      const effectiveCost = dto.cost ?? product.cost;
      const effectivePrice = dto.basePrice ?? product.basePrice;
      let variantPrices: number[] | undefined;
      if (resultingStatus === 'ACTIVE') {
        const variants = await this.prisma.productVariant.findMany({
          where: { productId: id, isActive: true },
          select: { price: true },
        });
        variantPrices = variants.map((v) => v.price);
      }
      marginPct = this.assertMargin({
        cost: effectiveCost,
        sellPrice: effectivePrice,
        label: `"${product.name}"`,
        requireCost: resultingStatus === 'ACTIVE',
        variantPrices,
      });
    }

    const {
      initialQuantity,
      lowStockThreshold,
      trackQuantity,
      allowBackorder,
      metadata,
      packageContents,
      ...productData
    } = dto;

    if (metadata !== undefined || packageContents !== undefined) {
      (productData as any).metadata = this.mergedMetadata(product.metadata, metadata, packageContents);
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: productData,
      include: { images: true, variants: { include: { inventory: true } }, inventory: true },
    });

    // Inventory fields live on the Inventory model, not Product. Only touch the
    // product-level row (variantId = null) when the product has no variants —
    // mirroring create()'s `if (!dto.variants || length === 0)` guard.
    const hasVariants = (updated.variants?.length ?? 0) > 0;
    const invFields: {
      quantity?: number;
      lowStockThreshold?: number;
      trackQuantity?: boolean;
      allowBackorder?: boolean;
    } = {};
    if (initialQuantity !== undefined) invFields.quantity = initialQuantity;
    if (lowStockThreshold !== undefined) invFields.lowStockThreshold = lowStockThreshold;
    if (trackQuantity !== undefined) invFields.trackQuantity = trackQuantity;
    if (allowBackorder !== undefined) invFields.allowBackorder = allowBackorder;

    const shouldSyncInventory = !hasVariants && Object.keys(invFields).length > 0;
    if (shouldSyncInventory) {
      const existingInv = await this.prisma.inventory.findFirst({
        where: { productId: id, variantId: null },
      });
      if (existingInv) {
        await this.prisma.inventory.update({
          where: { id: existingInv.id },
          data: invFields,
        });
      } else {
        await this.prisma.inventory.create({
          data: {
            productId: id,
            quantity: initialQuantity ?? 0,
            lowStockThreshold: lowStockThreshold ?? 10,
            trackQuantity: trackQuantity ?? true,
            allowBackorder: allowBackorder ?? false,
            ...invFields,
          },
        });
      }

      return {
        ...(await this.prisma.product.findUnique({
          where: { id },
          include: { images: true, variants: { include: { inventory: true } }, inventory: true },
        })),
        marginPct,
      };
    }

    return { ...updated, marginPct };
  }

  /**
   * Repair imported catalog rows whose selling price is zero even though the
   * supplier has supplied a landed cost.  Never guesses at a price: records
   * with missing/zero cost are deliberately left alone for supplier review.
   *
   * Imported pricing follows the same 30% minimum-margin rule used across the
   * product service. Existing non-zero prices are never overwritten.
   */
  async repairZeroPrices(): Promise<{
    productsPriced: number;
    variantsPriced: number;
    skippedWithoutCost: number;
  }> {
    const [priceable, skippedWithoutCost] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          cost: { gt: 0 },
          OR: [
            { basePrice: { lte: 0 } },
            { variants: { some: { isActive: true, price: { lte: 0 } } } },
          ],
        },
        select: {
          id: true,
          cost: true,
          basePrice: true,
          variants: {
            where: { isActive: true, price: { lte: 0 } },
            select: { id: true },
          },
        },
      }),
      this.prisma.product.count({
        where: {
          AND: [
            { OR: [{ cost: null }, { cost: { lte: 0 } }] },
            {
              OR: [
                { basePrice: { lte: 0 } },
                { variants: { some: { isActive: true, price: { lte: 0 } } } },
              ],
            },
          ],
        },
      }),
    ]);

    const operations: any[] = priceable.flatMap((product) => {
      const sellPrice = computeMinSellPrice(product.cost ?? 0);
      if (sellPrice === null) return [];

      const updates: any[] = [];
      if (product.basePrice <= 0) {
        updates.push(
          this.prisma.product.update({
            where: { id: product.id },
            data: { basePrice: sellPrice },
          }),
        );
      }

      for (const variant of product.variants) {
        updates.push(
          this.prisma.productVariant.update({
            where: { id: variant.id },
            data: { price: sellPrice },
          }),
        );
      }
      return updates;
    });

    if (operations.length > 0) {
      await this.prisma.$transaction(operations);
    }

    return {
      productsPriced: priceable.filter((product) => product.basePrice <= 0).length,
      variantsPriced: priceable.reduce((total, product) => total + product.variants.length, 0),
      skippedWithoutCost,
    };
  }

  async delete(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check for existing orders
    const orderItems = await this.prisma.orderItem.count({ where: { productId: id } });
    if (orderItems > 0) {
      throw new ConflictException('Cannot delete product with existing orders. Archive instead.');
    }

    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted successfully' };
  }

  // Variants
  async getVariants(productId: string) {
    return this.prisma.productVariant.findMany({
      where: { productId },
      include: { inventory: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existing = await this.prisma.productVariant.findUnique({ where: { sku: dto.sku } });
    if (existing) {
      throw new ConflictException('Variant with this SKU already exists');
    }

    // 30% margin enforcement — variant prices are sell prices. Validated against
    // the parent product's cost. Required when the parent is ACTIVE.
    const marginPct = this.assertMargin({
      cost: product.cost ?? null,
      sellPrice: dto.price,
      label: `variant "${dto.name}" on "${product.name}"`,
      requireCost: product.status === 'ACTIVE',
    });

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        name: dto.name,
        sku: dto.sku,
        price: dto.price,
        compareAtPrice: dto.compareAtPrice,
        weight: dto.weight,
        dimensions: dto.dimensions ? JSON.stringify(dto.dimensions) : undefined,
        attributes: dto.attributes ? JSON.stringify(dto.attributes) : '{}',
        isActive: dto.isActive ?? true,
      },
      include: { inventory: true },
    });

    // Create inventory for variant
    await this.prisma.inventory.create({
      data: {
        productId,
        variantId: variant.id,
        quantity: dto.initialQuantity ?? 0,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
        trackQuantity: true,
        allowBackorder: false,
      },
    });

    const created = await this.prisma.productVariant.findUnique({
      where: { id: variant.id },
      include: { inventory: true },
    });
    return { ...created, marginPct };
  }

  async updateVariant(productId: string, variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    if (dto.sku && dto.sku !== variant.sku) {
      const existing = await this.prisma.productVariant.findUnique({ where: { sku: dto.sku } });
      if (existing) {
        throw new ConflictException('Variant with this SKU already exists');
      }
    }

    // 30% margin enforcement — only when the variant price itself is touched.
    let marginPct = 0;
    if (dto.price !== undefined) {
      const parent = await this.prisma.product.findUnique({ where: { id: productId } });
      if (!parent) {
        throw new NotFoundException('Product not found');
      }
      marginPct = this.assertMargin({
        cost: parent.cost ?? null,
        sellPrice: dto.price,
        label: `variant "${variant.name}" on "${parent.name}"`,
        requireCost: parent.status === 'ACTIVE',
      });
    }

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: dto,
      include: { inventory: true },
    });
    return { ...updated, marginPct };
  }

  async deleteVariant(productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const orderItems = await this.prisma.orderItem.count({ where: { variantId } });
    if (orderItems > 0) {
      throw new ConflictException('Cannot delete variant with existing orders. Set isActive to false instead.');
    }

    await this.prisma.productVariant.delete({ where: { id: variantId } });
    return { message: 'Variant deleted successfully' };
  }

  // Images
  async getImages(productId: string) {
    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addImage(productId: string, url: string, alt?: string, isPrimary = false) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const count = await this.prisma.productImage.count({ where: { productId } });

    if (isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.create({
      data: {
        productId,
        url,
        alt,
        sortOrder: count,
        isPrimary: isPrimary || count === 0,
      },
    });
  }

  async updateImage(imageId: string, data: { url?: string; alt?: string; sortOrder?: number; isPrimary?: boolean }) {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (data.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId: image.productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.update({
      where: { id: imageId },
      data,
    });
  }

  async deleteImage(imageId: string) {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    const isPrimary = image.isPrimary;
    await this.prisma.productImage.delete({ where: { id: imageId } });

    // If deleted was primary, set another as primary
    if (isPrimary) {
      const another = await this.prisma.productImage.findFirst({
        where: { productId: image.productId },
        orderBy: { sortOrder: 'asc' },
      });
      if (another) {
        await this.prisma.productImage.update({
          where: { id: another.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: 'Image deleted successfully' };
  }

  async reorderImages(productId: string, ids: string[]) {
    const updates = ids.map((id, index) =>
      this.prisma.productImage.update({
        where: { id },
        data: { sortOrder: index },
      })
    );
    await Promise.all(updates);
    return { message: 'Images reordered successfully' };
  }

  // Featured products
  async getFeatured(limit = 8) {
    return this.prisma.product.findMany({
      where: { status: 'ACTIVE', isFeatured: true },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        variants: { where: { isActive: true }, take: 1 },
        inventory: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }).then((items) => items.map((p) => this.stripCost(p)));
  }

  async getRelated(productId: string, limit = 4) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: productId },
        status: 'ACTIVE',
      },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        variants: { where: { isActive: true }, take: 1 },
        inventory: true,
      },
      take: limit,
    }).then((items) => items.map((p) => this.stripCost(p)));
  }

  /**
   * Full-text search — uses Postgres tsvector with plainto_tsquery so
   * ranking respects word-stemming and stop-word removal.  Results are
   * ordered by relevance (ts_rank) then by recency.
   */
  async search(query: string, limit = 20) {
    // Sanitise: strip any tsquery metacharacters so the user input is
    // treated as plain text, not a query operator.
    const safeQuery = query.replace(/[^\w\s'-]/g, ' ').trim();
    if (!safeQuery) return [];

    const rows: any[] = await this.prisma.$queryRaw`
      SELECT p.*,
             ts_rank(
               to_tsvector('english', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.sku,'')),
               plainto_tsquery('english', ${safeQuery})
             ) AS relevance
      FROM "products" p
      WHERE p."status" = 'ACTIVE'
        AND to_tsvector('english', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.sku,''))
            @@ plainto_tsquery('english', ${safeQuery})
      ORDER BY relevance DESC, p."createdAt" DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => {
      const { relevance, ...product } = r;
      return this.stripCost(product);
    });
  }
}
