"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const create_app_1 = require("../src/create-app");
const prisma_service_1 = require("../src/database/prisma.service");
describe('AUREVO E2E (Phase 4): catalog, products, variants, inventory', () => {
    let app;
    let prisma;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const admin = {
        email: ADMIN_EMAIL,
        password: 'Password123!',
        firstName: 'Admin',
        lastName: 'User',
    };
    let seq = 0;
    const unique = (prefix) => `${prefix}-${Date.now()}-${seq++}`;
    function dataOf(res) {
        return res.body.data;
    }
    function bearer(token) {
        return `Bearer ${token}`;
    }
    async function adminToken() {
        const agent = supertest_1.default.agent(app.getHttpServer());
        await agent.post('/api/auth/register').send(admin);
        const login = await agent
            .post('/api/auth/login')
            .send({ email: admin.email, password: admin.password })
            .expect(200);
        return dataOf(login).accessToken;
    }
    async function customerToken() {
        const email = `${unique('cust')}@test.dev`;
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/register')
            .send({ email, password: 'Password123!', firstName: 'Test', lastName: 'User' })
            .expect(201);
        const login = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email, password: 'Password123!' })
            .expect(200);
        return dataOf(login).accessToken;
    }
    async function createCategory(token) {
        const slug = unique('cat');
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/categories')
            .set('Authorization', bearer(token))
            .send({ name: `Category ${slug}`, slug })
            .expect(201);
        return dataOf(res);
    }
    function productPayload(categoryId, overrides = {}) {
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
        app = await (0, create_app_1.createApp)();
        await app.init();
        prisma = app.get(prisma_service_1.PrismaService);
    });
    afterAll(async () => {
        await app.close();
    });
    describe('categories (public read, admin write)', () => {
        it('lists categories for the public', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/categories').expect(200);
        });
        it('creates a category only as an ADMIN (401/403/201)', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/categories').send({ name: 'x', slug: 'x' }).expect(401);
            const customer = await customerToken();
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/categories')
                .set('Authorization', bearer(customer))
                .send({ name: 'x', slug: 'x' })
                .expect(403);
            const admin = await adminToken();
            const created = await createCategory(admin);
            const found = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/categories/${created.slug}`)
                .expect(200);
            expect(dataOf(found).id).toBe(created.id);
        });
        it('rejects a duplicate category slug (409)', async () => {
            const token = await adminToken();
            const created = await createCategory(token);
            const dup = await (0, supertest_1.default)(app.getHttpServer())
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
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(payload)
                .expect(201);
            const createdData = dataOf(created);
            expect(createdData.status).toBe('ACTIVE');
            const bySlug = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/products/${createdData.slug}`)
                .expect(200);
            const detail = dataOf(bySlug);
            expect(detail.basePrice).toBe(129900);
            expect(detail.variants).toHaveLength(2);
            expect(detail.images[0].isPrimary).toBe(true);
        });
        it('creates product-level inventory when a product has no variants', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const payload = productPayload(cat.id, { initialQuantity: 7, lowStockThreshold: 10 });
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(payload)
                .expect(201);
            const { slug } = dataOf(created);
            const inventory = await prisma.inventory.findFirst({
                where: { product: { slug }, variantId: null },
            });
            expect(inventory).not.toBeNull();
            expect(inventory?.quantity).toBe(7);
        });
        it('rejects a non-integer (fractional) basePrice with 400', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { basePrice: 1299.99 }))
                .expect(400);
        });
        it('rejects a duplicate product SKU with 409', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const first = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id))
                .expect(201);
            const sku = dataOf(first).sku;
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { sku }))
                .expect(409);
        });
        it('rejects product writes without ADMIN (401 / 403)', async () => {
            const cat = await createCategory(await adminToken());
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/products').send(productPayload(cat.id)).expect(401);
            const customer = await customerToken();
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(customer))
                .send(productPayload(cat.id))
                .expect(403);
        });
        it('lists products with pagination metadata and returns featured', async () => {
            const list = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/products?limit=5')
                .expect(200);
            const body = dataOf(list);
            expect(body.meta.limit).toBe(5);
            expect(Array.isArray(body.data)).toBe(true);
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/products/featured?limit=3').expect(200);
        });
        it('searches active products by name', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const name = `Searchable Widget ${unique('srch')}`;
            const payload = productPayload(cat.id, { name });
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(payload)
                .expect(201);
            const { slug } = dataOf(created);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/products/search')
                .query({ q: name })
                .expect(200);
            const results = dataOf(res);
            expect(results.some((p) => p.slug === slug)).toBe(true);
        });
    });
    describe('products — 30% minimum margin enforcement', () => {
        const FLOOR_70 = Math.ceil(70000 / 0.7);
        it('201: ACTIVE product at/above the cost floor returns marginPct, and cost never leaks publicly', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { cost: 70000, basePrice: FLOOR_70 }))
                .expect(201);
            const { slug, marginPct } = dataOf(created);
            expect(marginPct).toBeGreaterThanOrEqual(30);
            const bySlug = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/products/${slug}`)
                .expect(200);
            const detail = dataOf(bySlug);
            expect(detail).not.toHaveProperty('cost');
        });
        it('400: ACTIVE product below the 30% floor is hard-rejected, naming the floor', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const res = await (0, supertest_1.default)(app.getHttpServer())
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
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { cost: undefined }))
                .expect(400);
        });
        it('201: DRAFT product without cost is allowed (not sellable yet)', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { status: 'DRAFT', cost: undefined }))
                .expect(201);
        });
        it('400: PATCH pushing an ACTIVE product below the floor is rejected', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id))
                .expect(201);
            const { id } = dataOf(created);
            await (0, supertest_1.default)(app.getHttpServer())
                .patch(`/api/products/${id}`)
                .set('Authorization', bearer(token))
                .send({ basePrice: 99999 })
                .expect(400);
        });
        it('400: PATCH promoting a product to ACTIVE without cost is rejected', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const draft = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { status: 'DRAFT', cost: undefined }))
                .expect(201);
            const { id } = dataOf(draft);
            await (0, supertest_1.default)(app.getHttpServer())
                .patch(`/api/products/${id}`)
                .set('Authorization', bearer(token))
                .send({ status: 'ACTIVE' })
                .expect(400);
        });
        it('200: editing only the name of an ACTIVE product does not trigger the margin check', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id))
                .expect(201);
            const { id } = dataOf(created);
            await (0, supertest_1.default)(app.getHttpServer())
                .patch(`/api/products/${id}`)
                .set('Authorization', bearer(token))
                .send({ name: 'Renamed without touching pricing' })
                .expect(200);
        });
        it('400: adding a variant below the parent cost floor is rejected', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id))
                .expect(201);
            const { id } = dataOf(created);
            await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/products/${id}/variants`)
                .set('Authorization', bearer(token))
                .send({ name: 'Too Cheap', sku: unique('VSKU').toUpperCase(), price: FLOOR_70 - 1 })
                .expect(400);
        });
    });
    describe('admin product reads (cost + marginPct)', () => {
        it('GET /admin/products returns cost and marginPct for an ADMIN', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { cost: 70000, basePrice: 100000 }))
                .expect(201);
            const { slug } = dataOf(created);
            const list = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/admin/products')
                .set('Authorization', bearer(token))
                .expect(200);
            const row = dataOf(list)
                .find((p) => p.slug === slug);
            expect(row).toBeDefined();
            expect(row.cost).toBe(70000);
            expect(row.marginPct).toBeGreaterThanOrEqual(30);
        });
        it('GET /admin/products/:id returns cost for an ADMIN', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { cost: 70000, basePrice: 100000 }))
                .expect(201);
            const { id } = dataOf(created);
            const detail = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/admin/products/${id}`)
                .set('Authorization', bearer(token))
                .expect(200);
            const body = dataOf(detail);
            expect(body.cost).toBe(70000);
            expect(body.marginPct).toBeGreaterThanOrEqual(30);
        });
        it('GET /admin/products is 401 without a token', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/admin/products').expect(401);
        });
        it('GET /admin/products is 403 for a CUSTOMER role', async () => {
            const custToken = await customerToken();
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/admin/products')
                .set('Authorization', bearer(custToken))
                .expect(403);
        });
        it('public GET /products still strips cost (storefront safety)', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { cost: 70000, basePrice: 100000 }))
                .expect(201);
            const { slug } = dataOf(created);
            const publicRow = await (0, supertest_1.default)(app.getHttpServer())
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
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { initialQuantity: 3 }))
                .expect(201);
            const { id } = dataOf(created);
            const variantRes = await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/products/${id}/variants`)
                .set('Authorization', bearer(token))
                .send({ name: 'Blue / M', sku: unique('VSKU').toUpperCase(), price: 129900, attributes: { color: 'Blue', size: 'M' }, initialQuantity: 12 })
                .expect(201);
            const variant = dataOf(variantRes);
            expect(variant.inventory?.quantity).toBe(12);
            const list = await (0, supertest_1.default)(app.getHttpServer()).get(`/api/products/${id}/variants`).expect(200);
            expect(dataOf(list).length).toBeGreaterThanOrEqual(1);
        });
        it('adds, lists, and deletes a product image', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id))
                .expect(201);
            const { id } = dataOf(created);
            const added = await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/products/${id}/images`)
                .set('Authorization', bearer(token))
                .send({ url: 'https://example.test/second.jpg', alt: 'second' })
                .expect(201);
            const image = dataOf(added);
            expect(image.isPrimary).toBe(true);
            const list = await (0, supertest_1.default)(app.getHttpServer()).get(`/api/products/${id}/images`).expect(200);
            expect(dataOf(list).length).toBe(1);
            await (0, supertest_1.default)(app.getHttpServer())
                .delete(`/api/products/images/${image.id}`)
                .set('Authorization', bearer(token))
                .expect(200);
        });
    });
    describe('inventory (admin only)', () => {
        it('reports inventory for a product and adjusts quantity', async () => {
            const token = await adminToken();
            const cat = await createCategory(token);
            const created = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/products')
                .set('Authorization', bearer(token))
                .send(productPayload(cat.id, { initialQuantity: 10 }))
                .expect(201);
            const { id } = dataOf(created);
            const byProduct = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/inventory/product/${id}`)
                .set('Authorization', bearer(token))
                .expect(200);
            const inv = dataOf(byProduct);
            expect(inv.quantity).toBe(10);
            await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/inventory/${inv.id}/adjust`)
                .set('Authorization', bearer(token))
                .send({ adjustment: -4, reason: 'E2E stock check' })
                .expect(201);
            const after = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/inventory/product/${id}`)
                .set('Authorization', bearer(token))
                .expect(200);
            expect(dataOf(after).quantity).toBe(6);
            const customer = await customerToken();
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/inventory')
                .set('Authorization', bearer(customer))
                .expect(403);
        });
    });
});
//# sourceMappingURL=catalog.e2e-spec.js.map