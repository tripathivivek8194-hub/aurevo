"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const create_app_1 = require("../src/create-app");
const prisma_service_1 = require("../src/database/prisma.service");
describe('AUREVO E2E (Phase 5): cart & checkout', () => {
    let app;
    let prisma;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const admin = {
        email: ADMIN_EMAIL,
        password: 'Password123!',
        firstName: 'Admin',
        lastName: 'Owner',
    };
    let adminToken = '';
    let categoryId = '';
    let activeProductId = '';
    let outOfStockProductId = '';
    let draftProductId = '';
    let shippingMethodId = '';
    const ACTIVE_PRICE = 100000;
    const SHIPPING_BASE_COST = 9900;
    const TAX_RATE = 0.18;
    beforeAll(async () => {
        app = await (0, create_app_1.createApp)();
        await app.init();
        prisma = app.get(prisma_service_1.PrismaService);
        await prisma.revokedToken.deleteMany({});
        await prisma.refreshToken.deleteMany({});
        await prisma.user.deleteMany({});
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/register')
            .send(admin)
            .expect(201);
        const login = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email: admin.email, password: admin.password })
            .expect(200);
        adminToken = dataOf(login).accessToken;
        const authHeader = bearer(adminToken);
        const cat = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/categories')
            .set('Authorization', authHeader)
            .send({ name: 'Cart Test', slug: 'cart-test' })
            .expect(201);
        categoryId = dataOf(cat).id;
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
        const sm = await (0, supertest_1.default)(app.getHttpServer())
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
        shippingMethodId = dataOf(sm).id;
        async function createProduct(body) {
            const res = await (0, supertest_1.default)(app.getHttpServer())
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
            return dataOf(res);
        }
    });
    afterAll(async () => {
        await app.close();
    });
    beforeEach(async () => {
        await prisma.cartItem.deleteMany({});
        await prisma.cart.deleteMany({});
        const initial = {
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
    const SESSION = '8f0a0f42-0000-4000-8000-000000000001';
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
            .post('/api/auth/login')
            .send({ email, password: 'Password123!' })
            .expect(200);
        return dataOf(res).accessToken;
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
            const empty = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/cart?sessionId=' + SESSION)
                .expect(200);
            expect(dataOf(empty).items).toEqual([]);
            const add = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 2 })
                .expect(201);
            const itemId = dataOf(add).id;
            expect(dataOf(add).quantity).toBe(2);
            const summary = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/cart/summary?sessionId=' + SESSION)
                .expect(200);
            expect(dataOf(summary)).toMatchObject({
                itemCount: 2,
                subtotal: 2 * ACTIVE_PRICE,
            });
            const updated = await (0, supertest_1.default)(app.getHttpServer())
                .patch('/api/cart/items/' + itemId + '?sessionId=' + SESSION)
                .send({ quantity: 3 })
                .expect(200);
            expect(dataOf(updated).quantity).toBe(3);
            const removed = await (0, supertest_1.default)(app.getHttpServer())
                .delete('/api/cart/items/' + itemId + '?sessionId=' + SESSION)
                .expect(200);
            expect(dataOf(removed).message).toBeDefined();
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 1 })
                .expect(201);
            await (0, supertest_1.default)(app.getHttpServer())
                .delete('/api/cart?sessionId=' + SESSION)
                .expect(200);
            const cleared = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/cart/summary?sessionId=' + SESSION)
                .expect(200);
            expect(dataOf(cleared).itemCount).toBe(0);
        });
        it('accumulates quantity when the same product is added twice', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 2 })
                .expect(201);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 3 })
                .expect(201);
            const cart = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/cart?sessionId=' + SESSION)
                .expect(200);
            const items = dataOf(cart).items;
            expect(items).toHaveLength(1);
            expect(items[0].quantity).toBe(5);
        });
        it('rejects adding an out-of-stock product with 409', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: outOfStockProductId, quantity: 1 })
                .expect(409);
        });
        it('rejects adding an inactive (DRAFT) product with 409', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: draftProductId, quantity: 1 })
                .expect(409);
        });
        it('rejects a request with neither userId nor sessionId (400)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart')
                .send({ productId: activeProductId, quantity: 1 })
                .expect(400);
        });
    });
    describe('checkout preview', () => {
        it('computes integer-paise subtotal, rounded tax, shipping and total', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 2 })
                .expect(201);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/checkout/preview?sessionId=' + SESSION +
                '&shippingMethodId=' + shippingMethodId)
                .expect(200);
            const subtotal = 2 * ACTIVE_PRICE;
            const tax = Math.round(subtotal * TAX_RATE);
            const total = subtotal + SHIPPING_BASE_COST + tax;
            const preview = dataOf(res);
            expect(preview).toMatchObject({
                subtotal,
                shippingCost: SHIPPING_BASE_COST,
                tax,
                total,
            });
            expect(Number.isInteger(preview.subtotal)).toBe(true);
            expect(Number.isInteger(preview.tax)).toBe(true);
            expect(Number.isInteger(preview.total)).toBe(true);
        });
    });
    describe('create order', () => {
        it('creates a PAYMENT_PENDING order, reserves inventory and clears the cart', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 2 })
                .expect(201);
            const subtotal = 2 * ACTIVE_PRICE;
            const tax = Math.round(subtotal * TAX_RATE);
            const expectedTotal = subtotal + SHIPPING_BASE_COST + tax;
            const orderRes = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/checkout?sessionId=' + SESSION)
                .send({
                email: 'buyer@test.dev',
                shippingAddress: validAddress(),
                shippingMethodId,
            })
                .expect(201);
            const order = dataOf(orderRes).order;
            expect(order).toMatchObject({
                status: 'PAYMENT_PENDING',
                total: expectedTotal,
                currency: 'INR',
            });
            expect(order.id).toBeDefined();
            expect(order.orderNumber).toBeDefined();
            const inventory = await prisma.inventory.findFirst({
                where: { productId: activeProductId },
            });
            expect(inventory?.reservedQuantity).toBe(2);
            const byId = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/checkout/' + order.id + '?sessionId=' + SESSION)
                .expect(200);
            const fetched = dataOf(byId);
            expect(fetched.orderNumber).toBe(order.orderNumber);
            expect(fetched.items).toHaveLength(1);
            const byNumber = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/checkout/number/' + order.orderNumber + '?sessionId=' + SESSION)
                .expect(200);
            const cart = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/cart?sessionId=' + SESSION)
                .expect(200);
            expect(dataOf(cart).items).toEqual([]);
            expect(dataOf(byNumber).total).toBe(expectedTotal);
        });
        it('S3: guest order access denied without sessionId (404)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 1 })
                .expect(201);
            const orderRes = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/checkout?sessionId=' + SESSION)
                .send({ email: 'idor@test.dev', shippingAddress: validAddress(), shippingMethodId })
                .expect(201);
            const order = dataOf(orderRes).order;
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/checkout/' + order.id)
                .expect(404);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/checkout/number/' + order.orderNumber)
                .expect(404);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/checkout/' + order.id + '?sessionId=wrong-session-id')
                .expect(404);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/checkout/' + order.id + '?sessionId=' + SESSION)
                .expect(200);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/checkout/number/' + order.orderNumber + '?sessionId=' + SESSION)
                .expect(200);
        });
        it('refuses to place an order from an empty cart (400)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/checkout?sessionId=' + SESSION)
                .send({ email: 'buyer@test.dev', shippingAddress: validAddress() })
                .expect(400);
        });
        it('rejects an invalid shipping address with 400 via the ValidationPipe', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 1 })
                .expect(201);
            const bad = validAddress();
            delete bad.city;
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/checkout?sessionId=' + SESSION)
                .send({ email: 'buyer@test.dev', shippingAddress: bad })
                .expect(400);
        });
    });
    describe('concurrent checkout does not over-commit inventory (TOCTOU)', () => {
        it('allows only as many concurrent orders as there is available stock', async () => {
            await prisma.inventory.updateMany({
                where: { productId: activeProductId },
                data: { quantity: 2, reservedQuantity: 0 },
            });
            const fill = (sessionId) => (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + sessionId)
                .send({ productId: activeProductId, quantity: 2 })
                .expect(201);
            await fill('8f0a0f42-0000-4000-8000-000000000002');
            await fill('8f0a0f42-0000-4000-8000-000000000003');
            const statuses = await Promise.all([
                (0, supertest_1.default)(app.getHttpServer())
                    .post('/api/checkout?sessionId=' + '8f0a0f42-0000-4000-8000-000000000002')
                    .send({ email: 'race-a@test.dev', shippingAddress: validAddress(), shippingMethodId })
                    .then((r) => r.status),
                (0, supertest_1.default)(app.getHttpServer())
                    .post('/api/checkout?sessionId=' + '8f0a0f42-0000-4000-8000-000000000003')
                    .send({ email: 'race-b@test.dev', shippingAddress: validAddress(), shippingMethodId })
                    .then((r) => r.status),
            ]);
            const created = await prisma.order.count({
                where: { email: { in: ['race-a@test.dev', 'race-b@test.dev'] } },
            });
            expect(created).toBe(1);
            const ok201 = statuses.filter((s) => s === 201).length;
            expect(ok201).toBe(1);
            const inv = await prisma.inventory.findFirst({
                where: { productId: activeProductId },
            });
            expect(inv?.reservedQuantity).toBe(2);
        });
    });
    describe('shipping methods & admin gating', () => {
        it('lists available shipping methods publicly', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/shipping/methods')
                .expect(200);
            const methods = dataOf(res);
            expect(methods.some((m) => m.id === shippingMethodId)).toBe(true);
        });
        it('calculates shipping cost publicly (integer paise)', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/shipping/calculate')
                .send({
                country: 'US',
                state: 'NY',
                postalCode: '10001',
                subtotal: 2 * ACTIVE_PRICE,
                itemCount: 2,
            })
                .expect(201);
            const results = dataOf(res);
            const mine = results.find((r) => r.id === shippingMethodId);
            expect(mine).toBeDefined();
            expect(mine.cost).toBe(SHIPPING_BASE_COST);
        });
        it('gates admin shipping routes by role', async () => {
            const customer = await registerAndLogin('ship-customer@test.dev');
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/shipping/zones').expect(401);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/shipping/zones')
                .set('Authorization', bearer(customer))
                .expect(403);
            const zones = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/shipping/zones')
                .set('Authorization', bearer(adminToken))
                .expect(200);
            expect(Array.isArray(dataOf(zones))).toBe(true);
        });
    });
    describe('authenticated carts (JwtStrategy `sub` + OptionalJwtAuthGuard)', () => {
        it('resolves a logged-in user token to their account cart', async () => {
            const token = await registerAndLogin('cart-user@test.dev');
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart')
                .set('Authorization', bearer(token))
                .send({ productId: activeProductId, quantity: 1 })
                .expect(201);
            const cart = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/cart')
                .set('Authorization', bearer(token))
                .expect(200);
            const data = dataOf(cart);
            expect(data.items).toHaveLength(1);
            const user = await prisma.user.findUnique({ where: { email: 'cart-user@test.dev' } });
            expect(data.userId).toBe(user?.id);
        });
        it('merges a session cart into the user cart after login', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart?sessionId=' + SESSION)
                .send({ productId: activeProductId, quantity: 2 })
                .expect(201);
            const token = await registerAndLogin('merge-user@test.dev');
            const merged = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/cart/merge')
                .set('Authorization', bearer(token))
                .send({ sessionId: SESSION })
                .expect(201);
            const data = dataOf(merged);
            expect(data.items).toHaveLength(1);
            expect(data.items[0].quantity).toBe(2);
            const sessionCart = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/cart?sessionId=' + SESSION)
                .expect(200);
            expect(dataOf(sessionCart).items).toEqual([]);
        });
    });
});
//# sourceMappingURL=cart-checkout.e2e-spec.js.map