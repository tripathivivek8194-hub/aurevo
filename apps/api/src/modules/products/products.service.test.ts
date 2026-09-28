import { ProductsService } from './products.service';

/**
 * Security regression tests for pagination bounds — an attacker must not be
 * able to request ?limit=99999999 and dump the whole catalog in one query.
 * Prisma is mocked; no DB is touched.
 */
describe('ProductsService — pagination caps', () => {
  function build() {
    const prisma: any = {
      product: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), groupBy: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      category: { findUnique: jest.fn() },
      productImage: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new ProductsService(prisma);
    return { service, prisma };
  }

  it('caps an absurd limit at 100 rows', async () => {
    const { service, prisma } = build();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 99999999 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('passes a sane limit through unchanged', async () => {
    const { service, prisma } = build();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it('reports the effective (capped) limit in the meta block', async () => {
    const { service, prisma } = build();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    const result = await service.findAll({ page: 1, limit: 1000 });
    expect(result.meta.limit).toBe(100);
  });

  it('normalizes invalid page numbers to 1', async () => {
    const { service, prisma } = build();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.findAll({ page: 0, limit: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
  });
});

describe('ProductsService — update() inventory routing', () => {
  function build() {
    const prisma: any = {
      product: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      category: { findUnique: jest.fn() },
      supplier: { findUnique: jest.fn() },
      inventory: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const service = new ProductsService(prisma);
    return { service, prisma };
  }

  const inventoryPatch = {
    trackQuantity: false,
    allowBackorder: true,
    initialQuantity: 7,
    lowStockThreshold: 3,
  };

  it('syncs inventory fields to the product-level Inventory row and does not write them onto Product', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique
      .mockResolvedValueOnce({ id: 'p1', slug: 'widget', sku: 'W-1' })
      .mockResolvedValueOnce({
        id: 'p1',
        inventory: [{ id: 'inv1', quantity: 7, lowStockThreshold: 3, trackQuantity: false, allowBackorder: true, variantId: null }],
      });
    prisma.product.update.mockResolvedValue({ id: 'p1', variants: [] });
    prisma.inventory.findFirst.mockResolvedValue({ id: 'inv1', productId: 'p1', variantId: null });
    prisma.inventory.update.mockResolvedValue({ id: 'inv1' });

    await service.update('p1', inventoryPatch);

    const productData = prisma.product.update.mock.calls[0][0].data;
    expect(productData).not.toHaveProperty('trackQuantity');
    expect(productData).not.toHaveProperty('allowBackorder');
    expect(productData).not.toHaveProperty('initialQuantity');
    expect(productData).not.toHaveProperty('lowStockThreshold');

    expect(prisma.inventory.findFirst).toHaveBeenCalledWith({
      where: { productId: 'p1', variantId: null },
    });
    expect(prisma.inventory.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: {
        quantity: 7,
        lowStockThreshold: 3,
        trackQuantity: false,
        allowBackorder: true,
      },
    });
    expect(prisma.inventory.create).not.toHaveBeenCalled();
  });

  it('leaves variant inventory untouched when the product has variants', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p2', slug: 'shirt', sku: 'S-1' });
    prisma.product.update.mockResolvedValue({
      id: 'p2',
      variants: [{ id: 'v1', inventory: { id: 'inv-v1', quantity: 20 } }],
    });

    await service.update('p2', inventoryPatch);

    const productData = prisma.product.update.mock.calls[0][0].data;
    expect(productData).not.toHaveProperty('trackQuantity');
    expect(productData).not.toHaveProperty('allowBackorder');
    expect(productData).not.toHaveProperty('initialQuantity');
    expect(productData).not.toHaveProperty('lowStockThreshold');

    expect(prisma.inventory.findFirst).not.toHaveBeenCalled();
    expect(prisma.inventory.update).not.toHaveBeenCalled();
    expect(prisma.inventory.create).not.toHaveBeenCalled();
  });
});
// -----------------------------------------------------------------------------
// 30% minimum margin enforcement � service layer (mock Prisma)
// -----------------------------------------------------------------------------

describe('ProductsService � 30% margin enforcement', () => {
  // cost = 70_000 paise (?700). Floor at MIN_MARGIN_PCT=30% ? /0.7 = 100_000.
  const COST = 70_000;
  const FLOOR = Math.ceil(COST / 0.7); // 100_000

  function buildMargin() {
    const prisma: any = {
      product: {
        findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(),
        delete: jest.fn(), groupBy: jest.fn(),
      },
      category: { findUnique: jest.fn() },
      supplier: { findUnique: jest.fn() },
      productImage: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
      productVariant: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
      inventory: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      orderItem: { count: jest.fn() },
      $transaction: jest.fn((fns: any[]) => Promise.all(fns)),
    };
    const service = new ProductsService(prisma);
    return { service, prisma };
  }

  it('returns marginPct >= 30 for an ACTIVE product priced exactly at the floor (create)', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue(null); // slug+sku unique
    prisma.category.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.product.create.mockResolvedValue({ id: 'p1', name: 'Widget' });

    const res = await service.create({
      name: 'Widget', description: 'x', sku: 'W-1', basePrice: FLOOR, cost: COST,
      currency: 'INR', categoryId: 'c1', status: 'ACTIVE',
    });

    expect(res).toMatchObject({ id: 'p1', marginPct: expect.any(Number) });
    expect((res as any).marginPct).toBeGreaterThanOrEqual(30);
  });

  it('rejects ACTIVE create priced below the 30% floor', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.category.findUnique.mockResolvedValue({ id: 'c1' });

    await expect(service.create({
      name: 'Widget', description: 'x', sku: 'W-2', basePrice: FLOOR - 1, cost: COST,
      currency: 'INR', categoryId: 'c1', status: 'ACTIVE',
    })).rejects.toThrow(/below the 30% floor/);
  });

  it('rejects ACTIVE create with no landed cost', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.category.findUnique.mockResolvedValue({ id: 'c1' });

    await expect(service.create({
      name: 'Widget', description: 'x', sku: 'W-3', basePrice: 100_000, cost: undefined,
      currency: 'INR', categoryId: 'c1', status: 'ACTIVE',
    })).rejects.toThrow(/landed cost is required/);
  });

  it('allows DRAFT create without cost (not sellable yet)', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.category.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.product.create.mockResolvedValue({ id: 'p2', name: 'Draft' });

    const res = await service.create({
      name: 'Draft', description: 'x', sku: 'W-4', basePrice: 50_000, cost: undefined,
      currency: 'INR', categoryId: 'c1', status: 'DRAFT',
    });
    expect((res as any).marginPct).toBe(0);
  });

  it('rejects ACTIVE create when a variant price is below the parent cost floor', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.category.findUnique.mockResolvedValue({ id: 'c1' });

    await expect(service.create({
      name: 'Widget', description: 'x', sku: 'W-5', basePrice: FLOOR, cost: COST,
      currency: 'INR', categoryId: 'c1', status: 'ACTIVE',
      variants: [{ name: 'S', sku: 'W-5-S', price: 1 }],
    })).rejects.toThrow(/below the 30% floor/);
  });

  it('rejects update that drops basePrice below floor on ACTIVE product', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValueOnce({ id: 'p1', slug: 'w', sku: 'W-1', name: 'W', status: 'ACTIVE', cost: COST, basePrice: FLOOR });

    await expect(service.update('p1', { basePrice: FLOOR - 1 })).rejects.toThrow(/below the 30% floor/);
  });

  it('rejects promoting DRAFT (no cost) to ACTIVE', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValueOnce({ id: 'p2', slug: 'd', sku: 'D-1', name: 'D', status: 'DRAFT', cost: null, basePrice: 50_000 });

    await expect(service.update('p2', { status: 'ACTIVE' })).rejects.toThrow(/landed cost is required/);
  });

  it('allows renaming an ACTIVE product without margin check', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValueOnce({ id: 'p1', slug: 'w', sku: 'W-1', name: 'W', status: 'ACTIVE', cost: COST, basePrice: FLOOR });
    prisma.product.update.mockResolvedValue({ id: 'p1', variants: [] });

    await expect(service.update('p1', { name: 'Renamed' })).resolves.toBeDefined();
  });

  it('rejects createVariant priced below parent cost floor', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValueOnce({ id: 'p1', name: 'Widget', status: 'ACTIVE', cost: COST });

    await expect(service.createVariant('p1', { name: 'S', sku: 'V-1', price: FLOOR - 1 })).rejects.toThrow(/below the 30% floor/);
  });

  it('rejects createVariant when parent is ACTIVE but has no cost', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValueOnce({ id: 'p2', name: 'NoCost', status: 'ACTIVE', cost: null });

    await expect(service.createVariant('p2', { name: 'S', sku: 'V-2', price: 100_000 })).rejects.toThrow(/landed cost is required/);
  });

  it('findBySlug strips the cost field from storefront responses', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', slug: 'w', cost: COST, basePrice: FLOOR });

    const res = await service.findBySlug('w');
    expect(res).not.toHaveProperty('cost');
    expect(res).toHaveProperty('basePrice');
  });

  it('findById strips the cost field from responses', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', cost: COST, basePrice: FLOOR });

    const res = await service.findById('p1');
    expect(res).not.toHaveProperty('cost');
  });

  // -------------------------------------------------------------------
  // Admin reads: the { admin: true } opt RETAINS cost and adds marginPct.
  // These power the admin form's margin readout and the list's Margin column.
  // -------------------------------------------------------------------

  it('findById(id, { admin: true }) retains cost and adds marginPct', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', cost: COST, basePrice: FLOOR });

    const res = await service.findById('p1', { admin: true });
    expect(res).toHaveProperty('cost', COST);
    expect((res as any).marginPct).toBe(30);
  });

  it('findById (no opts) must NOT leak marginPct to the storefront', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', cost: COST, basePrice: FLOOR });

    const res = await service.findById('p1');
    expect(res).not.toHaveProperty('cost');
    expect(res).not.toHaveProperty('marginPct');
  });

  it('findAll({}, { admin: true }) returns cost + marginPct on every row', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.count.mockResolvedValue(2);
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', cost: COST, basePrice: FLOOR },
      { id: 'p2', cost: COST, basePrice: Math.ceil(COST / 0.65) }, // ~35% margin
    ]);

    const result = await service.findAll({ page: 1, limit: 20 }, { admin: true });
    expect(result.data[0]).toHaveProperty('cost', COST);
    expect((result.data[0] as any).marginPct).toBe(30);
    expect(result.data[1]).toHaveProperty('cost', COST);
    expect((result.data[1] as any).marginPct).toBeGreaterThan(30);
  });

  it('findAll (no opts, storefront default) strips cost and marginPct', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', cost: COST, basePrice: FLOOR }]);

    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result.data[0]).not.toHaveProperty('cost');
    expect(result.data[0]).not.toHaveProperty('marginPct');
  });

  it('findAll admin: a legacy product with no cost yields marginPct null, not a crash', async () => {
    const { service, prisma } = buildMargin();
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', cost: null, basePrice: FLOOR }]);

    const result = await service.findAll({ page: 1, limit: 20 }, { admin: true });
    expect(result.data[0]).toHaveProperty('cost', null);
    expect((result.data[0] as any).marginPct).toBeNull();
  });
});
