import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';

/**
 * E2E coverage for Phases 1–3 close-out.
 *
 * The full `AppModule` is booted through `createApp()` (the exact production
 * wiring — global `/api` prefix, cookie parsing, validation pipe), Prisma uses
 * the isolated `test-e2e.db` built by global-setup, and the auth + role-gating
 * behavior the plan's Verification Strategy calls for is asserted over HTTP.
 */
describe('AUREVO E2E (Phases 1–3): health, auth, role gating', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL as string;

  const customer = {
    email: 'customer@test.dev',
    password: 'Password123!',
    firstName: 'Test',
    lastName: 'User',
  };

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset the auth tables (FK-safe order) so each test starts clean.
    await prisma.revokedToken.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
  });

  /** Extracts `refresh_token=<token>` from a response's Set-Cookie headers. */
  function refreshCookie(res: request.Response): string | undefined {
    const header = res.headers['set-cookie'];
    const line = Array.isArray(header)
      ? header.find((c) => c.startsWith('refresh_token='))
      : typeof header === 'string' && header.startsWith('refresh_token=')
        ? header
        : undefined;
    return line ? line.split(';')[0] : undefined;
  }

  /** Unwraps the global `{ success, data, meta }` response envelope. */
  function dataOf<T>(res: request.Response): T {
    return res.body.data as T;
  }

  /**
   * C5-adapted helper: verification/reset tokens are NEVER returned in an HTTP
   * response anymore. Tests that need one mint it directly — the exact JWT the
   * transactional email would carry — via the app's configured JwtService
   * (secret = JWT_ACCESS_SECRET, set by setup-env.ts).
   */
  function mintToken(userId: string, type: 'email_verification' | 'password_reset'): string {
    const jwtService = app.get(JwtService);
    const expiresIn = type === 'email_verification' ? '24h' : '1h';
    return jwtService.sign({ sub: userId, type }, { expiresIn });
  }

  describe('health', () => {
    it('reports liveness', async () => {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    });
  });

  describe('register', () => {
    it('creates a customer account without exposing the password hash', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(customer)
        .expect(201);

      const user = dataOf<{ user: { email: string; role: string; isActive: boolean } }>(res).user;
      expect(user).toMatchObject({
        email: customer.email,
        role: 'CUSTOMER',
        isActive: true,
      });
      expect(user).not.toHaveProperty('passwordHash');
      // C5: single-use verification tokens are minted for email delivery only —
      // they must never travel in an HTTP response.
      expect(dataOf<{ verificationToken?: string }>(res).verificationToken).toBeUndefined();
    });

    it('rejects a duplicate email with 409', async () => {
      await request(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(customer)
        .expect(409);
    });

    it('rejects a weak password with 400 via the global ValidationPipe', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...customer, password: 'short' })
        .expect(400);
    });
  });

  describe('login & authenticated session', () => {
    it('logs in, issues an access token + refresh cookie, and reads /me', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/register').send(customer).expect(201);

      const login = await agent
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(200);

      const loginData = dataOf<{ accessToken: string }>(login);
      expect(loginData.accessToken).toBeDefined();
      expect(refreshCookie(login)).toBeDefined();

      const me = await agent
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginData.accessToken}`)
        .expect(200);
      expect(dataOf<{ email: string }>(me).email).toBe(customer.email);
    });

    it('rejects a wrong password with 401', async () => {
      await request(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: customer.email, password: 'WrongPassword1' })
        .expect(401);
    });

    it('does not reveal whether an unknown email exists (401)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.dev', password: 'Password123!' })
        .expect(401);
    });
  });

  describe('refresh token rotation & revocation', () => {
    it('rotates on refresh and revokes the previous token via the denylist', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/register').send(customer).expect(201);
      const login = await agent
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(200);
      const oldRefresh = refreshCookie(login);
      expect(oldRefresh).toBeDefined();

      // Refresh → new access token + rotated cookie.
      const refreshed = await agent.post('/api/auth/refresh').expect(200);
      expect(dataOf<{ accessToken: string }>(refreshed).accessToken).toBeDefined();
      const newRefresh = refreshCookie(refreshed);
      expect(newRefresh).toBeDefined();
      expect(newRefresh).not.toBe(oldRefresh);

      // Replaying the *old* refresh token must now fail — it is revoked.
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', oldRefresh as string)
        .expect(401);

      // The *new* token still works.
      const again = await agent.post('/api/auth/refresh').expect(200);
      expect(dataOf<{ accessToken: string }>(again).accessToken).toBeDefined();
    });

    it('rejects a request with no refresh cookie (401)', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token and clears the cookie', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/register').send(customer).expect(201);
      const login = await agent
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(200);
      const refreshBeforeLogout = refreshCookie(login);
      expect(refreshBeforeLogout).toBeDefined();

      await agent
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${dataOf<{ accessToken: string }>(login).accessToken}`)
        .expect(200);

      // The pre-logout refresh token is now revoked.
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshBeforeLogout as string)
        .expect(401);
    });
  });

  describe('password reset', () => {
    it('resets the password, invalidating the old one', async () => {
      const reg = await request(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);
      const userId = dataOf<{ user: { id: string } }>(reg).user.id;

      const forgot = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: customer.email })
        .expect(200);
      // C5: the response is a bare { success: true } — the reset token is
      // delivered by email, never by HTTP.
      expect(dataOf(forgot)).toEqual({ success: true });
      const resetToken = mintToken(userId, 'password_reset');

      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        })
        .expect(200);

      // Old password no longer works; the new one does.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: customer.email, password: 'NewPassword123' })
        .expect(200);
    });

    it('rejects a reset when password and confirmPassword do not match', async () => {
      const reg = await request(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);
      const userId = dataOf<{ user: { id: string } }>(reg).user.id;
      const resetToken = mintToken(userId, 'password_reset');

      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: resetToken, password: 'NewPassword123', confirmPassword: 'Different123' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(200);
    });

    it('does not reveal whether an unknown email exists in forgot-password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@test.dev' })
        .expect(200);
      // B1/C5: body is byte-identical to the existing-email case — { success: true },
      // with no token and no indication of account existence.
      expect(dataOf(res)).toEqual({ success: true });
    });
  });

  describe('email verification', () => {
    it('verifies an email with the token issued at registration', async () => {
      const reg = await request(app.getHttpServer()).post('/api/auth/register').send(customer).expect(201);
      // C5: the registration response must not carry the verification token —
      // the test mints the exact token the (future) email would deliver.
      expect(dataOf<{ verificationToken?: string }>(reg).verificationToken).toBeUndefined();
      const userId = dataOf<{ user: { id: string } }>(reg).user.id;
      const verificationToken = mintToken(userId, 'email_verification');

      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: verificationToken })
        .expect(200);

      const user = await prisma.user.findUnique({ where: { email: customer.email } });
      expect(user?.emailVerified).toBe(true);
    });
  });

  describe('role-based access control (admin gating)', () => {
    it('blocks unauthenticated access to an admin route (401)', async () => {
      await request(app.getHttpServer()).get('/api/orders').expect(401);
    });

    it('blocks an invalid bearer token (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', 'Bearer not-a-valid-jwt')
        .expect(401);
    });

    it('forbids a CUSTOMER from an admin route (403)', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/register').send(customer).expect(201);
      const login = await agent
        .post('/api/auth/login')
        .send({ email: customer.email, password: customer.password })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', `Bearer ${dataOf<{ accessToken: string }>(login).accessToken}`)
        .expect(403);
    });

    it('allows an ADMIN (ADMIN_EMAIL promoter) on an admin route (200)', async () => {
      const admin = { ...customer, email: ADMIN_EMAIL };
      const agent = request.agent(app.getHttpServer());
      const reg = await agent.post('/api/auth/register').send(admin).expect(201);
      expect(dataOf<{ user: { role: string } }>(reg).user.role).toBe('ADMIN');

      const login = await agent
        .post('/api/auth/login')
        .send({ email: admin.email, password: admin.password })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', `Bearer ${dataOf<{ accessToken: string }>(login).accessToken}`)
        .expect(200);
    });
  });
});