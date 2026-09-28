import 'reflect-metadata';
import { Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule, Throttle } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { AppThrottlerGuard } from './app-throttler.guard';

/** Minimal controller exercising the M1 registration window (3/hour/IP). */
@Controller('auth')
class RegistrationHarnessController {
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @Post('register')
  register() {
    return { ok: true };
  }
}

/**
 * The global APP_GUARD is disabled when NODE_ENV==='test' (see AppModule), so
 * this harness registers AppThrottlerGuard directly and verifies the M1 sign-up
 * rate limit: 3 registrations succeed, the 4th is a 429 with the exact message.
 */
describe('AppThrottlerGuard — sign-up rate limit (M1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [RegistrationHarnessController],
      providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 3 registrations, then returns 429 with the exact M1 message', async () => {
    const server = app.getHttpServer();

    for (let i = 0; i < 3; i++) {
      const res = await request(server).post('/api/auth/register');
      expect(res.status).toBe(201);
    }

    const blocked = await request(server).post('/api/auth/register');
    expect(blocked.status).toBe(429);
    expect(blocked.body?.message).toBe(
      'Too many accounts created from this IP. Please try again in an hour.',
    );
  });
});