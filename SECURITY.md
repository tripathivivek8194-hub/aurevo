# AUREVO Security Findings — Red Team Audit Second Pass (2026-09-05)

## Scope
Second hardening pass targeting:
- **Payments webhook** (Razorpay): amount/currency integrity, idempotency ordering, state-transition guards, server-side authoritative amounts
- **Auth timing surface**: register/login/forgot/resend constant-time branches, no token leakage
- **Platform hardening**: CSP, Swagger prod gate, CJ webhook honesty, CSPRNG, no tokens in responses

**Explicitly out of scope**: SEO (Phase 11), IndiaMART (removed), CJdropshipping live verification (awaiting credentials).

---

## Findings Table

| ID | Vulnerability | Impact | Fix | Status |
|----|---------------|--------|-----|--------|
| A1 | Webhook amount/currency mismatch did not reject before idempotency | Attacker could replay a captured webhook with altered amount → order marked PAID for wrong value | `verifyPaymentWebhook`: compare webhook `amount`/`currency` against DB payment record **before** idempotency check; return `verified:false`, reason `AMOUNT_MISMATCH`/`CURRENCY_MISMATCH`; never call `order.update` | **VERIFIED** (31 unit tests + live probe pending) |
| A2 | Idempotency check ran before amount re-verification | Replay of a mismatched event could skip the integrity check on subsequent attempts | Reordered: amount/currency re-check runs **every time**; idempotency (`webhookVerified`) only after | **VERIFIED** (unit test: exactly 1 mutation across 2 events) |
| A3 | No order state-transition guard on webhook | `payment.captured` could flip `CANCELLED`/`SHIPPED`/`DELIVERED`/`REFUNDED`/`FAILED`/`PROCESSING`/`FULFILLMENT`/`RETURNED` back to `PAID` | `CAPTURE_ALLOWED_ORDER_STATES={PENDING,PAYMENT_PENDING,PAID}`, `FAILURE_ALLOWED_ORDER_STATES={PENDING,PAYMENT_PENDING,FAILED}`, `REFUND_ALLOWED_ORDER_STATES={PAID}`; rejected events return `ILLEGAL_ORDER_STATE` | **VERIFIED** (5 unit tests) |
| A4 | `create-order` accepted paid/cancelled orders; allowed duplicate live payment attempts | User could open a second Razorpay order for an already-paid order, or for a cancelled order | Gate on `order.status in (PENDING,PAYMENT_PENDING)`; `prisma.payment.findFirst({status:{notIn:['FAILED']}})` blocks second live attempt; retry after `FAILED` allowed | **VERIFIED** (5 unit tests) |
| A5 | Client could influence amount/currency sent to Razorpay | Price tampering via crafted request | `createRazorpayOrder` derives `amount`/`currency` **only** from `order.total`/`order.currency`; client supplies neither | **VERIFIED** (2 unit tests, paise regression test) |
| A6 | **Units bug**: paise/rupees confusion (4 conversion points) | `createRazorpayOrder` sent `order.total * 100` → 100× overcharge; webhook divided by 100 → all legitimate captures rejected; refund same bug | Removed all erroneous `*100` and `/100`; paise-throughout everywhere (Razorpay takes minor units = paise). Updated unit tests. | **VERIFIED** (31/31 unit tests pass; API rebuilt, server restarted) |
| B1 | Register timing leak: `findUnique` before `bcrypt.hash` | User enumeration via response time (existing email = slower) | `bcrypt.hash` called **before** `findUnique`; missing account burns `DUMMY_BCRYPT_HASH` | **VERIFIED** (unit: hash called, no `verificationToken` in response) |
| B2 | Login timing leak: early return for missing user | User enumeration via timing (missing user = faster 401) | `bcrypt.compare` against `user?.passwordHash ?? DUMMY_BCRYPT_HASH`; missing/wrong-password identical 401 body + identical compare timing | **VERIFIED** (unit: ghost compare + no token leak) |
| B3 | Forgot password returned different response for missing email | Account enumeration via response shape | Ghost user flow: `jwtService.sign` for missing account (1h, type=`password_reset`); identical `{success:true}` body | **VERIFIED** (unit test) |
| B4 | Resend verification returned different response for missing email | Account enumeration via response shape | Ghost user flow: `jwtService.sign` for missing account (24h, type=`email_verification`); identical `{success:true}` body | **VERIFIED** (unit test) |
| B5 | `isActive` checked before password compare | Inactive account skipped bcrypt work → timing delta | `isActive` gated **after** `bcrypt.compare`; inactive still burns work | **VERIFIED** (covered in unit) |
| B6 | Register response included `verificationToken` | Token leakage in HTTP response body | `register` returns `{user: sanitizeUser(user)}` only; token generated but not returned | **VERIFIED** (unit: no token in response; live probe: register 201 body lacks token) |
| C1 | CSP disabled (`contentSecurityPolicy: false`) | XSS surface wide open; no script/style/image/connect directives | Full Helmet CSP: `defaultSrc:self`, `scriptSrc:self`, `styleSrc:self unsafe-inline`, `imgSrc:self https: data:`, `connectSrc:self + origins`, `fontSrc:self`, `objectSrc:none`, `baseUri:self`, `formAction:self`, `frameAncestors:none`, `frameSrc:none`, `upgradeInsecureRequests` | **VERIFIED** (live: `Content-Security-Policy` header on 4000) |
| C2 | Swagger exposed in production | Admin API surface + bearer token persistence in prod | `shouldExposeApiDocs(nodeEnv) = nodeEnv !== 'production'`; `persistAuthorization: false`; gated in `main.ts` | **VERIFIED** (5 unit tests; live: `/docs` reachable in dev) |
| C3 | CJ webhook faked `verification: 'VERIFIED'` | False confidence; silent acceptance of unverified payloads | Returns `{success:true, verification:'UNVERIFIED'}`; logs `verification=UNVERIFIED, signature=present|NONE, bodyDigest=SHA256`; `@Throttle` applied; signature stub kept honest (never fakes) | **VERIFIED** (3 unit tests: UNVERIFIED + no service call + log contains digest) |
| C4 | Order numbers used `Math.random()` | Predictable/guessable order numbers | `secureRandomIndex(max)` using `crypto.getRandomValues` with rejection sampling; `generateOrderNumber` uses it; fallback to `Math.random` with warning | **VERIFIED** (1 unit test spies `crypto.getRandomValues`) |
| C5 | Password reset/verification tokens returned in HTTP responses | Token leakage if logs captured or response inspected | E2E tests use `mintToken` helper (app's JwtService) instead of relying on response tokens; `register`/`forgot`/`resend` never return tokens | **VERIFIED** (unit + E2E; live: register 201 lacks token) |

---

## Remaining Risks (UNVERIFIED / ACCEPTED)

| ID | Risk | Why Unverified / Accepted | Mitigation / Next Step |
|----|------|---------------------------|------------------------|
| R1 | **Live webhook probe not yet executed** | Server running but probe script not run in this session | Run `node aurevo-webhook-probe.cjs` from `apps/api` against port 4000 to confirm A1/A3 in production path |
| R2 | **CJ webhook signature verification not implemented** | CJdropshipping credentials not available; signing mechanism undocumented in public docs | Stub returns `UNVERIFIED` + logs digest — safe (no mutation). Implement real verification when CJ credentials + docs available |
| R3 | **CJdropshipping live verification pending** | No API key provided; sandbox credentials required | Obtain `CJ_API_KEY` from CJ Apps; run sandbox verification (auth → fetch products → import → dedupe → inventory/price) |
| R4 | **AliExpress order/trade/logistics DS operations untested** | App 544330 only granted `aliexpress.ds.category.get`; `solution.*`/`affiliate.*` return `InsufficientPermission` | Only `ds.category.get` (and param probes for `ds.product.get`/`ds.image.search`) verified live. Scope expansion needs app review |
| R5 | **Email delivery: Resend integrated, not live-verified** | `EmailService` sends via Resend API; no-op when `EMAIL_API_KEY` missing; test env neutralized | Live verification requires real `RESEND_API_KEY` in production env. E2E suite bypasses email (setup-env.ts sets key to empty) |
| R6 | **CSP `unsafe-inline` for styles** | Required by Tailwind/Vite runtime; acceptable for dev | Consider nonce/hash-based CSP for production build (Phase 11) |
| R7 | **Rate limiting on auth endpoints completed** | `forgot-password` 3/min, `resend-verification` 5/min, `register` 3/hr, `login` 5/min, `checkout` 5/min | Throttles now in place. `refresh` endpoint remains unthrottled (low risk: requires valid cookie). Documented as residual |
| R8 | **No account lockout after repeated failed logins** | Brute-force mitigated by 5/min rate limit, but no progressive lockout or exponential backoff | Acceptable for v1 given rate limits. Consider account lockout as a hardening follow-up |
| R9 | **`ADMIN_PASSWORD` not validated for weakness** | `env.validation.ts` validates JWT/ENCRYPTION keys but not `ADMIN_PASSWORD`. Seed now uses env var or CSPRNG (no hardcoded default). Operator-set weak passwords are accepted | Deployer responsibility. Documented. Consider adding strength check in future hardening |

---

## Credentials Required for Full Verification

| Credential | Purpose | Status |
|------------|---------|--------|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay test/live mode; webhook HMAC verification | **Configured in `.env`** — unit tests mock; live probe uses real secret |
| `CJ_API_KEY` | CJdropshipping sandbox/production API access | **NOT PROVIDED** — blocks Stage 13 live verification |
| `ALIEXPRESS_APP_KEY` / `ALIEXPRESS_APP_SECRET` / `ALIEXPRESS_ACCESS_TOKEN` | AliExpress Open Platform DS feed + OAuth | **Configured** — live verified 2026-09-02 (category.get only) |
| `ADMIN_EMAIL` / email provider API key | Bootstrap admin + password reset/verification emails | **ADMIN_EMAIL set**; email provider **NOT CONFIGURED** |
| `ENCRYPTION_KEY` | AES-256-GCM for supplier credential storage | **Configured** |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Auth token signing | **Configured** |

---

## Verification Evidence

| Check | Result | Evidence |
|-------|--------|----------|
| TypeScript compile (all workspaces) | ✅ PASS | `npx turbo build` — 4/4 tasks, all compile cleanly |
| ESLint (all workspaces) | ✅ PASS | `npx turbo lint` |
| Vite production build | ✅ PASS | `apps/web` — per-route code-split chunks confirmed (D2) |
| API unit tests | ✅ 202/202 | 16 suites; +31 payments, +22 auth, +5 swagger, +3 CJ, +1 shared, +9 email/cleanup |
| API E2E tests | ✅ 96/96 | 5 suites (incl. orders, catalog, auth, checkout, suppliers) |
| CSP header live | ✅ VERIFIED | `curl -I http://localhost:4000` → `Content-Security-Policy` present |
| Swagger gate live | ✅ VERIFIED | `GET /docs` returns Swagger UI in dev |
| Register response no token | ✅ VERIFIED | Live probe: `POST /api/auth/register` 201 body lacks `verificationToken` |
| Load test (Artillery, 2026-09-09) | ✅ VERIFIED | ~14,000 req/2.5min; peak 130 req/s sustained (50 VUs); p95 7.9ms, p99 22.9ms, max 919ms; **zero 5xx**; rate limiter returned 13,081 HTTP 429s (93% of flood traffic throttled) |
| Payments create-order auth | ✅ VERIFIED | Live: unauthenticated → 401 |
| Guest order IDOR (S3) | ✅ VERIFIED | `assertGuestReadAuth` throws NotFoundException (404) for guests |
| Checkout rate limit | ✅ VERIFIED | `@Throttle({ default: { limit: 5, ttl: 60000 } })` on POST /checkout |
| Skip link (a11y) | ✅ FIXED | Both StoreLayout and AdminLayout: `sr-only focus:not-sr-only` skip link → `<main id="main-content">` |
| Label/input associations (a11y) | ✅ FIXED | Checkout AddressForm: `htmlFor`/`id` pairs, `aria-required`, `aria-invalid`, `aria-describedby` on errors |
| Guest email label (a11y) | ✅ FIXED | Checkout guest email: `<label htmlFor="checkout-email">` with `aria-required="true"` |
| Dropdown keyboard nav (a11y) | ✅ FIXED | `aria-haspopup="menu"`, `aria-expanded`, ArrowDown/ArrowUp/Home/End keyboard navigation |
| Dead code: JwtRefreshStrategy | ✅ REMOVED | Registered but never used via `AuthGuard('jwt-refresh')`; `authService.refresh()` handles revocation independently |
| `console.log` → Logger (API) | ✅ FIXED | `main.ts`, `payments.service.ts`, `suppliers.service.ts` — all now use NestJS `Logger` |

---

## Summary

**All acceptance criteria from the RED TEAM directive are met in code and unit tests:**

1. ✅ Amount/currency-mismatched webhook **never marks PAID** (A1)
2. ✅ No order flips to PAID from CANCELLED/SHIPPED/DELIVERED/REFUNDED/FAILED/PROCESSING/FULFILLMENT/RETURNED (A3)
3. ✅ Create-order rejects paid/cancelled orders; no duplicate live orders (A4)
4. ✅ Auth branches constant-time: register/login/forgot/resend burn equivalent work for missing accounts (B1–B5)
5. ✅ CSP enabled with real policy (C1)
6. ✅ No token in any HTTP response (C5)
7. ✅ All tests green: 202 unit + 96 E2E; builds clean

**Phase 12 (Testing & Security Review) — additional fixes applied:**
8. ✅ Checkout POST rate-limited (5/min per IP)
9. ✅ Guest order IDOR verified: `assertGuestReadAuth` throws NotFoundException (404)
10. ✅ WCAG 2.1 AA a11y audit: skip links, label/input associations, Dropdown keyboard nav — all fixed
11. ✅ Dead code removed: `JwtRefreshStrategy` (registered but never used)
12. ✅ `console.log`/`console.error` replaced with NestJS Logger in `main.ts`, `payments.service.ts`, `suppliers.service.ts`

**Three credential-dependent items remain unverified**: CJdropshipping live verification (needs `CJ_API_KEY`), AliExpress order/logistics scope expansion (needs app permission review), and real Resend email delivery (needs live `RESEND_API_KEY` in production env).

**Load test (2026-09-09, Artillery, run by operator):** ~14,000 requests over 2.5 minutes; peak 130 req/s sustained at 50 VUs; p95 **7.9ms**, p99 **22.9ms**, max 919ms; **zero 5xx** — no crashes, no connection-pool exhaustion under flooding. Rate limiter worked as intended: 13,081 HTTP 429s throttled 93% of flood traffic. (The 418 "Failed capture" entries are a test artifact — the Product-detail scenario's slug capture fails when the products request itself is rate-limited, not an API bug.) **Verdict: API is resilient under request flooding.**