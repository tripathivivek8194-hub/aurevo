"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const jwt_1 = require("@nestjs/jwt");
const create_app_1 = require("../src/create-app");
const prisma_service_1 = require("../src/database/prisma.service");
describe('AUREVO E2E (Phases 1–3): health, auth, role gating', () => {
    let app;
    let prisma;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const customer = {
        email: 'customer@test.dev',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
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
    function refreshCookie(res) {
        const header = res.headers['set-cookie'];
        const line = Array.isArray(header)
            ? header.find((c) => c.startsWith('refresh_token='))
            : typeof header === 'string' && header.startsWith('refresh_token=')
                ? header
                : undefined;
        return line ? line.split(';')[0] : undefined;
    }
    function dataOf(res) {
        return res.body.data;
    }
    function mintToken(userId, type) {
        const jwtService = app.get(jwt_1.JwtService);
        const expiresIn = type === 'email_verification' ? '24h' : '1h';
        return jwtService.sign({ sub: userId, type }, { expiresIn });
    }
    describe('health', () => {
        it('reports liveness', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/health').expect(200);
        });
    });
    describe('register', () => {
        it('creates a customer account without exposing the password hash', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/register')
                .send(customer)
                .expect(201);
            const user = dataOf(res).user;
            expect(user).toMatchObject({
                email: customer.email,
                role: 'CUSTOMER',
                isActive: true,
            });
            expect(user).not.toHaveProperty('passwordHash');
            expect(dataOf(res).verificationToken).toBeUndefined();
        });
        it('rejects a duplicate email with 409', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/register')
                .send(customer)
                .expect(409);
        });
        it('rejects a weak password with 400 via the global ValidationPipe', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/register')
                .send({ ...customer, password: 'short' })
                .expect(400);
        });
    });
    describe('login & authenticated session', () => {
        it('logs in, issues an access token + refresh cookie, and reads /me', async () => {
            const agent = supertest_1.default.agent(app.getHttpServer());
            await agent.post('/api/auth/register').send(customer).expect(201);
            const login = await agent
                .post('/api/auth/login')
                .send({ email: customer.email, password: customer.password })
                .expect(200);
            const loginData = dataOf(login);
            expect(loginData.accessToken).toBeDefined();
            expect(refreshCookie(login)).toBeDefined();
            const me = await agent
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${loginData.accessToken}`)
                .expect(200);
            expect(dataOf(me).email).toBe(customer.email);
        });
        it('rejects a wrong password with 401', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/login')
                .send({ email: customer.email, password: 'WrongPassword1' })
                .expect(401);
        });
        it('does not reveal whether an unknown email exists (401)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/login')
                .send({ email: 'nobody@test.dev', password: 'Password123!' })
                .expect(401);
        });
    });
    describe('refresh token rotation & revocation', () => {
        it('rotates on refresh and revokes the previous token via the denylist', async () => {
            const agent = supertest_1.default.agent(app.getHttpServer());
            await agent.post('/api/auth/register').send(customer).expect(201);
            const login = await agent
                .post('/api/auth/login')
                .send({ email: customer.email, password: customer.password })
                .expect(200);
            const oldRefresh = refreshCookie(login);
            expect(oldRefresh).toBeDefined();
            const refreshed = await agent.post('/api/auth/refresh').expect(200);
            expect(dataOf(refreshed).accessToken).toBeDefined();
            const newRefresh = refreshCookie(refreshed);
            expect(newRefresh).toBeDefined();
            expect(newRefresh).not.toBe(oldRefresh);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/refresh')
                .set('Cookie', oldRefresh)
                .expect(401);
            const again = await agent.post('/api/auth/refresh').expect(200);
            expect(dataOf(again).accessToken).toBeDefined();
        });
        it('rejects a request with no refresh cookie (401)', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).post('/api/auth/refresh').expect(401);
        });
    });
    describe('logout', () => {
        it('revokes the refresh token and clears the cookie', async () => {
            const agent = supertest_1.default.agent(app.getHttpServer());
            await agent.post('/api/auth/register').send(customer).expect(201);
            const login = await agent
                .post('/api/auth/login')
                .send({ email: customer.email, password: customer.password })
                .expect(200);
            const refreshBeforeLogout = refreshCookie(login);
            expect(refreshBeforeLogout).toBeDefined();
            await agent
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${dataOf(login).accessToken}`)
                .expect(200);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/refresh')
                .set('Cookie', refreshBeforeLogout)
                .expect(401);
        });
    });
    describe('password reset', () => {
        it('resets the password, invalidating the old one', async () => {
            const reg = await (0, supertest_1.default)(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);
            const userId = dataOf(reg).user.id;
            const forgot = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/forgot-password')
                .send({ email: customer.email })
                .expect(200);
            expect(dataOf(forgot)).toEqual({ success: true });
            const resetToken = mintToken(userId, 'password_reset');
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/reset-password')
                .send({
                token: resetToken,
                password: 'NewPassword123',
                confirmPassword: 'NewPassword123',
            })
                .expect(200);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/login')
                .send({ email: customer.email, password: customer.password })
                .expect(401);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/login')
                .send({ email: customer.email, password: 'NewPassword123' })
                .expect(200);
        });
        it('rejects a reset when password and confirmPassword do not match', async () => {
            const reg = await (0, supertest_1.default)(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);
            const userId = dataOf(reg).user.id;
            const resetToken = mintToken(userId, 'password_reset');
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/reset-password')
                .send({ token: resetToken, password: 'NewPassword123', confirmPassword: 'Different123' })
                .expect(400);
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/login')
                .send({ email: customer.email, password: customer.password })
                .expect(200);
        });
        it('does not reveal whether an unknown email exists in forgot-password', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/forgot-password')
                .send({ email: 'ghost@test.dev' })
                .expect(200);
            expect(dataOf(res)).toEqual({ success: true });
        });
    });
    describe('email verification', () => {
        it('verifies an email with the token issued at registration', async () => {
            const reg = await (0, supertest_1.default)(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);
            expect(dataOf(reg).verificationToken).toBeUndefined();
            const userId = dataOf(reg).user.id;
            const verificationToken = mintToken(userId, 'email_verification');
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/auth/verify-email')
                .send({ token: verificationToken })
                .expect(200);
            const user = await prisma.user.findUnique({ where: { email: customer.email } });
            expect(user?.emailVerified).toBe(true);
        });
    });
    describe('role-based access control (admin gating)', () => {
        it('blocks unauthenticated access to an admin route (401)', async () => {
            await (0, supertest_1.default)(app.getHttpServer()).get('/api/orders').expect(401);
        });
        it('blocks an invalid bearer token (401)', async () => {
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders')
                .set('Authorization', 'Bearer not-a-valid-jwt')
                .expect(401);
        });
        it('forbids a CUSTOMER from an admin route (403)', async () => {
            const agent = supertest_1.default.agent(app.getHttpServer());
            await agent.post('/api/auth/register').send(customer).expect(201);
            const login = await agent
                .post('/api/auth/login')
                .send({ email: customer.email, password: customer.password })
                .expect(200);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders')
                .set('Authorization', `Bearer ${dataOf(login).accessToken}`)
                .expect(403);
        });
        it('allows an ADMIN (ADMIN_EMAIL promoter) on an admin route (200)', async () => {
            const admin = { ...customer, email: ADMIN_EMAIL };
            const agent = supertest_1.default.agent(app.getHttpServer());
            const reg = await agent.post('/api/auth/register').send(admin).expect(201);
            expect(dataOf(reg).user.role).toBe('ADMIN');
            const login = await agent
                .post('/api/auth/login')
                .send({ email: admin.email, password: admin.password })
                .expect(200);
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/orders')
                .set('Authorization', `Bearer ${dataOf(login).accessToken}`)
                .expect(200);
        });
    });
});
//# sourceMappingURL=app.e2e-spec.js.map