import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';

/**
 * E2E coverage for Phase 6 (Orders): customer order history, owner-or-admin
 * access control on order lookup, cancel authorization, status transitions,
 * and the canceled-order inventory release. Money stays integer paise.
 */
describe('AUREVO E2E (Phase 6): orders', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL as string;
  const admin = { email: ADMIN_EMAIL, password: 'Password123!', firstName: 'Admin', lastName: 'Owner' };

  let adminToken = '';
  let custAToken = '';
  let custBToken = '';
  let categoryId = '';
  let activeProductId = '';
  let shippingMethodId = '';

  const ACTIVE_PRICE = 100000; // ₹1,000.00
  const SHIPPING_BASE_COST = 9900; // ₹99.00
  const TAX_RATE = 0.18;
  const STOCK = 5;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);

    // Self-contained regardless of spec execution order: clear prior orders,
    // carts and users before building fixtures.
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.revokedToken.deleteMany({});
    await prisma.user.deleteMany({});

    await request(app.getHttpServer()).post('/api/auth/register').send(admin).expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login').send({ email: admin.email, password: admin.password }).expect(200);
    adminToken = dataOf<{ accessToken: string }>(login).accessToken;

    custAToken = await registerAndLogin('order-a@test.dev');
    custBToken = await registerAndLogin('order-b@test.dev');

    const cat = await request(app.getHttpServer())
      .post('/api/categories').set('Authorization', bearer(adminToken))
      .send({ name: 'Orders Test', slug: 'orders-test' }).expect(201);
    categoryId = dataOf<{ id: string }>(cat).id;

    const p = await request(app.getHttpServer())
      .post('/api/products').set('Authorization', bearer(adminToken))
      .send({
        name: 'Order Shirt', slug: 'order-shirt', sku: 'ORD-001',
        basePrice: ACTIVE_PRICE, status: 'ACTIVE', initialQuantity: STOCK,
        description: 'Test', currency: 'INR', categoryId,
        trackQuantity: true, allowBackorder: false,
      })
      .expect(201);
    activeProductId = dataOf<{ id: string }>(p).id;

    const sm = await request(app.getHttpServer())
      .post('/api/shipping/methods').set('Authorization', bearer(adminToken))
      .send({ name: 'Std', code: 'std-orders', baseCost: SHIPPING_BASE_COST, estimatedDays: 5, currency: 'INR', isActive: true })
      .expect(201);
    shippingMethodId = dataOf<{ id: string }>(sm).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Fresh order slate + full stock, so tests are independent.
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.inventory.updateMany({
      where: { productId: activeProductId },
      data: { quantity: STOCK, reservedQuantity: 0 },
    });
  });

  function dataOf<T>(res: request.Response): T {
    return res.body.data as T;
  }
  function bearer(token: string): string {
    return `Bearer ${token}`;
  }
  async function registerAndLogin(email: string) {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', firstName: 'Cust', lastName: 'User' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login').send({ email, password: 'Password123!' }).expect(200);
    return dataOf<{ accessToken: string }>(res).accessToken;
  }
  const validAddress = () => ({
    firstName: 'John', lastName: 'Doe', address1: '123 Main St',
    city: 'New York', state: 'NY', postalCode: '10001', country: 'US', phone: '+1-555-123-4567',
  });

  /** Places an order owned by the given authenticated user. */
  async function placeOrder(token: string) {
    await request(app.getHttpServer())
      .post('/api/cart').set('Authorization', bearer(token))
      .send({ productId: activeProductId, quantity: 1 }).expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/checkout').set('Authorization', bearer(token))
      .send({ email: 'buyer@test.dev', shippingAddress: validAddress(), shippingMethodId })
      .expect(201);
    return dataOf<{ order: { id: string; orderNumber: string } }>(res).order;
  }

  describe('customer order history', () => {
    it('GET /orders/me returns only the caller\'s own orders', async () => {
      const mine = await placeOrder(custAToken);

      const a = await request(app.getHttpServer())
        .get('/api/orders/me').set('Authorization', bearer(custAToken)).expect(200);
      const aList = dataOf<{ data: any[]; meta: any }>(a).data;
      expect(aList.some((o) => o.id === mine.id)).toBe(true);

      const b = await request(app.getHttpServer())
        .get('/api/orders/me').set('Authorization', bearer(custBToken)).expect(200);
      const bList = dataOf<{ data: any[] }>(b).data;
      expect(bList.some((o) => o.id === mine.id)).toBe(false);
    });

    it('GET /orders/me requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/orders/me').expect(401);
    });
  });

  describe('order lookup — owner or admin only', () => {
    it('owner sees the order; another customer cannot; guest is rejected', async () => {
      const order = await placeOrder(custAToken);

      // Owner → 200.
      const own = await request(app.getHttpServer())
        .get('/api/orders/' + order.id).set('Authorization', bearer(custAToken)).expect(200);
      expect(dataOf<{ orderNumber: string }>(own).orderNumber).toBe(order.orderNumber);

      // Another customer → 404 (not found, no existence leak).
      await request(app.getHttpServer())
        .get('/api/orders/' + order.id).set('Authorization', bearer(custBToken)).expect(404);

      // Guest → 403 (authentication required).
      await request(app.getHttpServer()).get('/api/orders/' + order.id).expect(403);
    });

    it('scopes order-number lookup to the owner too', async () => {
      const order = await placeOrder(custAToken);

      const own = await request(app.getHttpServer())
        .get('/api/orders/number/' + order.orderNumber).set('Authorization', bearer(custAToken)).expect(200);
      expect(dataOf<{ id: string }>(own).id).toBe(order.id);

      await request(app.getHttpServer())
        .get('/api/orders/number/' + order.orderNumber).set('Authorization', bearer(custBToken)).expect(404);
    });

    it('admin can read any order', async () => {
      const order = await placeOrder(custAToken);

      const res = await request(app.getHttpServer())
        .get('/api/orders/' + order.id).set('Authorization', bearer(adminToken)).expect(200);
      expect(dataOf<{ id: string }>(res).id).toBe(order.id);
    });
  });

  describe('cancel order — owner or admin', () => {
    it('rejects a guest and a non-owner; owner can cancel and inventory is released', async () => {
      const order = await placeOrder(custAToken);

      // Guest cannot cancel.
      await request(app.getHttpServer()).post('/api/orders/' + order.id + '/cancel').expect(403);

      // Non-owner cannot cancel.
      await request(app.getHttpServer())
        .post('/api/orders/' + order.id + '/cancel').set('Authorization', bearer(custBToken)).expect(403);

      // Owner cancels.
      const cancelled = await request(app.getHttpServer())
        .post('/api/orders/' + order.id + '/cancel').set('Authorization', bearer(custAToken))
        .send({ reason: 'changed my mind' })
        .expect(200);
      expect(dataOf<{ status: string }>(cancelled).status).toBe('CANCELLED');

      // Reserved inventory was released back to 0.
      const inv = await prisma.inventory.findFirst({ where: { productId: activeProductId } });
      expect(inv?.reservedQuantity).toBe(0);

      // Reason was persisted.
      const persisted = await prisma.order.findUnique({ where: { id: order.id } });
      expect(persisted?.notes).toBe('changed my mind');
    });
  });

  describe('admin status transitions', () => {
    it('PAYMENT_PENDING → PAID sets paidAt; invalid transitions are 409', async () => {
      const order = await placeOrder(custAToken);

      // Invalid jump (skips PAID).
      await request(app.getHttpServer())
        .patch('/api/orders/' + order.id + '/status').set('Authorization', bearer(adminToken))
        .send({ status: 'DELIVERED' }).expect(409);

      // Valid PAYMENT_PENDING → PAID.
      const paid = await request(app.getHttpServer())
        .patch('/api/orders/' + order.id + '/status').set('Authorization', bearer(adminToken))
        .send({ status: 'PAID' }).expect(200);
      expect(dataOf<{ status: string }>(paid).status).toBe('PAID');

      const row = await prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.paidAt).not.toBeNull();
    });

    it('admin can list all orders', async () => {
      const order = await placeOrder(custAToken);

      const res = await request(app.getHttpServer())
        .get('/api/orders').set('Authorization', bearer(adminToken)).expect(200);
      const list = dataOf<{ data: any[]; meta: any }>(res).data;
      expect(list.some((o) => o.id === order.id)).toBe(true);
    });
  });
});
