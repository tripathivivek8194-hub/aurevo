import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from './prisma.service';

type LegacyRow = Record<string, unknown>;

interface RecoveryCatalog {
  categories: LegacyRow[];
  suppliers: LegacyRow[];
  products: LegacyRow[];
  product_variants: LegacyRow[];
  product_images: LegacyRow[];
  inventory: LegacyRow[];
}

const asString = (value: unknown): string => String(value ?? '');
const asNullableString = (value: unknown): string | null =>
  value == null || value === '' ? null : String(value);
const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const asBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';
const asDate = (value: unknown): Date => {
  const parsed = value ? new Date(String(value)) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * Restore the catalog-only local recovery snapshot when production is pointed
 * at a fresh database. Customer, order, payment, and credential tables are not
 * part of the snapshot. Existing catalogs are never modified.
 */
export async function recoverCatalogIfEmpty(
  prisma: PrismaService,
  logger: Logger,
): Promise<void> {
  const existingProducts = await prisma.product.count();
  if (existingProducts > 0) {
    logger.log(`Catalog recovery skipped: ${existingProducts} products already exist`);
    return;
  }

  const snapshotPath = path.join(
    process.cwd(),
    'apps',
    'api',
    'prisma',
    'recovery-catalog.json',
  );

  if (!fs.existsSync(snapshotPath)) {
    logger.warn('Catalog recovery snapshot is unavailable; leaving the empty catalog unchanged');
    return;
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as RecoveryCatalog;
  if (!Array.isArray(snapshot.products) || snapshot.products.length === 0) {
    logger.warn('Catalog recovery snapshot contains no products');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const categoryIds = new Map<string, string>();
      for (const row of snapshot.categories) {
        const legacyId = asString(row.id);
        const category = await tx.category.upsert({
          where: { slug: asString(row.slug) },
          update: {},
          create: {
            id: legacyId,
            name: asString(row.name),
            slug: asString(row.slug),
            description: asNullableString(row.description),
            image: asNullableString(row.image),
            parentId: null,
            isActive: asBoolean(row.isActive),
            sortOrder: asNumber(row.sortOrder),
            createdAt: asDate(row.createdAt),
            updatedAt: asDate(row.updatedAt),
          },
        });
        categoryIds.set(legacyId, category.id);
      }

      for (const row of snapshot.categories) {
        const parentId = asNullableString(row.parentId);
        if (!parentId) continue;
        const id = categoryIds.get(asString(row.id));
        const mappedParentId = categoryIds.get(parentId);
        if (id && mappedParentId) {
          await tx.category.update({ where: { id }, data: { parentId: mappedParentId } });
        }
      }

      const supplierIds = new Map<string, string>();
      for (const row of snapshot.suppliers) {
        const legacyId = asString(row.id);
        const supplier = await tx.supplier.upsert({
          where: { code: asString(row.code) },
          update: {},
          create: {
            id: legacyId,
            name: asString(row.name),
            code: asString(row.code),
            contact: null,
            notes: 'Recovered from the local catalog snapshot; reconnect credentials before syncing.',
            apiConfig: '{}',
            isActive: asBoolean(row.isActive),
            syncEnabled: false,
            lastSyncedAt: row.lastSyncedAt ? asDate(row.lastSyncedAt) : null,
            createdAt: asDate(row.createdAt),
            updatedAt: asDate(row.updatedAt),
          },
        });
        supplierIds.set(legacyId, supplier.id);
      }

      await tx.product.createMany({
        data: snapshot.products.map((row) => ({
          id: asString(row.id),
          name: asString(row.name),
          slug: asString(row.slug),
          description: asString(row.description),
          shortDescription: asNullableString(row.shortDescription),
          sku: asString(row.sku),
          basePrice: asNumber(row.basePrice),
          compareAtPrice: row.compareAtPrice == null ? null : asNumber(row.compareAtPrice),
          cost: null,
          currency: asString(row.currency) || 'INR',
          status: asString(row.status) || 'DRAFT',
          isFeatured: asBoolean(row.isFeatured),
          categoryId: categoryIds.get(asString(row.categoryId)) ?? asString(row.categoryId),
          supplierId: row.supplierId
            ? supplierIds.get(asString(row.supplierId)) ?? null
            : null,
          supplierProductId: asNullableString(row.supplierProductId),
          supplierVariantId: asNullableString(row.supplierVariantId),
          metadata: asNullableString(row.metadata),
          createdAt: asDate(row.createdAt),
          updatedAt: asDate(row.updatedAt),
        })),
      });

      if (snapshot.product_variants.length > 0) {
        await tx.productVariant.createMany({
          data: snapshot.product_variants.map((row) => ({
            id: asString(row.id),
            productId: asString(row.productId),
            name: asString(row.name),
            sku: asString(row.sku),
            price: asNumber(row.price),
            compareAtPrice: row.compareAtPrice == null ? null : asNumber(row.compareAtPrice),
            weight: row.weight == null ? null : asNumber(row.weight),
            dimensions: asNullableString(row.dimensions),
            attributes: asString(row.attributes) || '{}',
            sortOrder: asNumber(row.sortOrder),
            isActive: asBoolean(row.isActive),
            createdAt: asDate(row.createdAt),
            updatedAt: asDate(row.updatedAt),
          })),
        });
      }

      await tx.productImage.createMany({
        data: snapshot.product_images.map((row) => ({
          id: asString(row.id),
          productId: asString(row.productId),
          url: asString(row.url),
          alt: asNullableString(row.alt),
          sortOrder: asNumber(row.sortOrder),
          isPrimary: asBoolean(row.isPrimary),
          createdAt: asDate(row.createdAt),
        })),
      });

      if (snapshot.inventory.length > 0) {
        await tx.inventory.createMany({
          data: snapshot.inventory.map((row) => ({
            id: asString(row.id),
            productId: asString(row.productId),
            variantId: asNullableString(row.variantId),
            quantity: asNumber(row.quantity),
            reservedQuantity: asNumber(row.reservedQuantity),
            lowStockThreshold: asNumber(row.lowStockThreshold, 10),
            trackQuantity: asBoolean(row.trackQuantity),
            allowBackorder: asBoolean(row.allowBackorder),
            supplierStock: row.supplierStock == null ? null : asNumber(row.supplierStock),
            lastSyncedAt: row.lastSyncedAt ? asDate(row.lastSyncedAt) : null,
            syncStatus: asNullableString(row.syncStatus) ?? 'PENDING',
            createdAt: asDate(row.createdAt),
            updatedAt: asDate(row.updatedAt),
          })),
        });
      }
    },
    { timeout: 60_000 },
  );

  const activeProducts = await prisma.product.count({ where: { status: 'ACTIVE' } });
  logger.log(
    `Catalog recovery completed: ${snapshot.products.length} products restored (${activeProducts} active)`,
  );
}
