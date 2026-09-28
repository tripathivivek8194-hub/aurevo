"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const create_app_1 = require("../src/create-app");
const prisma_service_1 = require("../src/database/prisma.service");
const types_1 = require("@aurevo/shared/types");
describe('AUREVO E2E (Phase 8): suppliers / AliExpress', () => {
    let app;
    let prisma;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const customer = {
        email: 'supplier-customer@test.dev',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'Customer',
    };
    const admin = {
        email: ADMIN_EMAIL,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'Admin',
    };
    beforeAll(async () => {
        app = await (0, create_app_1.createApp)();
        await app.init();
        prisma = app.get(prisma_service_1.PrismaService);
    });
    afterAll(async () => {
        await app.close();
    });
    beforeEach(async () => {
        await prisma.revokedToken.deleteMany({});
        await prisma.refreshToken.deleteMany({});
        await prisma.user.deleteMany({});
    });
    function dataOf(res) {
        return res.body.data;
    }
    async function authAgent(email) {
        const agent = supertest_1.default.agent(app.getHttpServer());
        await agent.post('/api/auth/register').send({ ...customer, email }).expect(201);
        const login = await agent
            .post('/api/auth/login')
            .send({ email, password: 'Password123!' })
            .expect(200);
        const accessToken = dataOf(login).accessToken;
        return { agent, accessToken };
    }
    describe('admin gating on AliExpress endpoints', () => {
        it('blocks unauthenticated access (401)', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/suppliers/aliexpress/status').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/suppliers/aliexpress/connect').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/suppliers/aliexpress/disconnect').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/suppliers/aliexpress/verify').expect(401);
        });
        it('forbids a CUSTOMER (403)', async () => {
            const { accessToken } = await authAgent(customer.email);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/status')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(403);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/connect')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(403);
        });
    });
    describe('honest NOT_CONFIGURED path (no AliExpress env in tests)', () => {
        let adminToken;
        beforeEach(async () => {
            const { accessToken } = await authAgent(admin.email);
            adminToken = accessToken;
        });
        it('connect reports NOT_CONFIGURED and never fabricates a URL', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/connect')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.state).toBe('NOT_CONFIGURED');
            expect(body.authorizationUrl).toBeUndefined();
        });
        it('status reports NOT_CONFIGURED with all capabilities NOT_CONFIGURED and no secrets', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.state).toBe('NOT_CONFIGURED');
            expect(body.connected).toBe(false);
            expect(body.hasAccessToken).toBe(false);
            expect(body.capabilities.length).toBeGreaterThan(0);
            for (const cap of body.capabilities) {
                expect(cap.status).toBe(types_1.SupplierCapabilityStatus.NOT_CONFIGURED);
            }
            expect(JSON.stringify(body)).not.toContain('ALIEXPRESS_APP_SECRET');
        });
        it('verify is a safe no-op when not configured', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/verify')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(dataOf(res).success).toBe(false);
        });
        it('disconnect is safe and idempotent', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/disconnect')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(dataOf(res).success).toBe(true);
        });
    });
    describe('public OAuth callback', () => {
        it('is reachable without a token and handles an AliExpress error redirect safely', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/callback')
                .query({ error: 'access_denied' })
                .expect(302);
            expect(res.headers.location).toContain('aliexpress=denied');
        });
        it('rejects a forged state with a safe error redirect', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/callback')
                .query({ state: 'forged-state', code: 'code' })
                .expect(302);
            expect(res.headers.location).toContain('aliexpress=error');
        });
    });
    describe('AliExpress credential configuration (Phase 8 config UX)', () => {
        const VALID = {
            appKey: 'abc123appkey',
            appSecret: 'a-real-app-secret-value-12345678',
            callbackUrl: 'https://shop.example.com/api/suppliers/aliexpress/callback',
        };
        let adminToken;
        beforeEach(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'ALIEXPRESS' } });
            const { accessToken } = await authAgent(admin.email);
            adminToken = accessToken;
        });
        afterAll(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'ALIEXPRESS' } });
        });
        it('is admin-only (401 guest / 403 customer)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .send(VALID)
                .expect(401);
            const { accessToken } = await authAgent(customer.email);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID)
                .expect(403);
        });
        it('saves credentials, reports CONFIGURED/UNVERIFIED, and never returns the secret', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(VALID)
                .expect(200);
            const body = dataOf(res);
            expect(body.state).toBe('DISCONNECTED');
            expect(body.connected).toBe(false);
            expect(body.hasAppSecret).toBe(true);
            expect(JSON.stringify(body)).not.toContain(VALID.appSecret);
            expect(JSON.stringify(body)).not.toContain('a-real-app-secret');
        });
        it('rejects a non-HTTPS callback URL', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...VALID, callbackUrl: 'http://insecure.example.com/api/suppliers/aliexpress/callback' })
                .expect(400);
        });
        it('rejects a placeholder App Key and a too-short App Secret', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...VALID, appKey: 'dev_placeholder_key' })
                .expect(400);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...VALID, appSecret: 'short' })
                .expect(400);
        });
        it('generates an authorization URL (READY) once configured', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(VALID)
                .expect(200);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/connect')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.state).toBe('READY');
            const url = new URL(body.authorizationUrl);
            expect(url.searchParams.get('client_id')).toBe(VALID.appKey);
            expect(url.searchParams.get('redirect_uri')).toBe(VALID.callbackUrl);
            expect(url.searchParams.get('state')).toBeTruthy();
        });
        it('fails verification safely (no real API) before authorization — never reports connected', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(VALID)
                .expect(200);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/verify')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.success).toBe(false);
            expect(body.message).not.toContain(VALID.appSecret);
        });
        it('disconnect keeps credentials — status remains CONFIGURED/UNVERIFIED', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(VALID)
                .expect(200);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/disconnect')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.state).toBe('DISCONNECTED');
            expect(body.hasAccessToken).toBe(false);
        });
    });
    describe('AliExpress catalog import endpoints (DS feed, admin-only)', () => {
        const VALID_IMPORT = { feedName: 'F_AEB', country: 'BR', categoryId: 'cat-1', limit: 25 };
        let adminToken;
        beforeEach(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'ALIEXPRESS' } });
            const { accessToken } = await authAgent(admin.email);
            adminToken = accessToken;
        });
        afterAll(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'ALIEXPRESS' } });
        });
        it('is admin-only (401 guest / 403 customer)', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/suppliers/aliexpress/catalog/feeds').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/suppliers/aliexpress/catalog/preview').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/suppliers/aliexpress/catalog/import').expect(401);
            const { accessToken } = await authAgent(customer.email);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/catalog/feeds')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(403);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/catalog/import')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_IMPORT)
                .expect(403);
        });
        it('reports configured:false for feeds without credentials (never fabricated)', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/catalog/feeds')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.configured).toBe(false);
            expect(body.feeds).toEqual([]);
        });
        it('preview without credentials is a safe empty result', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/catalog/preview')
                .query({ feedName: 'F_AEB', country: 'BR', pageSize: 5 })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.products).toEqual([]);
            expect(body.error).toBeTruthy();
        });
        it('import without credentials never creates supplier-linked products', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/catalog/import')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(VALID_IMPORT)
                .expect(400);
            const count = await prisma.product.count({ where: { supplierId: { not: null } } });
            expect(count).toBe(0);
        });
    });
    describe('AliExpress resumable import job endpoints (admin-only)', () => {
        let adminToken;
        async function createJobWithCategory(feedName = 'F_JOB') {
            const cat = await prisma.category.create({
                data: { name: 'Job Cat', slug: `job-cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, isActive: true },
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/catalog/jobs')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ feedName, country: 'BR', categoryId: cat.id, perRunLimit: 25, currency: 'INR', mode: 'update' })
                .expect(201);
            return { categoryId: cat.id, jobId: dataOf(res).id };
        }
        beforeEach(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'ALIEXPRESS' } });
            await prisma.productImportJob.deleteMany({});
            await prisma.category.deleteMany({ where: { slug: { startsWith: 'job-cat-' } } });
            const { accessToken } = await authAgent(admin.email);
            adminToken = accessToken;
        });
        afterAll(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'ALIEXPRESS' } });
            await prisma.productImportJob.deleteMany({});
        });
        it('is admin-only (401 guest / 403 customer) on every job endpoint', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/suppliers/aliexpress/catalog/jobs').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/suppliers/aliexpress/catalog/jobs/latest').expect(401);
            const { accessToken: customerToken } = await authAgent(customer.email);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/catalog/jobs')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ feedName: 'F', country: 'BR', categoryId: 'cat-1' })
                .expect(403);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/catalog/jobs/latest')
                .set('Authorization', `Bearer ${customerToken}`)
                .expect(403);
        });
        it('creates a PENDING job with a valid category (no fetch, no credentials needed)', async () => {
            const { jobId: id } = await createJobWithCategory('F_JOB');
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/suppliers/aliexpress/catalog/jobs/${id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const job = dataOf(res);
            expect(job.status).toBe('PENDING');
            expect(job.nextPage).toBe(1);
            expect(job.feedName).toBe('F_JOB');
            expect(job.mode).toBe('update');
            expect(job.importedCount).toBe(0);
            expect(job.failedIds).toEqual([]);
            expect(job.errorMessage).toBeNull();
        });
        it('rejects a job with a missing category (400)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/aliexpress/catalog/jobs')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ feedName: 'F', country: 'BR', categoryId: 'nope' })
                .expect(400);
        });
        it('fetches a job by id with safe fields only', async () => {
            const { jobId } = await createJobWithCategory('F_JOB');
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/suppliers/aliexpress/catalog/jobs/${jobId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const job = dataOf(res);
            expect(job.id).toBe(jobId);
            expect(job.status).toBe('PENDING');
            expect(job.nextPage).toBe(1);
        });
        it('advance without live credentials is a safe 400 (no products created)', async () => {
            const { jobId } = await createJobWithCategory('F_JOB');
            await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/suppliers/aliexpress/catalog/jobs/${jobId}/advance`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);
            const created = await prisma.product.count({ where: { supplierId: { not: null } } });
            expect(created).toBe(0);
        });
        it('cancel marks a pending job CANCELLED; further advance → 409', async () => {
            const { jobId } = await createJobWithCategory('F_JOB');
            const cancelled = await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/suppliers/aliexpress/catalog/jobs/${jobId}/cancel`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(dataOf(cancelled).status).toBe('CANCELLED');
            await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/suppliers/aliexpress/catalog/jobs/${jobId}/advance`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(409);
        });
        it('latest returns the most recent job for a feed+country+category', async () => {
            const { categoryId, jobId } = await createJobWithCategory('F_JOB');
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/aliexpress/catalog/jobs/latest')
                .query({ feedName: 'F_JOB', country: 'BR', categoryId })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(dataOf(res).id).toBe(jobId);
        });
    });
    describe('CJdropshipping admin gating', () => {
        it('blocks unauthenticated access (401)', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/suppliers/cjdropshipping/status').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/suppliers/cjdropshipping/catalog/categories').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/suppliers/cjdropshipping/catalog/search').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/suppliers/cjdropshipping/verify').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/suppliers/cjdropshipping/disconnect').expect(401);
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/suppliers/cjdropshipping/catalog/jobs').expect(401);
        });
        it('forbids a CUSTOMER (403)', async () => {
            const { accessToken } = await authAgent(customer.email);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/cjdropshipping/status')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(403);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/cjdropshipping/catalog/search')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(403);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/catalog/jobs')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ source: 'phone case', categoryId: 'cat-1' })
                .expect(403);
        });
    });
    describe('CJdropshipping honest NOT_CONFIGURED path (no CJ env in tests)', () => {
        let adminToken;
        beforeEach(async () => {
            const { accessToken } = await authAgent(admin.email);
            adminToken = accessToken;
        });
        it('status reports NOT_CONFIGURED with all capabilities NOT_CONFIGURED and no secrets', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/cjdropshipping/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.state).toBe('NOT_CONFIGURED');
            expect(body.configured).toBe(false);
            expect(body.connected).toBe(false);
            expect(body.hasAccessToken).toBe(false);
            for (const cap of body.capabilities) {
                expect(cap.status).toBe(types_1.SupplierCapabilityStatus.NOT_CONFIGURED);
            }
            expect(JSON.stringify(body)).not.toContain('CJ_APP_SECRET');
        });
        it('verify is a safe no-op when not configured', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/verify')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(dataOf(res).success).toBe(false);
        });
        it('disconnect is safe and idempotent', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/disconnect')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(dataOf(res).success).toBe(true);
        });
    });
    describe('CJdropshipping credential configuration', () => {
        const VALID_CJ = {
            apiKey: 'CJUserNum@api@real-test-key-12345678',
        };
        let adminToken;
        beforeEach(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'CJDROPSHIPPING' } });
            const { accessToken } = await authAgent(admin.email);
            adminToken = accessToken;
        });
        afterAll(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'CJDROPSHIPPING' } });
        });
        it('is admin-only (401 guest / 403 customer)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/config')
                .send(VALID_CJ)
                .expect(401);
            const { accessToken } = await authAgent(customer.email);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/config')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_CJ)
                .expect(403);
        });
        it('saves credentials, reports DISCONNECTED (no token), and never returns the secret', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(VALID_CJ)
                .expect(200);
            const body = dataOf(res);
            expect(body.state).toBe('DISCONNECTED');
            expect(body.configured).toBe(true);
            expect(body.hasAccessToken).toBe(false);
            expect(JSON.stringify(body)).not.toContain(VALID_CJ.apiKey);
            expect(body.apiKeyMasked).toBeTruthy();
        });
        it('rejects a too-short API Key', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...VALID_CJ, apiKey: 'short' })
                .expect(400);
        });
        it('configuring never fabricates a connected state without a live API success', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(VALID_CJ)
                .expect(200);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/cjdropshipping/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const body = dataOf(res);
            expect(body.state).toBe('DISCONNECTED');
            expect(body.connected).toBe(false);
            expect(body.hasAccessToken).toBe(false);
        });
    });
    describe('CJdropshipping resumable import job endpoints (admin-only)', () => {
        let adminToken;
        async function createCJJobWithCategory(source = 'phone case') {
            const cat = await prisma.category.create({
                data: { name: 'CJ Job Cat', slug: `cj-job-cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, isActive: true },
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/catalog/jobs')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ source, categoryId: cat.id, perRunLimit: 25, currency: 'INR', mode: 'update' })
                .expect(201);
            return { categoryId: cat.id, jobId: dataOf(res).id };
        }
        beforeEach(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'CJDROPSHIPPING' } });
            await prisma.productImportJob.deleteMany({});
            await prisma.category.deleteMany({ where: { slug: { startsWith: 'cj-job-cat-' } } });
            const { accessToken } = await authAgent(admin.email);
            adminToken = accessToken;
        });
        afterAll(async () => {
            await prisma.supplier.deleteMany({ where: { code: 'CJDROPSHIPPING' } });
            await prisma.productImportJob.deleteMany({});
        });
        it('creates a PENDING job with a valid category (no fetch, no credentials needed)', async () => {
            const { jobId: id } = await createCJJobWithCategory('phone case');
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get(`/api/suppliers/cjdropshipping/catalog/jobs/${id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const job = dataOf(res);
            expect(job.status).toBe('PENDING');
            expect(job.nextPage).toBe(1);
            expect(job.source).toBe('phone case');
            expect(job.mode).toBe('update');
            expect(job.importedCount).toBe(0);
            expect(job.failedIds).toEqual([]);
            expect(job.errorMessage).toBeNull();
        });
        it('rejects a job with a missing category (400)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/suppliers/cjdropshipping/catalog/jobs')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ source: 'phone case', categoryId: 'nope' })
                .expect(400);
        });
        it('advance without live credentials is a safe 400 (no products created)', async () => {
            const { jobId } = await createCJJobWithCategory('phone case');
            await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/suppliers/cjdropshipping/catalog/jobs/${jobId}/advance`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);
            const created = await prisma.product.count({ where: { supplierId: { not: null } } });
            expect(created).toBe(0);
        });
        it('cancel marks a pending job CANCELLED; further advance → 409', async () => {
            const { jobId } = await createCJJobWithCategory('phone case');
            const cancelled = await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/suppliers/cjdropshipping/catalog/jobs/${jobId}/cancel`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(dataOf(cancelled).status).toBe('CANCELLED');
            await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/suppliers/cjdropshipping/catalog/jobs/${jobId}/advance`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(409);
        });
        it('latest returns the most recent job for a source+category', async () => {
            const { categoryId, jobId } = await createCJJobWithCategory('phone case');
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/suppliers/cjdropshipping/catalog/jobs/latest')
                .query({ source: 'phone case', categoryId })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(dataOf(res).id).toBe(jobId);
        });
    });
    describe('CJdropshipping webhook receiver (public)', () => {
        it('is reachable without a token and acks (200) so CJ does not retry', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/webhooks/cjdropshipping')
                .send({ event: 'ORDER_STATUS_CHANGE', data: { orderId: 'x' } })
                .expect(200);
            expect(dataOf(res).success).toBe(true);
        });
    });
});
//# sourceMappingURL=suppliers.e2e-spec.js.map