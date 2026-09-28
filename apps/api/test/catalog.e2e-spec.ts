import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';

/**
 * E2E coverage for Phase 4 (Catalog & Products): categories, products,
 * variants, images, inventory, search, and admin role-gating over HTTP.
 *
 * Boots the real AppModule against the isolated `test-e2e.db`. Because Jest
 * runs spec files in parallel workers (a hazard for our single shared SQLite
 * file), jest-e2e.json forces `maxWorkers: 1` and each test provisions its own
 * category/product with a unique slug/sku, so ordering never matters.
 */
describe('AUREVO E2E (Phase 4): catalog, products, variants, inventory', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL as string;
  const admin = {
    email: ADMIN_EMAIL,
    password: 'Password123!',
    firstName: 'Admin',
    lastName: 'User',
  };

  let seq = 0;
  const unique = (prefix: string) => `${prefix}-${Date.now()}-${seq++}`;

  /** Unwraps the global `{ success, data, meta }` response envelope. */
  function dataOf<T>(res: request.Response): T {
    return res.body.data as T;
  }

  function bearer(token: string) {
    return `Bearer ${token}`;
  }

  /** Registers/logs in ADMIN_EMAIL and returns a fresh access token. */
  async function adminToken(): Promise<string> {
    const agent = request.agent(app.getHttpServer());
    // Register is idempotent here: if ADMIN_EMAIL already exists (a prior test),
    // it returns 409 which we ignore, then we log in.
    await agent.post('/api/auth/register').send(admin);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200);
    return dataOf<{ accessToken: string }>(login).accessToken;
  }

  async function customerToken(): Promise<string> {
    const email = `${unique('cust')}@test.dev`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName: 'Test', lastName: 'User' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(200);
    return dataOf<{ accessToken: string }>(login).accessToken;
  }

  /** Creates a returnable category with a unique slug. */
  async function createCategory(token: string) {
    const slug = unique('cat');
    const res = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', bearer(token))
      .send({ name: `Category ${slug}`, slug })
      .expect(201);
    return dataOf<{ id: string; slug: string }>(res);
  }

  /**
   * A valid product payload (prices in minor units/paise). `cost` is mandatory
   * for ACTIVE products (30% minimum margin rule). cost 70000 → floor 100000
   * (ceil(70000 / 0.70)), so the default basePrice 129900 passes with ~46% margin.
   */
  function productPayload(categoryId: string, overrides: Record<string, unknown> = {}) {
    const s = unique('prod');
    return {
      name: `Test Product ${s}`,
      slug: s,
      description: 'A product created by the catalog E2E suite.',
      shortDescription: 'E2E product',
      sku: unique('SKU').toUpperCase(),
      basePrice: 129900,
      cost: 70000,
      currency: 'INR',
      status: 'ACTIVE',
      categoryId,
      ...overrides,
    };
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('categories (public read, admin write)', () => {
    it('lists categories for the public', async () => {
      await request(app.getHttpServer()).get('/api/categories').expect(200);
    });

    it('creates a category only as an ADMIN (401/403/201)', async () => {
      // Unauthenticated → 401
      await request(app.getHttpServer()).post('/api/categories').send({ name: 'x', slug: 'x' }).expect(401);

      // A CUSTOMER → 403
      const customer = await customerToken();
      await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', bearer(customer))
        .send({ name: 'x', slug: 'x' })
        .expect(403);

      // ADMIN → 201, and it is then publicly retrievable by slug
      const admin = await adminToken();
      const created = await createCategory(admin);
      const found = await request(app.getHttpServer())
        .get(`/api/categories/${created.slug}`)
        .expect(200);
      expect(dataOf<{ id: string }>(found).id).toBe(created.id);
    });

    it('rejects a duplicate category slug (409)', async () => {
      const token = await adminToken();
      const created = await createCategory(token);
      const dup = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', bearer(token))
        .send({ name: 'Duplicate', slug: created.slug })
        .expect(409);
      expect(dup.body.success).toBe(false);
    });
  });

  describe('products (public read, admin write)', () => {
    it('creates an ACTIVE product with variants + images, public by slug', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);

      const payload = productPayload(cat.id, {
        isFeatured: true,
        compareAtPrice: 159900,
        initialQuantity: 25,
        lowStockThreshold: 5,
        images: [{ url: 'https://example.test/img.jpg', alt: 'primary' }],
        variants: [
          { name: 'Black / M', sku: unique('VSKU').toUpperCase(), price: 129900, attributes: { color: 'Black', size: 'M' } },
          { name: 'Black / L', sku: unique('VSKU').toUpperCase(), price: 129900, attributes: { color: 'Black', size: 'L' } },
        ],
      });

      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(payload)
        .expect(201);
      const createdData = dataOf<{ slug: string; status: string }>(created);
      expect(createdData.status).toBe('ACTIVE');

      const bySlug = await request(app.getHttpServer())
        .get(`/api/products/${createdData.slug}`)
        .expect(200);
      const detail = dataOf<{
        id: string;
        variants: { sku: string }[];
        images: { isPrimary: boolean }[];
        basePrice: number;
      }>(bySlug);
      expect(detail.basePrice).toBe(129900);
      expect(detail.variants).toHaveLength(2);
      expect(detail.images[0].isPrimary).toBe(true);
    });

    it('creates product-level inventory when a product has no variants', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const payload = productPayload(cat.id, { initialQuantity: 7, lowStockThreshold: 10 });

      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(payload)
        .expect(201);
      const { slug } = dataOf<{ slug: string }>(created);

      const inventory = await prisma.inventory.findFirst({
        where: { product: { slug }, variantId: null },
      });
      expect(inventory).not.toBeNull();
      expect(inventory?.quantity).toBe(7);
    });

    it('rejects a non-integer (fractional) basePrice with 400', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { basePrice: 1299.99 }))
        .expect(400);
    });

    it('rejects a duplicate product SKU with 409', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const first = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id))
        .expect(201);
      const sku = dataOf<{ sku: string }>(first).sku;

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { sku }))
        .expect(409);
    });

    it('rejects product writes without ADMIN (401 / 403)', async () => {
      const cat = await createCategory(await adminToken());

      await request(app.getHttpServer()).post('/api/products').send(productPayload(cat.id)).expect(401);

      const customer = await customerToken();
      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(customer))
        .send(productPayload(cat.id))
        .expect(403);
    });

    it('lists products with pagination metadata and returns featured', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/products?limit=5')
        .expect(200);
      const body = dataOf<{ data: unknown[]; meta: { total: number; limit: number; page: number } }>(list);
      expect(body.meta.limit).toBe(5);
      expect(Array.isArray(body.data)).toBe(true);

      await request(app.getHttpServer()).get('/api/products/featured?limit=3').expect(200);
    });

    it('searches active products by name', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const name = `Searchable Widget ${unique('srch')}`;
      const payload = productPayload(cat.id, { name });

      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(payload)
        .expect(201);
      const { slug } = dataOf<{ slug: string }>(created);

      const res = await request(app.getHttpServer())
        .get('/api/products/search')
        .query({ q: name })
        .expect(200);
      const results = dataOf<{ slug: string }[]>(res);
      expect(results.some((p) => p.slug === slug)).toBe(true);
    });
  });

  describe('products — 30% minimum margin enforcement', () => {
    const FLOOR_70 = Math.ceil(70000 / 0.7); // cost 70000 paise → sell floor

    it('201: ACTIVE product at/above the cost floor returns marginPct, and cost never leaks publicly', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);

      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { cost: 70000, basePrice: FLOOR_70 }))
        .expect(201);
      const { slug, marginPct } = dataOf<{ slug: string; marginPct: number }>(created);
      expect(marginPct).toBeGreaterThanOrEqual(30);

      // The storefront must never expose landed cost.
      const bySlug = await request(app.getHttpServer())
        .get(`/api/products/${slug}`)
        .expect(200);
      const detail = dataOf<Record<string, unknown>>(bySlug);
      expect(detail).not.toHaveProperty('cost');
    });

    it('400: ACTIVE product below the 30% floor is hard-rejected, naming the floor', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);

      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { cost: 70000, basePrice: FLOOR_70 - 1 }))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(String(FLOOR_70));
      expect(JSON.stringify(res.body)).toMatch(/30/);
    });

    it('400: ACTIVE product without landed cost is blocked from being sold', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { cost: undefined }))
        .expect(400);
    });

    it('201: DRAFT product without cost is allowed (not sellable yet)', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { status: 'DRAFT', cost: undefined }))
        .expect(201);
    });

    it('400: PATCH pushing an ACTIVE product below the floor is rejected', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id))
        .expect(201);
      const { id } = dataOf<{ id: string }>(created);

      await request(app.getHttpServer())
        .patch(`/api/products/${id}`)
        .set('Authorization', bearer(token))
        .send({ basePrice: 99999 }) // below floor for cost 70000
        .expect(400);
    });

    it('400: PATCH promoting a product to ACTIVE without cost is rejected', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const draft = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { status: 'DRAFT', cost: undefined }))
        .expect(201);
      const { id } = dataOf<{ id: string }>(draft);

      await request(app.getHttpServer())
        .patch(`/api/products/${id}`)
        .set('Authorization', bearer(token))
        .send({ status: 'ACTIVE' })
        .expect(400);
    });

    it('200: editing only the name of an ACTIVE product does not trigger the margin check', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id))
        .expect(201);
      const { id } = dataOf<{ id: string }>(created);

      await request(app.getHttpServer())
        .patch(`/api/products/${id}`)
        .set('Authorization', bearer(token))
        .send({ name: 'Renamed without touching pricing' })
        .expect(200);
    });

    it('400: adding a variant below the parent cost floor is rejected', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id))
        .expect(201);
      const { id } = dataOf<{ id: string }>(created);

      await request(app.getHttpServer())
        .post(`/api/products/${id}/variants`)
        .set('Authorization', bearer(token))
        .send({ name: 'Too Cheap', sku: unique('VSKU').toUpperCase(), price: FLOOR_70 - 1 })
        .expect(400);
    });
  });

  // -------------------------------------------------------------------
  // Admin-only reads: /admin/products carries cost + marginPct
  // -------------------------------------------------------------------
  describe('admin product reads (cost + marginPct)', () => {
    it('GET /admin/products returns cost and marginPct for an ADMIN', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { cost: 70000, basePrice: 100000 }))
        .expect(201);
      const { slug } = dataOf<{ slug: string }>(created);

      const list = await request(app.getHttpServer())
        .get('/api/admin/products')
        .set('Authorization', bearer(token))
        .expect(200);
      const row = dataOf<{ slug: string; cost?: number | null; marginPct?: number | null }[]>(list)
        .find((p) => p.slug === slug);
      expect(row).toBeDefined();
      expect(row!.cost).toBe(70000);
      expect(row!.marginPct).toBeGreaterThanOrEqual(30);
    });

    it('GET /admin/products/:id returns cost for an ADMIN', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { cost: 70000, basePrice: 100000 }))
        .expect(201);
      const { id } = dataOf<{ id: string }>(created);

      const detail = await request(app.getHttpServer())
        .get(`/api/admin/products/${id}`)
        .set('Authorization', bearer(token))
        .expect(200);
      const body = dataOf<{ cost?: number | null; marginPct?: number | null }>(detail);
      expect(body.cost).toBe(70000);
      expect(body.marginPct).toBeGreaterThanOrEqual(30);
    });

    it('GET /admin/products is 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/admin/products').expect(401);
    });

    it('GET /admin/products is 403 for a CUSTOMER role', async () => {
      const custToken = await customerToken();
      await request(app.getHttpServer())
        .get('/api/admin/products')
        .set('Authorization', bearer(custToken))
        .expect(403);
    });

    it('public GET /products still strips cost (storefront safety)', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { cost: 70000, basePrice: 100000 }))
        .expect(201);
      const { slug } = dataOf<{ slug: string }>(created);

      const publicRow = await request(app.getHttpServer())
        .get(`/api/products/${slug}`)
        .expect(200);
      expect(publicRow.body.data).not.toHaveProperty('cost');
      expect(publicRow.body.data).not.toHaveProperty('marginPct');
    });
  });

  describe('product variants & images (admin write)', () => {
    it('adds a variant with its own inventory and lists variants', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { initialQuantity: 3 }))
        .expect(201);
      const { id } = dataOf<{ id: string }>(created);

      const variantRes = await request(app.getHttpServer())
        .post(`/api/products/${id}/variants`)
        .set('Authorization', bearer(token))
        .send({ name: 'Blue / M', sku: unique('VSKU').toUpperCase(), price: 129900, attributes: { color: 'Blue', size: 'M' }, initialQuantity: 12 })
        .expect(201);
      const variant = dataOf<{ id: string; inventory: { quantity: number } | null }>(variantRes);
      expect(variant.inventory?.quantity).toBe(12);

      const list = await request(app.getHttpServer()).get(`/api/products/${id}/variants`).expect(200);
      expect(dataOf<unknown[]>(list).length).toBeGreaterThanOrEqual(1);
    });

    it('adds, lists, and deletes a product image', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id))
        .expect(201);
      const { id } = dataOf<{ id: string }>(created);

      const added = await request(app.getHttpServer())
        .post(`/api/products/${id}/images`)
        .set('Authorization', bearer(token))
        .send({ url: 'https://example.test/second.jpg', alt: 'second' })
        .expect(201);
      const image = dataOf<{ id: string; isPrimary: boolean }>(added);
      expect(image.isPrimary).toBe(true); // first image becomes primary

      const list = await request(app.getHttpServer()).get(`/api/products/${id}/images`).expect(200);
      expect(dataOf<unknown[]>(list).length).toBe(1);

      await request(app.getHttpServer())
        .delete(`/api/products/images/${image.id}`)
        .set('Authorization', bearer(token))
        .expect(200);
    });
  });

  describe('inventory (admin only)', () => {
    it('reports inventory for a product and adjusts quantity', async () => {
      const token = await adminToken();
      const cat = await createCategory(token);
      const created = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', bearer(token))
        .send(productPayload(cat.id, { initialQuantity: 10 }))
        .expect(201);
      const { id } = dataOf<{ id: string }>(created);

      const byProduct = await request(app.getHttpServer())
        .get(`/api/inventory/product/${id}`)
        .set('Authorization', bearer(token))
        .expect(200);
      const inv = dataOf<{ id: string; quantity: number; isLowStock: boolean }>(byProduct);
      expect(inv.quantity).toBe(10);

      await request(app.getHttpServer())
        .post(`/api/inventory/${inv.id}/adjust`)
        .set('Authorization', bearer(token))
        .send({ adjustment: -4, reason: 'E2E stock check' })
        .expect(201);

      const after = await request(app.getHttpServer())
        .get(`/api/inventory/product/${id}`)
        .set('Authorization', bearer(token))
        .expect(200);
      expect(dataOf<{ quantity: number }>(after).quantity).toBe(6);

      // A customer is forbidden from inventory endpoints (class-level guard).
      const customer = await customerToken();
      await request(app.getHttpServer())
        .get('/api/inventory')
        .set('Authorization', bearer(customer))
        .expect(403);
    });
  });
});
