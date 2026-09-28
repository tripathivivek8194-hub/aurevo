import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';

/**
 * E2E coverage for Phase 5 (Cart & Checkout).
 *
 * The test DB is built by global-setup (fresh migrations, no seed data), so all
 * fixture data — admin, category, products, shipping method — is created through
 * the real admin API in `beforeAll`. The cart/checkout behavior is then driven
 * over HTTP against the full `AppModule`, matching the plan's Verification
 * Strategy step 4.
 *
 * Money everywhere is integer paise/cents: product prices, shipping costs, and
 * checkout subtotal/tax/total are asserted as integers.
 */
describe('AUREVO E2E (Phase 5): cart & checkout', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL as string;
  // NB: admin password must match catalog.e2e-spec.ts / app.e2e-spec.ts. Those
  // specs register ADMIN_EMAIL idempotently and log in with Password123, so all
  // spec files must agree on this password regardless of jest execution order.
  const admin = {
    email: ADMIN_EMAIL,
    password: 'Password123!',
    firstName: 'Admin',
    lastName: 'Owner',
  };

  // Token + fixture ids captured in beforeAll so tests stay self-contained.
  let adminToken = '';
  let categoryId = '';
  let activeProductId = '';
  let outOfStockProductId = '';
  let draftProductId = '';
  let shippingMethodId = '';

  // Active product price (paise) and shipping base cost used by the totals math.
  const ACTIVE_PRICE = 100000; // ₹1,000.00
  const SHIPPING_BASE_COST = 9900; // ₹99.00
  const TAX_RATE = 0.18;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);

    // Wipe any user rows a prior spec (app.e2e-spec.ts) left behind so this
    // spec is self-contained regardless of jest's file execution order. This is
    // safe because this spec's own beforeEach never resets users.
    await prisma.revokedToken.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});

    // Admin (ADMIN_EMAIL promoter) for all fixture creation.
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(admin)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200);
    adminToken = dataOf<{ accessToken: string }>(login).accessToken;
    const authHeader = bearer(adminToken);

    // Category.
    const cat = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', authHeader)
      .send({ name: 'Cart Test', slug: 'cart-test' })
      .expect(201);
    categoryId = dataOf<{ id: string }>(cat).id;

    // Products. Non-variant products create a product-level inventory row whose
    // quantity comes from `initialQuantity` (default 0 → out of stock).
    const p1 = await createProduct({
      name: 'Cart Shirt',
      slug: 'cart-shirt',
      sku: 'CRT-001',
      basePrice: ACTIVE_PRICE,
      status: 'ACTIVE',
      initialQuantity: 10,
    });
    activeProductId = p1.id;

    const p2 = await createProduct({
      name: 'Sold Out Shirt',
      slug: 'sold-out-shirt',
      sku: 'CRT-002',
      basePrice: 50000,
      status: 'ACTIVE',
      initialQuantity: 0,
    });
    outOfStockProductId = p2.id;

    const p3 = await createProduct({
      name: 'Draft Shirt',
      slug: 'draft-shirt',
      sku: 'CRT-003',
      basePrice: 50000,
      status: 'DRAFT',
      initialQuantity: 5,
    });
    draftProductId = p3.id;

    // Shipping method (admin-gated create).
    const sm = await request(app.getHttpServer())
      .post('/api/shipping/methods')
      .set('Authorization', authHeader)
      .send({
        name: 'Standard Test',
        code: 'std-test',
        baseCost: SHIPPING_BASE_COST,
        estimatedDays: 5,
        currency: 'INR',
        isActive: true,
      })
      .expect(201);
    shippingMethodId = dataOf<{ id: string }>(sm).id;

    async function createProduct(body: any) {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', authHeader)
        .send({
          description: 'Test product',
          currency: 'INR',
          categoryId,
          trackQuantity: true,
          allowBackorder: false,
          ...body,
        })
        .expect(201);
      return dataOf<{ id: string }>(res);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset cart state + un-reserve inventory so every test starts clean.
    // NB: users are NOT reset here — the admin/customer fixtures must persist.
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    const initial: Record<string, number> = {
      [activeProductId]: 10,
      [outOfStockProductId]: 0,
      [draftProductId]: 5,
    };
    for (const [productId, quantity] of Object.entries(initial)) {
      await prisma.inventory.updateMany({
        where: { productId },
        data: { quantity, reservedQuantity: 0 },
      });
    }
  });

  // M4 hardening requires guest session ids to be real UUIDs.
  const SESSION = '8f0a0f42-0000-4000-8000-000000000001';

  /** Unwraps the global `{ success, data, meta }` response envelope. */
  function dataOf<T>(res: request.Response): T {
    return res.body.data as T;
  }

  function bearer(token: string): string {
    return `Bearer ${token}`;
  }

  /** Registers+logs in a fresh customer, returning the access token. */
  async function registerAndLogin(email: string) {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName: 'Cust', lastName: 'User' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(200);
    return dataOf<{ accessToken: string }>(res).accessToken;
  }

  const validAddress = () => ({
    firstName: 'John',
    lastName: 'Doe',
    address1: '123 Main Street',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'US',
    phone: '+1-555-123-4567',
  });

  describe('guest cart lifecycle', () => {
    it('adds, summarizes, updates, removes and clears a session cart', async () => {
      // Empty cart on first touch.
      const empty = await request(app.getHttpServer())
        .get('/api/cart?sessionId=' + SESSION)
        .expect(200);
      expect(dataOf<{ items: any[] }>(empty).items).toEqual([]);

      // Add 2 units.
      const add = await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 2 })
        .expect(201);
      const itemId = dataOf<{ id: string }>(add).id;
      expect(dataOf<{ quantity: number }>(add).quantity).toBe(2);

      // Summary reflects subtotal + count (2 × 100000).
      const summary = await request(app.getHttpServer())
        .get('/api/cart/summary?sessionId=' + SESSION)
        .expect(200);
      expect(dataOf<{ itemCount: number; subtotal: number }>(summary)).toMatchObject({
        itemCount: 2,
        subtotal: 2 * ACTIVE_PRICE,
      });

      // Update quantity to 3.
      const updated = await request(app.getHttpServer())
        .patch('/api/cart/items/' + itemId + '?sessionId=' + SESSION)
        .send({ quantity: 3 })
        .expect(200);
      expect(dataOf<{ quantity: number }>(updated).quantity).toBe(3);

      // Remove the item.
      const removed = await request(app.getHttpServer())
        .delete('/api/cart/items/' + itemId + '?sessionId=' + SESSION)
        .expect(200);
      expect(dataOf<{ message: string }>(removed).message).toBeDefined();

      // Re-add, then clear the whole cart.
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 1 })
        .expect(201);
      await request(app.getHttpServer())
        .delete('/api/cart?sessionId=' + SESSION)
        .expect(200);
      const cleared = await request(app.getHttpServer())
        .get('/api/cart/summary?sessionId=' + SESSION)
        .expect(200);
      expect(dataOf<{ itemCount: number }>(cleared).itemCount).toBe(0);
    });

    it('accumulates quantity when the same product is added twice', async () => {
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 2 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 3 })
        .expect(201);

      const cart = await request(app.getHttpServer())
        .get('/api/cart?sessionId=' + SESSION)
        .expect(200);
      const items = dataOf<{ items: { quantity: number }[] }>(cart).items;
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(5);
    });

    it('rejects adding an out-of-stock product with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: outOfStockProductId, quantity: 1 })
        .expect(409);
    });

    it('rejects adding an inactive (DRAFT) product with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: draftProductId, quantity: 1 })
        .expect(409);
    });

    it('rejects a request with neither userId nor sessionId (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/cart')
        .send({ productId: activeProductId, quantity: 1 })
        .expect(400);
    });
  });

  describe('checkout preview', () => {
    it('computes integer-paise subtotal, rounded tax, shipping and total', async () => {
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 2 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(
          '/api/checkout/preview?sessionId=' + SESSION +
          '&shippingMethodId=' + shippingMethodId,
        )
        .expect(200);

      const subtotal = 2 * ACTIVE_PRICE;
      const tax = Math.round(subtotal * TAX_RATE);
      const total = subtotal + SHIPPING_BASE_COST + tax;

      const preview = dataOf<{
        subtotal: number;
        shippingCost: number;
        tax: number;
        total: number;
      }>(res);
      expect(preview).toMatchObject({
        subtotal,
        shippingCost: SHIPPING_BASE_COST,
        tax,
        total,
      });
      // No fractional paise anywhere.
      expect(Number.isInteger(preview.subtotal)).toBe(true);
      expect(Number.isInteger(preview.tax)).toBe(true);
      expect(Number.isInteger(preview.total)).toBe(true);
    });
  });

  describe('create order', () => {
    it('creates a PAYMENT_PENDING order, reserves inventory and clears the cart', async () => {
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 2 })
        .expect(201);

      const subtotal = 2 * ACTIVE_PRICE;
      const tax = Math.round(subtotal * TAX_RATE);
      const expectedTotal = subtotal + SHIPPING_BASE_COST + tax;

      const orderRes = await request(app.getHttpServer())
        .post('/api/checkout?sessionId=' + SESSION)
        .send({
          email: 'buyer@test.dev',
          shippingAddress: validAddress(),
          shippingMethodId,
        })
        .expect(201);

      const order = dataOf<{
        order: { id: string; orderNumber: string; status: string; total: number; currency: string };
      }>(orderRes).order;
      expect(order).toMatchObject({
        status: 'PAYMENT_PENDING',
        total: expectedTotal,
        currency: 'INR',
      });
      expect(order.id).toBeDefined();
      expect(order.orderNumber).toBeDefined();

      // Inventory was reserved for 2 units.
      const inventory = await prisma.inventory.findFirst({
        where: { productId: activeProductId },
      });
      expect(inventory?.reservedQuantity).toBe(2);

      // S3: Guest orders require sessionId for access (IDOR fix).
      const byId = await request(app.getHttpServer())
        .get('/api/checkout/' + order.id + '?sessionId=' + SESSION)
        .expect(200);
      const fetched = dataOf<{ orderNumber: string; items: any[] }>(byId);
      expect(fetched.orderNumber).toBe(order.orderNumber);
      expect(fetched.items).toHaveLength(1);

      const byNumber = await request(app.getHttpServer())
        .get('/api/checkout/number/' + order.orderNumber + '?sessionId=' + SESSION)
        .expect(200);

      // Cart is cleared after the order is placed.
      const cart = await request(app.getHttpServer())
        .get('/api/cart?sessionId=' + SESSION)
        .expect(200);
      expect(dataOf<{ items: any[] }>(cart).items).toEqual([]);

      // GET by order number returns the order object directly (data = order).
      expect(dataOf<{ total: number }>(byNumber).total).toBe(expectedTotal);
    });

    // S3: Verify the IDOR fix — guest order reads require the correct sessionId.
    it('S3: guest order access denied without sessionId (404)', async () => {
      // Place a guest order.
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 1 })
        .expect(201);

      const orderRes = await request(app.getHttpServer())
        .post('/api/checkout?sessionId=' + SESSION)
        .send({ email: 'idor@test.dev', shippingAddress: validAddress(), shippingMethodId })
        .expect(201);

      const order = dataOf<{ order: { id: string; orderNumber: string } }>(orderRes).order;

      // Without sessionId → 404.
      await request(app.getHttpServer())
        .get('/api/checkout/' + order.id)
        .expect(404);

      await request(app.getHttpServer())
        .get('/api/checkout/number/' + order.orderNumber)
        .expect(404);

      // With wrong sessionId → 404.
      await request(app.getHttpServer())
        .get('/api/checkout/' + order.id + '?sessionId=wrong-session-id')
        .expect(404);

      // With correct sessionId → 200.
      await request(app.getHttpServer())
        .get('/api/checkout/' + order.id + '?sessionId=' + SESSION)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/checkout/number/' + order.orderNumber + '?sessionId=' + SESSION)
        .expect(200);
    });

    it('refuses to place an order from an empty cart (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/checkout?sessionId=' + SESSION)
        .send({ email: 'buyer@test.dev', shippingAddress: validAddress() })
        .expect(400);
    });

    it('rejects an invalid shipping address with 400 via the ValidationPipe', async () => {
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 1 })
        .expect(201);

      const bad = validAddress();
      delete (bad as any).city;
      await request(app.getHttpServer())
        .post('/api/checkout?sessionId=' + SESSION)
        .send({ email: 'buyer@test.dev', shippingAddress: bad })
        .expect(400);
    });
  });

  describe('concurrent checkout does not over-commit inventory (TOCTOU)', () => {
    it('allows only as many concurrent orders as there is available stock', async () => {
      // Low stock: only 2 units of the active product.
      await prisma.inventory.updateMany({
        where: { productId: activeProductId },
        data: { quantity: 2, reservedQuantity: 0 },
      });

      const fill = (sessionId: string) =>
        request(app.getHttpServer())
          .post('/api/cart?sessionId=' + sessionId)
          .send({ productId: activeProductId, quantity: 2 })
          .expect(201);

      // Two independent guest carts each book the full remaining stock, so
      // total demand (4) exceeds available (2). Both carts fill while stock is
      // unreserved, so validation can pass for both before either reserves.
      // (session ids are real UUIDs to satisfy the M4 guest-cart gate)
      await fill('8f0a0f42-0000-4000-8000-000000000002');
      await fill('8f0a0f42-0000-4000-8000-000000000003');

      // Fire both checkouts concurrently.
      const statuses = await Promise.all([
        request(app.getHttpServer())
          .post('/api/checkout?sessionId=' + '8f0a0f42-0000-4000-8000-000000000002')
          .send({ email: 'race-a@test.dev', shippingAddress: validAddress(), shippingMethodId })
          .then((r) => r.status),
        request(app.getHttpServer())
          .post('/api/checkout?sessionId=' + '8f0a0f42-0000-4000-8000-000000000003')
          .send({ email: 'race-b@test.dev', shippingAddress: validAddress(), shippingMethodId })
          .then((r) => r.status),
      ]);

      // Exactly one order may be created regardless of interleaving.
      const created = await prisma.order.count({
        where: { email: { in: ['race-a@test.dev', 'race-b@test.dev'] } },
      });
      expect(created).toBe(1);

      // And of the two HTTP results only one is 201; the loser must be rejected
      // (409/500), never silently succeeding.
      const ok201 = statuses.filter((s) => s === 201).length;
      expect(ok201).toBe(1);

      // Total reserved never exceeds the 2 units available.
      const inv = await prisma.inventory.findFirst({
        where: { productId: activeProductId },
      });
      expect(inv?.reservedQuantity).toBe(2);
    });
  });

  describe('shipping methods & admin gating', () => {
    it('lists available shipping methods publicly', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/shipping/methods')
        .expect(200);
      const methods = dataOf<{ id: string; code: string }[]>(res);
      expect(methods.some((m) => m.id === shippingMethodId)).toBe(true);
    });

    it('calculates shipping cost publicly (integer paise)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/shipping/calculate')
        .send({
          country: 'US',
          state: 'NY',
          postalCode: '10001',
          subtotal: 2 * ACTIVE_PRICE,
          itemCount: 2,
        })
        .expect(201);
      const results = dataOf<{ id: string; cost: number }[]>(res);
      const mine = results.find((r) => r.id === shippingMethodId);
      expect(mine).toBeDefined();
      expect(mine!.cost).toBe(SHIPPING_BASE_COST);
    });

    it('gates admin shipping routes by role', async () => {
      const customer = await registerAndLogin('ship-customer@test.dev');

      // Unauthenticated → 401.
      await request(app.getHttpServer()).get('/api/shipping/zones').expect(401);

      // Customer → 403.
      await request(app.getHttpServer())
        .get('/api/shipping/zones')
        .set('Authorization', bearer(customer))
        .expect(403);

      // Admin → 200.
      const zones = await request(app.getHttpServer())
        .get('/api/shipping/zones')
        .set('Authorization', bearer(adminToken))
        .expect(200);
      expect(Array.isArray(dataOf<unknown[]>(zones))).toBe(true);
    });
  });

  describe('authenticated carts (JwtStrategy `sub` + OptionalJwtAuthGuard)', () => {
    it('resolves a logged-in user token to their account cart', async () => {
      const token = await registerAndLogin('cart-user@test.dev');

      await request(app.getHttpServer())
        .post('/api/cart')
        .set('Authorization', bearer(token))
        .send({ productId: activeProductId, quantity: 1 })
        .expect(201);

      const cart = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Authorization', bearer(token))
        .expect(200);
      const data = dataOf<{ userId: string | null; items: any[] }>(cart);
      expect(data.items).toHaveLength(1);
      const user = await prisma.user.findUnique({ where: { email: 'cart-user@test.dev' } });
      expect(data.userId).toBe(user?.id);
    });

    it('merges a session cart into the user cart after login', async () => {
      // Guest adds while signed out.
      await request(app.getHttpServer())
        .post('/api/cart?sessionId=' + SESSION)
        .send({ productId: activeProductId, quantity: 2 })
        .expect(201);

      const token = await registerAndLogin('merge-user@test.dev');

      const merged = await request(app.getHttpServer())
        .post('/api/cart/merge')
        .set('Authorization', bearer(token))
        .send({ sessionId: SESSION })
        .expect(201);

      const data = dataOf<{ items: { quantity: number }[]; userId: string | null }>(merged);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].quantity).toBe(2);

      // Session cart no longer holds the items.
      const sessionCart = await request(app.getHttpServer())
        .get('/api/cart?sessionId=' + SESSION)
        .expect(200);
      expect(dataOf<{ items: any[] }>(sessionCart).items).toEqual([]);
    });
  });
});
