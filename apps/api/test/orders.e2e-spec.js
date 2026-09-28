"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const create_app_1 = require("../src/create-app");
const prisma_service_1 = require("../src/database/prisma.service");
describe('AUREVO E2E (Phase 6): orders', () => {
    let app;
    let prisma;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const admin = { email: ADMIN_EMAIL, password: 'Password123!', firstName: 'Admin', lastName: 'Owner' };
    let adminToken = '';
    let custAToken = '';
    let custBToken = '';
    let categoryId = '';
    let activeProductId = '';
    let shippingMethodId = '';
    const ACTIVE_PRICE = 100000;
    const SHIPPING_BASE_COST = 9900;
    const TAX_RATE = 0.18;
    const STOCK = 5;
    beforeAll(async () => {
        app = await (0, create_app_1.createApp)();
        await app.init();
        prisma = app.get(prisma_service_1.PrismaService);
        await prisma.order.deleteMany({});
        await prisma.cartItem.deleteMany({});
        await prisma.cart.deleteMany({});
        await prisma.refreshToken.deleteMany({});
        await prisma.revokedToken.deleteMany({});
        await prisma.user.deleteMany({});
        await (0, supertest_1.default)(app.getHttpServer()).post('/api/auth/register').send(admin).expect(201);
        const login = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/login').send({ email: admin.email, password: admin.password }).expect(200);
        adminToken = dataOf(login).accessToken;
        custAToken = await registerAndLogin('order-a@test.dev');
        custBToken = await registerAndLogin('order-b@test.dev');
        const cat = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/categories').set('Authorization', bearer(adminToken))
            .send({ name: 'Orders Test', slug: 'orders-test' }).expect(201);
        categoryId = dataOf(cat).id;
        const p = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/products').set('Authorization', bearer(adminToken))
            .send({
            name: 'Order Shirt', slug: 'order-shirt', sku: 'ORD-001',
            basePrice: ACTIVE_PRICE, status: 'ACTIVE', initialQuantity: STOCK,
            description: 'Test', currency: 'INR', categoryId,
            trackQuantity: true, allowBackorder: false,
        })
            .expect(201);
        activeProductId = dataOf(p).id;
        const sm = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/shipping/methods').set('Authorization', bearer(adminToken))
            .send({ name: 'Std', code: 'std-orders', baseCost: SHIPPING_BASE_COST, estimatedDays: 5, currency: 'INR', isActive: true })
            .expect(201);
        shippingMethodId = dataOf(sm).id;
    });
    afterAll(async () => {
        await app.close();
    });
    beforeEach(async () => {
        await prisma.order.deleteMany({});
        await prisma.cartItem.deleteMany({});
        await prisma.cart.deleteMany({});
        await prisma.inventory.updateMany({
            where: { productId: activeProductId },
            data: { quantity: STOCK, reservedQuantity: 0 },
        });
    });
    function dataOf(res) {
        return res.body.data;
    }
    function bearer(token) {
        return `Bearer ${token}`;
    }
    async function registerAndLogin(email) {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/register')
            .send({ email, password: 'Password123!', firstName: 'Cust', lastName: 'User' })
            .expect(201);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/login').send({ email, password: 'Password123!' }).expect(200);
        return dataOf(res).accessToken;
    }
    const validAddress = () => ({
        firstName: 'John', lastName: 'Doe', address1: '123 Main St',
        city: 'New York', state: 'NY', postalCode: '10001', country: 'US', phone: '+1-555-123-4567',
    });
    async function placeOrder(token) {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/cart').set('Authorization', bearer(token))
            .send({ productId: activeProductId, quantity: 1 }).expect(201);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/checkout').set('Authorization', bearer(token))
            .send({ email: 'buyer@test.dev', shippingAddress: validAddress(), shippingMethodId })
            .expect(201);
        return dataOf(res).order;
    }
    describe('customer order history', () => {
        it('GET /orders/me returns only the caller\'s own orders', async () => {
            const mine = await placeOrder(custAToken);
            const a = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders/me').set('Authorization', bearer(custAToken)).expect(200);
            const aList = dataOf(a).data;
            expect(aList.some((o) => o.id === mine.id)).toBe(true);
            const b = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders/me').set('Authorization', bearer(custBToken)).expect(200);
            const bList = dataOf(b).data;
            expect(bList.some((o) => o.id === mine.id)).toBe(false);
        });
        it('GET /orders/me requires authentication', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/orders/me').expect(401);
        });
    });
    describe('order lookup — owner or admin only', () => {
        it('owner sees the order; another customer cannot; guest is rejected', async () => {
            const order = await placeOrder(custAToken);
            const own = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders/' + order.id).set('Authorization', bearer(custAToken)).expect(200);
            expect(dataOf(own).orderNumber).toBe(order.orderNumber);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders/' + order.id).set('Authorization', bearer(custBToken)).expect(404);
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/orders/' + order.id).expect(403);
        });
        it('scopes order-number lookup to the owner too', async () => {
            const order = await placeOrder(custAToken);
            const own = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders/number/' + order.orderNumber).set('Authorization', bearer(custAToken)).expect(200);
            expect(dataOf(own).id).toBe(order.id);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders/number/' + order.orderNumber).set('Authorization', bearer(custBToken)).expect(404);
        });
        it('admin can read any order', async () => {
            const order = await placeOrder(custAToken);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders/' + order.id).set('Authorization', bearer(adminToken)).expect(200);
            expect(dataOf(res).id).toBe(order.id);
        });
    });
    describe('cancel order — owner or admin', () => {
        it('rejects a guest and a non-owner; owner can cancel and inventory is released', async () => {
            const order = await placeOrder(custAToken);
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/orders/' + order.id + '/cancel').expect(403);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/orders/' + order.id + '/cancel').set('Authorization', bearer(custBToken)).expect(403);
            const cancelled = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/orders/' + order.id + '/cancel').set('Authorization', bearer(custAToken))
                .send({ reason: 'changed my mind' })
                .expect(200);
            expect(dataOf(cancelled).status).toBe('CANCELLED');
            const inv = await prisma.inventory.findFirst({ where: { productId: activeProductId } });
            expect(inv?.reservedQuantity).toBe(0);
            const persisted = await prisma.order.findUnique({ where: { id: order.id } });
            expect(persisted?.notes).toBe('changed my mind');
        });
    });
    describe('admin status transitions', () => {
        it('PAYMENT_PENDING → PAID sets paidAt; invalid transitions are 409', async () => {
            const order = await placeOrder(custAToken);
            await (0, supertest_1.default)(app.getHttpServer())
                .patch('/api/orders/' + order.id + '/status').set('Authorization', bearer(adminToken))
                .send({ status: 'DELIVERED' }).expect(409);
            const paid = await (0, supertest_1.default)(app.getHttpServer())
                .patch('/api/orders/' + order.id + '/status').set('Authorization', bearer(adminToken))
                .send({ status: 'PAID' }).expect(200);
            expect(dataOf(paid).status).toBe('PAID');
            const row = await prisma.order.findUnique({ where: { id: order.id } });
            expect(row?.paidAt).not.toBeNull();
        });
        it('admin can list all orders', async () => {
            const order = await placeOrder(custAToken);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders').set('Authorization', bearer(adminToken)).expect(200);
            const list = dataOf(res).data;
            expect(list.some((o) => o.id === order.id)).toBe(true);
        });
    });
});
//# sourceMappingURL=orders.e2e-spec.js.map