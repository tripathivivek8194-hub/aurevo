import { HttpException, HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * Builds and configures the AUREVO NestJS application with the exact runtime
 * wiring used in production: global `/api` prefix, security middleware, cookie
 * parsing (refresh tokens), CORS, and the global validation pipe.
 *
 * Shared by `main.ts` (bootstrap + Swagger + listen) and the E2E test harness
 * so the tests exercise the real configuration instead of a test-only replica.
 * The returned app is configured but not started — callers decide whether to
 * `listen()` (bootstrap) or `init()` (tests).
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    // Capture the raw request body alongside the parsed JSON — Razorpay signs
    // the exact byte stream it sends, so webhook signature verification must
    // HMAC the unparsed body, never a re-serialized object.
    rawBody: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Security middleware (M6): clickjacking/deny, no MIME sniffing, a strict
  // referrer policy, and 1-year HSTS (incl. subdomains). CSP (C1) is now an
  // explicit policy instead of `false` — `default-src 'self'`, scripts only from
  // self, frames denied entirely (frame-ancestors 'none'), and `connect-src`
  // limited to the API origin plus the configured store origin.
  const apiOrigin = `http://localhost:${process.env.PORT || 4000}`;
  const webOrigin = (process.env.WEB_URL ?? '').trim().replace(/\/+$/, '');
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline' for scripts. NOTE: this means the dev-only Swagger
        // UI at /docs (which injects an inline boot script) will not render —
        // accepted trade-off for a non-prod tool; the policy is never silently
        // re-disabled, and the API JSON responses the store consumes are
        // unaffected.
        scriptSrc: ["'self'"],
        // 'unsafe-inline' for styles only — CSP on API-originated pages is inert
        // for the store's (separate-origin) React UI, and Swagger's inline style
        // blocks keep working.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'https:', 'data:'],
        connectSrc: ["'self'", ...new Set([apiOrigin, webOrigin].filter(Boolean))],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }));

  // Cookie parser for refresh tokens
  app.use(cookieParser());

  // CORS (M6): allow the store origin plus the local dev origins — the React
  // dev server on :3000, the Vite dev server on :5173, and their 127.0.0.1
  // loopback aliases — with credentials (refresh-token cookies must cross the
  // origin). A wildcard `*` is impossible here: an explicit allow-list is
  // enforced, and unknown origins receive a real 403 with no echoed
  // Access-Control-Allow-Origin, never a crash.
  // Local dev: Vite auto-increments its dev-port (3001, 3002, …) whenever 3000
  // is already bound, so cap the whole 3000-3009 loopback range in addition to
  // the canonical origin. Only loopback hosts are accepted here — no remote
  // origin can spoof `http://localhost` / `http://127.0.0.1`, so this does not
  // weaken the allow-list against cross-origin attacks.
  const localhostDevPorts = Array.from({ length: 10 }, (_, i) => `http://localhost:${3000 + i}`);
  const loopbackDevPorts = Array.from({ length: 10 }, (_, i) => `http://127.0.0.1:${3000 + i}`);

  const allowedOrigins = new Set(
    [
      process.env.WEB_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      ...localhostDevPorts,
      ...loopbackDevPorts,
    ]
      .map((o) => o?.trim().replace(/\/+$/, ''))
      .filter((o): o is string => Boolean(o)),
  );

  app.enableCors({
    origin: (origin, callback) => {
      try {
        // Same-origin / no-Origin requests (curl, health checks, the Vite dev
        // proxy) are always allowed — CORS only gates cross-origin browser
        // traffic, and those callers send no Origin header.
        if (!origin || allowedOrigins.has(origin)) {
          return callback(null, true);
        }
        // Reject with a real 403 for the client. The error object is handed to
        // NestJS's global exception filter (it routes to a 403 response) —
        // it is never thrown, so it cannot surface as an unhandled exception.
        return callback(
          new HttpException('Origin not allowed', HttpStatus.FORBIDDEN),
          false,
        );
      } catch {
        // Last-resort: if anything in the callback above ever throws
        // unexpectedly, deny via missing header (browser blocks the read)
        // instead of letting the error escape and crash the server.
        return callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global validation pipe (M6): whitelist + forbid unknown fields, transform
  // on, but implicit type conversion OFF — every numeric/bool field must be
  // explicitly typed (`@Type(() => Number|Boolean)`) or validated as a string.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  return app;
}