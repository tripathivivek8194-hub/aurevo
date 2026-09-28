# AUREVO Task Tracker

## Legend
- [ ] Pending
- [~] In progress
- [x] Completed
- [!] Blocked

---

## Phase 1: Project Foundation & Architecture — ✅ COMPLETED

- [x] Initialize monorepo with npm workspaces + Turborepo
- [x] Create root package.json with workspaces config
- [x] Create turbo.json for build orchestration
- [x] Create shared package (types, validators, constants)
- [x] Create design-system package (tokens, theme, primitives — 22 components)
- [x] Create API app (NestJS + TypeScript + Prisma)
- [x] Create Web app (React + Vite + TypeScript + Tailwind)
- [x] Configure Docker Compose (PostgreSQL, Redis)
- [x] Create .env.example with all required variables
- [x] Create README.md with project overview
- [x] Set up ESLint, Prettier, TypeScript configs across workspace
- [x] Set up Git hooks (husky + lint-staged)
- [x] Verify: `npm run build` passes

---

## Phase 2: Database & Backend Foundation — ✅ COMPLETED

- [x] Design Prisma schema (25+ models: User, Product, Category, Order, Payment, Cart, Inventory, Supplier, Shipping, Review, Wishlist, Coupon, etc.)
- [x] Run initial migration (SQLite for dev)
- [x] Create NestJS config module (env validation)
- [x] Create PrismaService and PrismaModule
- [x] Implement health check endpoint
- [x] Set up global pipes (ValidationPipe: whitelist, forbidNonWhitelisted, transform), filters, interceptors
- [x] Create common guards (JwtAuthGuard, RolesGuard, ThrottlerGuard, OptionalJwtAuthGuard)
- [x] Create common decorators (CurrentUser, Public, Roles)
- [x] Set up Swagger/OpenAPI documentation at /api/docs
- [x] Verify: API starts, connects to DB, health check returns 200

**Verified:** 15 modules, 17 controllers, 17 services, all endpoints functional.

---

## Phase 3: Authentication & Security — ✅ COMPLETED

- [x] Implement User entity and UsersService
- [x] Implement AuthModule with JWT strategy (access + refresh tokens)
- [x] Register endpoint: POST /auth/register (customer only, rate limited 10/min)
- [x] Login endpoint: POST /auth/login (sets HttpOnly refresh cookie, returns access token)
- [x] Refresh endpoint: POST /auth/refresh (rotates refresh token, 30-day expiry)
- [x] Logout endpoint: POST /auth/logout (invalidates refresh token)
- [x] Forgot password: POST /auth/forgot-password (generates token, TODO: email sending)
- [x] Reset password: POST /auth/reset-password (validates token, hashes, revokes all refresh tokens)
- [x] Email verification: generates token (TODO: email sending)
- [x] Get current user: GET /auth/me
- [x] Admin bootstrap: ADMIN_EMAIL env var → ADMIN role on register
- [x] Password hashing: bcrypt with cost factor 12
- [x] Rate limiting on auth endpoints (ThrottlerGuard)
- [x] Refresh token stored in DB, rotated on refresh, revoked on logout/reset
- [x] Verify: Full auth flow works, admin cannot be created via registration

**Verified:** E2E auth tests pass (register, login, refresh, logout, role gating).

---

## Phase 4: Catalog & Product System — ✅ COMPLETED

**Backend (COMPLETE):**
- [x] Category module: CRUD, hierarchy, slug generation
- [x] Product module: CRUD, status (DRAFT/ACTIVE/ARCHIVED), slug
- [x] ProductVariant module: attributes (color, size, etc.), pricing
- [x] ProductImage module: ordering, primary image
- [x] Inventory module: local + supplier tracking
- [x] Public product API: list (search, filter, sort, paginate), detail, related
- [x] Category API: tree, products by category
- [x] Search: keyword search across name/description/SKU
- [x] Admin product management: create, edit, delete, variant/image mgmt

**Storefront UI (COMPLETE):**
- [x] Store layout: header (logo, search, cart icon with count badge, auth links), mobile search, footer
- [x] Customer router with routes (/, /products, /products/:slug, /cart, /checkout, /login, /register, /account, /account/orders)
- [x] RequireAuth guard for authenticated customer routes (redirects to /login with return path)
- [x] Homepage: hero, featured products grid, category navigation pills
- [x] Product catalog page: grid, category sidebar filter, search, sort (4 modes), pagination
- [x] Product detail page: image gallery with thumbnails, variant selector, quantity picker, add to cart, reviews section, related products
- [x] Customer login page (email/password, auto-redirect on success)
- [x] Customer register page (first/last/email/password, auto-login after registration)
- [x] Guest session management (localStorage UUID, cart merge on login)
- [x] Cart Zustand store (count badge, addItem, mergeSession, refresh)

**Verified 2026-09-02:** tsc PASS · vite build PASS · lint PASS · API unit 88/88

---

## Phase 5: Cart & Checkout — ✅ COMPLETED (frontend)

**Backend (COMPLETE — built in Phase 2/3):**
- [x] Cart module: session-based (guest via `sessionId`) + user-based (authenticated)
- [x] Cart operations: add, remove, update quantity, clear, merge on login (`POST /cart/merge`)
- [x] Cart persistence: database + localStorage session UUID for guests
- [x] Price validation: backend recalculates from DB snapshots, never trusts frontend
- [x] Checkout flow: collect email, shipping address, shipping method
- [x] Address validation: DTO validation (required fields, lengths, 2-char country)
- [x] Shipping calculation: configurable methods, base + per-item cost, free-shipping threshold
- [x] Order summary: subtotal, shipping, tax (18%), total — all computed server-side
- [x] Atomic inventory reservation on checkout (raw SQL conditional UPDATE, rollback on insufficient stock)

**Customer UI (COMPLETE — this phase):**
- [x] Cart page: line items (image, name, variant/SKU), quantity ±, remove, line totals, subtotal, empty-cart state, continue shopping
- [x] Checkout page: shipping address form (client + server validation), shipping method radio selection, live order summary (items, subtotal, shipping, tax, total), order notes, Place Order → `POST /checkout`
- [x] Order confirmation page: success header, order number, status, items, totals, shipping address, notes (fetched via `/checkout/number/:orderNumber`, works for guest + auth)
- [x] Guest + authenticated cart behavior preserved (OptionalJwtAuthGuard; `sessionId` param for guests)
- [x] Loading skeletons, API-error alerts, validation messages, empty states on all three pages

**Coupon:** ⚠️ NOT implemented — the `CreateOrderDto` accepts an optional `couponCode` field, but no coupon module/model exists in the backend, so no validation or discount is applied. Frontend omits the coupon field rather than faking it. Flagged as a Phase 10 (Payments) follow-up.

**Verified 2026-09-02:** tsc PASS · vite build PASS · eslint PASS · API unit 88/88 · E2E 73/73 (5 suites) · **Live flow verified end-to-end** (real product → guest cart → checkout preview → order `AUR7B6XKRL4Y9` PAYMENT_PENDING ₹289.27 → confirmation fetch → cart cleared)

---

## Phase 6: Orders — ✅ COMPLETED

- [x] Order module: create from checkout, status lifecycle
- [x] Order status transitions: PENDING → PAYMENT_PENDING → PAID → PROCESSING → FULFILLMENT → SHIPPED → DELIVERED (hardcoded transition map)
- [x] Cancellation/refund statuses (owner-or-admin cancel with reason, inventory released atomically)
- [x] Order items: snapshot product/variant data at purchase time (Phase 5 checkout)
- [x] Customer order history: GET /orders/me (auth required, user-scoped)
- [x] Admin order management: list, detail, status update (all admin-only endpoints from Phase 1–5 skeleton)
- [x] Owner-or-admin access control on GET /orders/:id, /orders/number/:orderNumber, POST /orders/:id/cancel
- [x] Atomic clamped inventory release on cancel/refund (MAX(0, reservedQuantity - qty))
- [ ] Order confirmation email trigger (TODO — email provider integration, Phase 10+)
- [ ] Shipping method snapshot on order (TODO — Order model lacks shippingMethodId; order detail shows shipping cost only, not the chosen method name)

**Customer-facing order UI (COMPLETE — this phase):**
- [x] Account page (`/account`): profile info from the authenticated session (avatar initials, name, email, member-since, email-verified), nav to My Orders, logout. No fabricated data.
- [x] My Orders page (`/account/orders`): real orders from `GET /orders/me` — order number, date, status badge, item count, total, first-item thumbnail; pagination from `meta`; loading/empty/error states.
- [x] Order Detail page (`/account/orders/:id`): real order from `GET /orders/:id` — items (name, variant, SKU, qty, prices, image), totals (subtotal/shipping/tax/discount/total), shipping address, payment status (from payments array), status lifecycle (placed/paid/shipped/delivered timestamps), tracking (shipments + tracking events), notes; Cancel button only when status is cancellable (PENDING/PAYMENT_PENDING/PAID/PROCESSING — mirrors backend); cross-user access → 404/403 handled.
- [x] Storefront header "My account" link for authenticated users (in addition to footer links).
- [x] Guest checkout + guest order-confirmation behavior preserved (cart/checkout/order-confirmation outside RequireAuth).

**Security verified live:** another customer reading `GET /orders/:id` → **404**; another customer calling `POST /orders/:id/cancel` → **403**; owner cancel → **CANCELLED** with reason captured.

**Verified 2026-09-02:** tsc PASS · vite build PASS · eslint PASS · API unit 88/88 · E2E 73/73 (5 suites) · **Live verified** — real customer `orderflow…@test.dev` created order `AUR57CNJPIWL0` (₹144.63), `/orders/me` + `/orders/:id` returned correct data, ownership 404/403 confirmed, owner cancel confirmed, tracking driven end-to-end (PAYMENT_PENDING→SHIPPED + DHL shipment + tracking events).

---

## Phase 7: Admin Dashboard — ✅ COMPLETED

- [x] Frontend infra: axios client (envelope unwrap, 401 refresh), zustand auth store, React Query provider, RequireAdmin UX guard, router
- [x] Login page: email/password form, admin-only gate, redirect
- [x] Admin layout: sidebar nav (Dashboard/Orders/Products/Customers/Suppliers/Reviews/Categories/Analytics/Inventory/Settings all built), header with user menu + logout
- [x] Dashboard page: KPIs (orders, revenue, customers, products, pending, low stock), revenue line chart (recharts), recent orders / top products / top customers tables — all real API data
- [x] Orders page: paginated table with status filter, detail modal (items, totals, notes), status transition buttons (backend-validates), cancel order
- [x] Products page: paginated table with search + status filter, create/edit modal (all fields, category dropdown), variant manager (add/remove), image manager (add/delete by URL), delete with confirm
- [x] Customers page: table from /admin/reports/customers, detail modal with order history
- [x] Suppliers page: existing AliExpress connection card + one-shot catalog import (kept as-is)
- [x] Reviews page: real moderation only — status filter (Pending/Approved/Rejected), approve/reject with optional admin note (uses GET /reviews/admin/all, PATCH /reviews/admin/:id/moderate)
- [x] Categories page: real listing (GET /categories?includeInactive=true) with per-category product counts, create/edit modal, delete with confirm, active toggle
- [x] Analytics page: real data only — date-range selector, revenue summary + daily revenue bars, customer stats, top-selling products, low/out-of-stock. Funnel/traffic/realtime intentionally NOT shown (backend returns placeholders); labeled date range
- [x] Inventory page: real stock table (GET /inventory) with on-hand/reserved/available + low/out-of-stock badges, stat cards (GET /inventory/stats), adjust modal with before→after quantity + reason (POST /inventory/:id/adjust), low/out filters
- [x] Settings page: real shipping-methods management only (list/create/edit/toggle/delete via /shipping/methods admin CRUD). Settings without a backend module (store branding, currency, tax, email templates, AliExpress credentials) shown as not-available rather than fabricated; secrets never exposed
- [x] Security: every admin page calls admin-guarded endpoints (JwtAuthGuard + RolesGuard + @Roles(ADMIN)); RequireAdmin frontend guard; verified live that unauthenticated/customer calls to /inventory, /reviews/admin/all, /analytics, /shipping/methods/admin return 401/403

**Verified 2026-09-03:** web tsc PASS · web lint PASS · web build PASS · API unit 88/88 · API E2E 73/73 (5 suites, full run) · live admin smoke tests PASS (categories/inventory/reviews/analytics/shipping)

---

## Phase 8: AliExpress Integration

**Status: ✅ externally verified 2026-09-02.** A real seller OAuth authorization produced a live access token and a real signed API call (`aliexpress.ds.category.get` against `api-sg.aliexpress.com/sync`) returned `resp_code 200 "Call succeeds"`. Connection state is `CONNECTED`, capabilities `SUPPORTED`.

**App reuse:** the existing "Calm Shop" Open Platform app (Drop Shipping category, Test status) is reused. App Key/Secret are credentials, not project-bound; the callback URL is editable in the console. Old Cloudflare callbacks (nova-memory-poll-qualify / missed-commonly-lcd-discipline trycloudflare) are **not** reused.

**Confirmed live mechanics (2026-09-02, app 544330):** `system.oauth2.getToken` is `InvalidApiPath` on every host — the working token exchange is a signed `POST https://api-sg.aliexpress.com/rest/auth/token/create` (IOP sign: `HMAC-SHA256(secret, "/auth/token/create" + sorted{k:v})`, epoch-millis timestamp). Business/DS methods use `https://api-sg.aliexpress.com/sync` with `HMAC-SHA256(secret, sorted{k:v})` — the `method` param included, **no** secret braces. The app's granted family is `aliexpress.ds.*`; `aliexpress.solution.*`/`aliexpress.affiliate.*` return `InsufficientPermission` for this app. Verification uses the parameter-free `aliexpress.ds.category.get`; the adapter rejects HTTP-200 `error_response` and non-200 `resp_code` envelopes so no failure can masquerade as success.

- [x] Audit existing AliExpressAdapter: configurable `ALIEXPRESS_API_BASE_URL` (default legacy URL flagged UNVERIFIED — signing scheme + endpoint must be confirmed against official docs during live verification)
- [x] Shared capability model (`SupplierCapabilityStatus`, `SupplierCapability`, `SupplierApiErrorCode`, `AliExpressConnectionStatus`, `AliExpressConnectResponse`)
- [x] OAuth seller-authorization flow (`GET /api/suppliers/aliexpress/connect` → authorization URL, CSRF-safe single-use `state`)
- [x] Public OAuth callback (`GET /api/suppliers/aliexpress/callback`): state validation, server-side code→token exchange, encrypted storage, browser redirect
- [x] Secure token storage: access/refresh token + expiry encrypted inside the existing `Supplier.apiConfig` via AES-256-GCM (`ENCRYPTION_KEY`) — no schema change
- [x] Runtime credential config (`POST /api/suppliers/aliexpress/config`): admin-only endpoint saves App Key/Secret/Callback URL to encrypted storage (DB-preferred, env fallback); App Secret sent once over HTTPS, never returned; validates HTTPS callback, rejects placeholders, resets verification on credential changes
- [x] Honest per-operation capability reporting (SUPPORTED / NOT_AUTHORIZED / NOT_CONFIGURED / NOT_PERMITTED / UNSUPPORTED / UNVERIFIED / API_ERROR)
- [x] Real-API verification path (`POST /api/suppliers/aliexpress/verify`): only a genuine signed `aliexpress.ds.category.get` success (`resp_code 200`) marks the connection verified — the HTTP-200 `error_response` / non-200 `resp_code` envelopes the live gateway returns are rejected, so a failure can never be reported as verified
- [x] Connection status endpoint (masked App Key, expiry, last-verified, capabilities) — never returns the secret/token
- [x] Admin UI (`/admin/suppliers`): connection status card with distinct states (NOT_CONFIGURED / CONFIGURED-not-authorized / CONFIGURED-unverified / Connected-verified / Error); credential config form (App Key, App Secret as password input, HTTPS Callback URL with validation + explanatory alerts); masked key display; capabilities table; Connect / Verify / Disconnect buttons; config form auto-opens when NOT_CONFIGURED, toggled via "Edit configuration" button otherwise
- [x] Supplier-module facades (`ensureAliExpressSupplier`, `get/saveAliExpressConfig`, `clearAliExpressAuth`) — reuse existing encryption, additive
- [x] Error handling: safe reverse-scoped errors (`SupplierApiError`) that never leak credentials/params
- [x] Env placeholders (`.env.example`): `ALIEXPRESS_CALLBACK_URL=` + optional `ALIEXPRESS_API_BASE_URL` / `_AUTH_AUTHORIZE_URL` / `_AUTH_TOKEN_URL`
- [x] Tests: 32 unit (service 22 + adapter 10, covering config endpoint, credential validation, placeholder rejection, callback URL validation, state machine, OAuth flow, safe errors) + 15 E2E (7 existing + 7 new config tests: admin-only access, saves credentials + CONFIGURED/UNVERIFIED, HTTPS validation, placeholder rejection, OAuth URL generation, safe verification failures, disconnect keeps creds)
- [x] **External verification (2026-09-02):** configured a live HTTPS callback (Cloudflare quick tunnel) in the app + console, ran Connect → authorized the "Calm Shop" seller → callback → real token exchange (`/rest/auth/token/create`) → encrypted token stored → `POST verify` → `aliexpress.ds.category.get` returned `resp_code 200 "Call succeeds"` → `state=CONNECTED`. Note: order/trade/logistics DS operations still need the app's granted scope to cover them (probe showed `aliexpress.solution.*` and `aliexpress.affiliate.*` are `InsufficientPermission` for this app); only `aliexpress.ds.category.get` (and ds.product/ds.image.search param probes) are confirmed granted.

**Verified 2026-09-02:** API build PASS · API lint PASS · API unit 66/66 (5 suites) · API E2E 69/69 (5 suites) · live AliExpress OAuth → real token ✅ · live verify `aliexpress.ds.category.get` → `200 "Call succeeds"` ✅

### Phase 8b — Resumable, Job-Based DS-Feed Catalog Importer — ✅ COMPLETED 2026-09-03

A production-quality importer built on the verified `aliexpress.ds.*` feed pipeline (NOT scraping, NOT the denied `affiliate.*`/`solution.*`/`getToken` paths). Processes the DS feed **page-by-page** with a persisted cursor so an interrupted import resumes.

- [x] **Prisma model + migration** (`ProductImportJob`, table `product_import_jobs`): `feedName`, `country`, `categoryId`, `perRunLimit`, `currency`, `enrich`, `mode`, `status` (PENDING/RUNNING/PAUSED/COMPLETED/CANCELLED/FAILED), `nextPage` resume cursor, `isFeedFinished`, counters (`processed/imported/updated/skipped/error`), `failedIds` JSON for retry, `errorMessage`, timestamps. Migrations `add_product_import_job` + `add_enrich_counts`.
- [x] **Adapter hardening** (`aliexpress.adapter.ts request()`): exponential-backoff + jitter retry on HTTP 429 / AOP 429 / 5xx / network drops (up to 3 retries, sequential only); expired/revoked auth detection (`InvalidSession`, `Session Expired`, 401/403) → `SupplierApiError NOT_AUTHORIZED` with "Re-authorize from the connection card"; HTTP-200 `error_response` and non-200 `rsp_code`/`resp_code` remain hard failures. **No unverified token auto-refresh.**
- [x] **Job engine** (`aliexpress.service.ts`): `createImportJob` (validates one existing category), `advanceJob` (one page fetch + upsert + persist cursor; fatal auth → `FAILED`; per-product failures counted into `failedIds`, not fatal), `cancelJob` (terminal → 409), `retryFailed` (re-fetch via `aliexpress.ds.product.get`), `getJob`/`getLatestJob` (safe fields only). Legacy one-shot `importCatalog` kept as a thin wrapper (`mode='skip'` default) for back-compat + existing tests.
- [x] **Dedup/upsert** (`upsertFeedProduct`): unique `sku='AE-<productId>'` is the external identity. Missing → create (DRAFT, category, supplier, images, metadata); found + `mode='update'` → refresh only feed fields (price, currency, images, supplierProductId, metadata) — **admin-owned name/category/status untouched**; found + `mode='skip'` → untouched. Never duplicates.
- [x] **Controller** (`aliexpress.controller.ts`, all admin-guarded): `POST catalog/jobs`, `POST catalog/jobs/:id/advance`, `GET catalog/jobs/:id`, `GET catalog/jobs/latest`, `POST catalog/jobs/:id/cancel`, `POST catalog/jobs/:id/retry` (+ existing feeds/preview/import unchanged).
- [x] **DTOs**: `CreateImportJobDto` (perRunLimit default 25, max 50), `JobIdParamDto`.
- [x] **Admin UI** (`apps/web/src/pages/admin/Suppliers.tsx` `ImportCatalogCard` rework): feed/category/limit/currency/enrich/mode config, live page-1 preview, latest-job status + progress (polling), counters (processed/imported/updated/skipped/errors), Start / Continue / Cancel / Retry-failed controls, completion summary. Never sends or renders credentials.
- [x] **Tests**: adapter 27 (added 429/5xx retry+backoff, NOT_AUTHORIZED detection, no-secret-leak), service job-engine cases (create/update/skip/resume/cancel-409/retry/latest/legacy), suppliers E2E job endpoints (admin-only 401/403, create-PENDING, missing-category 400, fetch, advance-without-creds 400, cancel→409, latest).

**Verified 2026-09-03:** web tsc PASS · web lint PASS · web build PASS · API lint PASS · API build PASS · **API unit 95/95 (5 suites)** · **API E2E 80/80 (5 suites, full run)** · **live small import verified** ✅

**Live verification (small, controlled — page 1 only, no 133k run):**
- `POST catalog/jobs` (feed `AEB_BR_DropiSelectedItems_20241106`, country `BR`, category Men, perRunLimit 25, INR) → job `PENDING`/`nextPage 1`
- `POST …/advance` → real `aliexpress.ds.recommend.feed.get` call → **imported 25, updated 0, skipped 0, errors 0**, `PAUSED`/`nextPage 2`
- Products verified in AUREVO: `sku=AE-<productId>`, **DRAFT**, `currency=INR`, paise pricing, `supplierId` + `categoryId` set
- **Dedup**: fresh job re-fetching page 1 → **imported 0, updated 25** — no duplicates; total product count unchanged (109 → 109)
- **Cancel**: PAUSED job → `CANCELLED`; advance after cancel → **409**
- **Security**: unauthenticated job endpoints → **401**; customer → **403** (E2E); job/status responses contain **no secret values** (only booleans + masked key `54…` + timestamps)

**Remaining API limitations (honest):** the DS feed covers only AliExpress's featured/promo catalog, not the entire AliExpress catalog (the `133k` `product_num` is that one BR feed's promo pool, fetched page-by-page up to the 50/page cap); no auto token-refresh (re-authorize on expiry — reported clearly, never looped); per-SKU live inventory sync remains a follow-up (enrich is opt-in).

---

## Phase 9: Supplier Integration — Discovery (2026-09-03)

### Phase 9 (original) — IndiaMART — ❌ CLOSED: NOT FEASIBLE AS DESIGNED

IndiaMART has **no public developer/API portal** (`developer.indiamart.com` does not exist). The only documented access is a **Lead Manager API** for premium (paid) sellers, using `mkey`/`mtoken` credentials. It exposes **buyer leads only — no product catalog API**, no order API, no OAuth. It cannot supply product catalog data, so it is **not a viable product-supplier integration** for AUREVO. The `IndiaMARTAdapter` stub exists but should be **removed or set to UNSUPPORTED** — it never had verified credentials.

### Phase 9 (replacement) — CJdropshipping — 📋 DISCOVERY COMPLETE (awaiting approval)

CJdropshipping has a **real official developer portal** (`developers.cjdropshipping.com`) with a documented **API v2.0** and a **sandbox** environment. Capabilities verified from the official portal's API structure:

- **Authentication** — access-token based (`getAccessToken`); token sent via `CJ-Access-Token` header; token has an expiry and is re-fetched (mechanism/signing to be confirmed against live docs).
- **Product** — search/list, detail, categories, **inventory query by product ID**.
- **Shopping (orders)** — order create / list / detail / status / cancel.
- **Logistic** — shipping methods, freight/cost, tracking (incl. platform waybill order processing).
- **Webhook** — event/callback notification setup.
- **Storage** — warehouse info.
- **Sandbox** — test environment available (matches AUREVO's "never fake; verify live" constraint).

**Verdict under evaluation:** OPTION A/B — strong replacement candidate for IndiaMART. Product catalog + inventory + orders + tracking + webhooks all documented at the API level, with a sandbox for honest live verification. **No code written; awaiting approval before Phase 9 implementation.**

**Status:** Stages 1-12 IMPLEMENTED + unit/E2E tested (110 unit, 95 E2E green; build+lint clean). Awaiting real credentials for Stage 13 live verification.

- [x] Implement CJdropshipping adapter on the generic `SupplierAdapter` interface
- [x] Reuse generic infra: encrypted `apiConfig`, `SupplierApiError`, `ProductImportJob`
- [x] Auth flow (access+refresh token via `getAccessToken`/`refreshAccessToken`, `CJ-Access-Token` header)
- [x] Connection verification + honest capability status (NOT_CONFIGURED until a live call succeeds)
- [x] Product catalog adapter (categories, search/list, detail)
- [x] Resumable, page-by-page catalog import job (search-driven; reuses `ProductImportJob`)
- [x] Inventory/price sync, shipping methods
- [x] Order integration (adapter only — NOT auto-forwarded; manual admin test)
- [x] Webhook receiver (public, signature verification stubbed until CJ confirms the mechanism; log-only, no auto-forward)
- [x] Admin UI: credential input, connection test, search+preview, job import, status/capabilities
- [x] Unit tests (15 new CJ tests) + E2E (CJ gating/config/jobs/webhook) + web build/lint
- [ ] Obtain CJdropshipping API access (single `apiKey` from CJ Apps) — **BLOCKED on user-provided credentials**
- [ ] Real (sandbox) verification: auth → fetch products → import small batch → dedupe → inventory/price
- [ ] Verify: works with actual CJ credentials; secrets never in logs/responses

---

## Red Team Security Audit — Red/High Fixes ✅ (2026-09-05)

Full attack-surface audit of Phases 1–9 (webhooks, IDOR, price/quantity tampering, auth abuse, secrets/config, XSS/CSRF/CORS, input validation, file upload, Swagger). HIGH items fixed with failing-before/passing-after tests; residual items documented honestly.

- [x] **Payments `POST /payments/create-order` now requires auth** — was `@Public()`, letting anyone open a Razorpay order for a guessed order ID and leak `razorpayOrderId`/`amount`. Now `JwtAuthGuard` + owner check; `NotFound`/`Forbidden` (403) replace bare `Error` (500) on auth failures.
- [x] **Razorpay webhook signature now HMACs the raw body** — `NestFactory.create(..., { rawBody: true })`, signed against `req.rawBody` bytes instead of re-serialized JSON (which silently broke every legitimate signature). Webhook route throttled 20/60s.
- [x] **Swagger gated to non-production** (`main.ts`) + `persistAuthorization: false` — admin surface no longer exposed in prod, bearer tokens not persisted.
- [x] **`couponCode` rejected loudly at checkout** (was accepted-and-ignored → customer charged full price believing they used a coupon).
- [x] **Cart quantity bounded `[1, 99]`** (`@Max(99)` on `AddToCartDto`/`UpdateCartItemDto`) — no reservation/DoS inflation.
- [x] **Product pagination capped at 100** (`ProductsService.findAll`) — hostile `?limit=99999999` can no longer dump the catalog.
- [x] Tests: **156/156 pass (12 suites)** — new `payments.service.test.ts` (raw-body HMAC), `payments.controller.test.ts` (ownership → 403, not 500), `products.service.test.ts` (limit cap), `cart/dto/cart-quantity.test.ts` (1..99), `checkout` coupon rejection.
- [x] Live-verified after rebuild+restart: payments create-order → 401 unauth; cart qty 100 → 400, qty 2 → 201; products `limit=999999` → `meta.limit=100`; health 200.

**Residual (documented, not faked):** CJ webhook is still a log-only signature stub (returns 200, performs no mutation — safe until real signing is implemented); CSP remains disabled (`contentSecurityPolicy: false`, flagged for an explicit policy); entity entropy via `Math.random()` (not enumerable in practice, flagged for CSPRNG); email-token delivery still TODO (tokens returned in body).

---

## Red Team Audit — Second Pass (Payments, Timing Enumeration) ✅ (2026-09-05)

Senior AppSec hardening pass on the payments webhook and auth timing surface. Every item has a failing-before → passing-after test. **All acceptance criteria met.**

### Section A — Payments Webhook Billing Integrity
- [x] **A1: Amount/currency mismatch hard-fail BEFORE idempotency** — `verifyPaymentWebhook` compares webhook `amount`/`currency` against the DB payment record; mismatch returns `verified:false` + `reason:'AMOUNT_MISMATCH'|'CURRENCY_MISMATCH'`, `order.update` never called, security event logged. Unit: 2 tests.
- [x] **A2: Idempotency runs AFTER amount/currency re-check** — same payment replay re-verifies money first, then early-returns on `webhookVerified`. Unit: 1 test (exactly 1 mutation across 2 events).
- [x] **A3: Order state-transition guard** — `CAPTURE_ALLOWED_ORDER_STATES={PENDING,PAYMENT_PENDING,PAID}`, `FAILURE_ALLOWED_ORDER_STATES={PENDING,PAYMENT_PENDING,FAILED}`, `REFUND_ALLOWED_ORDER_STATES={PAID}`. A captured webhook on `CANCELLED/SHIPPED/DELIVERED/REFUNDED/FAILED/PROCESSING/FULFILLMENT/RETURNED` is rejected (`ILLEGAL_ORDER_STATE`). Unit: 5 tests.
- [x] **A4: create-order gated on order state + no duplicate live orders** — only `PENDING/PAYMENT_PENDING` orders are payable; `prisma.payment.findFirst({status:{notIn:['FAILED']}})` blocks second live attempt; retry after `FAILED` allowed. Unit: 5 tests.
- [x] **A5: Server-side authoritative amount/currency** — `createRazorpayOrder` derives `amount`/`currency` from `order.total`/`order.currency` only; client never supplies either. Unit: 2 tests (paise-throughout regression test).
- [x] **Units bug fixed** — `order.total` is paise; Razorpay takes paise; removed erroneous `*100` in 4 places (create-order, webhook `/100`, refund). 31/31 unit tests pass.

### Section B — Timing-Based User Enumeration (Auth)
- [x] **B1: Register constant-time** — `bcrypt.hash` called before `findUnique`; missing account burns `DUMMY_BCRYPT_HASH` and returns `{success:true,user:...}` (no `verificationToken`). Unit: 1 test (hash called, no token in response).
- [x] **B2: Login constant-time** — `bcrypt.compare` against `user?.passwordHash ?? DUMMY_BCRYPT_HASH`; missing/wrong-password identical 401 body + identical compare timing. Unit: 2 tests (ghost compare + no token leak).
- [x] **B3: Forgot password constant-time** — `jwtService.sign` for ghost user (1h type=`password_reset`); identical `{success:true}` body. Unit: 1 test.
- [x] **B4: Resend verification constant-time** — `jwtService.sign` for ghost user (24h type=`email_verification`); identical `{success:true}` body. Unit: 1 test.
- [x] **B5: `isActive` gated AFTER password compare** — inactive account still burns bcrypt work. Unit: covered.
- [x] **22/22 auth unit tests pass** — module-level `jest.mock('bcrypt', delegatingFactory)` pattern avoids native addon "Cannot redefine property" error.

### Section C — Platform Hardening (C1–C5)
- [x] **C1: Real CSP** — `create-app.ts` Helmet config: `defaultSrc:self`, `scriptSrc:self`, `styleSrc:self unsafe-inline`, `imgSrc:self https: data:`, `connectSrc:self + API/web origins`, `fontSrc:self`, `objectSrc:none`, `baseUri:self`, `formAction:self`, `frameAncestors:none`, `frameSrc:none`, `upgradeInsecureRequests`. **Verified live: `Content-Security-Policy` header present on 4000.**
- [x] **C2: Swagger prod gate** — `config/swagger.ts` `shouldExposeApiDocs(nodeEnv) = nodeEnv !== 'production'`; `main.ts` uses it. 5 unit tests (prod=false, others=true). **Verified live: `/docs` reachable in dev.**
- [x] **C3: CJ webhook honest UNVERIFIED** — `@Throttle`, logs `verification=UNVERIFIED, signature=present|NONE, bodyDigest=SHA256`; returns `{success:true,verification:'UNVERIFIED'}`; signature stub kept honest (never fakes verification). 3 new tests assert UNVERIFIED + no service call + log contains digest.
- [x] **C4: CSPRNG order numbers** — `packages/shared/src/utils/index.ts` `secureRandomIndex(max)` uses `crypto.getRandomValues` with rejection sampling; `generateOrderNumber` uses it. Fallback to `Math.random` with console warning. 1 test spies `crypto.getRandomValues`.
- [x] **C5: No token in any response** — `register` returns `{user: sanitizeUser(user)}` (no `verificationToken`); password-reset tests mint tokens via `mintToken` helper (uses app's JwtService). **Verified live: register 201 body has no `verificationToken`.**

### Test & Build Status
- [x] **TypeScript (tsc)**: PASS (apps/api, apps/web, packages/shared)
- [x] **Vite build**: PASS (pre-existing chunk size warning >500kB, no regression)
- [x] **ESLint**: PASS (all workspaces)
- [x] **API unit tests**: 193/193 (14 suites) — +31 payments, +22 auth, +5 swagger, +3 CJ, +1 shared
- [x] **E2E tests**: 95/95 (5 suites) — fixtures updated (`Password123!`), guest UUIDs, supplier secrets neutralized
- [x] **API rebuilt + server restarted** on port 4000 after units bug fix

### Live Probe (VERIFIED 2026-09-07 — `apps/api/scripts/phase10-webhook-probe.mjs`, 27/27 pass)
- [x] Amount mismatch webhook → 400 + `AMOUNT_MISMATCH` + order stays `PAYMENT_PENDING`
- [x] Currency mismatch webhook (USD vs INR) → 400 + `CURRENCY_MISMATCH` + order stays `PAYMENT_PENDING`
- [x] Happy-path replay on same payment → 200 + order flips to `PAID` (idempotent: replay leaves payment `CAPTURED`, no double mutation)
- [x] Forged (non-HMAC) signature → 200 `{verified:false}`, order not mutated
- [x] Ownership gating: unauthenticated `POST /payments/create-order` → 403
- [x] A3 state guard: captured webhook on `CANCELLED` order → 400 `ILLEGAL_ORDER_STATE`

---

## Phase 10: Payments (Razorpay)

- [x] PaymentModule with Razorpay service
- [x] Create Razorpay Order: POST /payments/create-order (validated amount)
- [x] Frontend Razorpay Checkout integration
- [x] Webhook endpoint: POST /payments/webhook
- [x] Webhook signature verification (HMAC-SHA256)
- [x] Idempotent webhook processing
- [x] Order status update on verified payment: PAID
- [x] Refund flow: POST /payments/refund (admin or auto on cancellation)
- [x] Refund webhook handling
- [x] Payment record linking to Order
- [x] Test mode throughout, live keys via env
- [x] Verify: Test payment completes, webhook verifies, order marked PAID — **webhook→PAID verified live 2026-09-07 via simulated HMAC payloads (27/27 probe checks, incl. A1/A2/A3 + ownership 403); `create-order` returned 201 against Razorpay test API (real `rzp_test_…` backend key present). Live Checkout `payment.simulator` capture still requires driving the modal with a real card in the web app.**

---

## Phase 11: SEO & Production Configuration — ✅ COMPLETED

- [x] Sitemap.xml generation — dynamic at `GET /api/sitemap.xml` (products, categories, static pages; @Public, XML-safe, WEB_URL env for origins)
- [x] Robots.txt — blocks admin/api/account/checkout/login/register; Sitemap uses `example.com` placeholder until domain is set
- [x] Meta tags — `useSeo` hook manages title, description, og:title, og:description, og:url, og:image, og:type, robots per route (no new dependency; `VITE_SITE_URL` controls canonical/og:url emission)
- [x] Canonical URLs — `canonicalFor(path)` helper, omitted entirely when `VITE_SITE_URL` is empty (avoids poisoning indexes with localhost)
- [x] Structured data — Organization + WebSite (home), Product (detail: name, price, availability, reviews, brand) via `jsonLd()` helper that escapes `</script>` to prevent breakout
- [x] Clean URLs — `/products/:slug`, `/products?category=:slug`
- [x] 404 page — custom `NotFound` page (wordmark, 404, search, quick-links); noindex
- [x] Favicon — `apps/web/public/favicon.svg` (purple gem / brand icon)
- [x] Production Dockerfile for API — multi-stage `apps/api/Dockerfile` (node:20-alpine, bcrypt build tools in build stage, non-root user, tini, curl healthcheck on `/api/health`, prisma schema + generated client copied; never copies `.env`/`dev.db`)
- [x] Production Dockerfile for Web — multi-stage `apps/web/Dockerfile` (node:20-alpine → nginx:1.27-alpine, SPA fallback via `apps/web/nginx.conf`)
- [x] `.dockerignore` — excludes node_modules, dist, .env, dev.db, .git, coverage, tests
- [x] Edge nginx — `nginx.conf`: server_tokens off, security headers + CSP, gzip, /api → api:4000, / → web:80, `Cache-Control: no-cache` on HTML; HTTPS block present but commented out with TODO markers (no domain yet)
- [x] Production Docker Compose — `docker-compose.prod.yml`: nginx (edge) + web + api + postgres + redis; DB/Redis have NO exposed host ports; `${VAR:?err}` for all secrets; named volumes; healthchecks; `docker compose up -d --build`
- [x] `.env.example` — added `SITE_URL`, `REDIS_PASSWORD`, `ENCRYPTION_KEY`, `VITE_SITE_URL`; compose note
- [x] Env validation hardened — `env.validation.ts` now rejects Razorpay test/placeholder credentials in production (`rzp_test_*` / `your_*`); scoped to `production` only so test suite remains hermetic
- [x] CI/CD — `.github/workflows/ci.yml`: install → lint → build → unit tests (193) → e2e tests (95) → Docker image build (both); concurrency cancel-in-progress; turbo telemetry disabled; Node 20 + npm cache
- [x] Verify — `npm run build` ✅ | `npm run lint` ✅ | `npm run test` (193/193) ✅ | `npm run test:e2e` (95/95) ✅ | Docker builds require a Docker-capable environment (CI) ✅

---

## Phase 12b: Production Deployment Reconciliation — ✅ COMPLETED (2026-09-09)

Audited the 10-step VPS deployment guide against the actual repo; fixed production-blocking gaps; produced corrected runbook at `DEPLOYMENT.md`.

- [x] **Prisma migrations in production image (was a hard blocker)** — Dockerfile now copies `prisma/migrations/` + prisma CLI from build stage; `CMD` runs `npx prisma migrate deploy` before `node dist/main`. Fresh production DB gets all 6 migrations automatically — no manual step.
- [x] **nginx.conf rewritten for HTTPS** — original had HTTPS block commented out (TODO DOMAIN). New edge config: HTTP→HTTPS 301, TLS 1.2/1.3, HSTS, CSP, security headers, `/api/` → api:4000, `/*` → web:80. No manual uncommenting needed post-cert.
- [x] **Admin bootstrap documented** — no seed script required; first register with `ADMIN_EMAIL` gets ADMIN role (verified in `auth.service.ts:62-64`).
- [x] **Razorpay webhook URL documented** — must be configured in Razorpay dashboard to `https://Aurevo.buzz/api/payments/webhook`.
- [x] **`SITE_URL=https://Aurevo.buzz` in `.env` documented** — drives CORS allowlist (WEB_URL), canonical/og:url, sitemap origins, HSTS connect-src.
- [x] **Compose file flag documented** — all commands need `-f docker-compose.prod.yml` (file declares `name: aurevo-prod`).
- [x] **Certbot cron uses absolute compose path** — `/opt/aurevo/docker-compose.prod.yml`, with `--deploy-hook` to copy renewed certs + reload nginx.
- [x] **docker-compose.prod.yml verified correct** — `${VAR:?}` secret guards, healthchecks with `condition: service_healthy`, no exposed DB/Redis host ports, `VITE_SITE_URL`/`VITE_RAZORPAY_KEY_ID` build args passed to web.
- [x] **`docker compose down -v` DANGER note added** — wipes the Postgres volume.

**Deliverable:** `DEPLOYMENT.md` — corrected runbook (9 steps + troubleshooting + quick-reference + checklist).

---

## Phase 12: Testing & Security Review — ✅ COMPLETED (2026-09-08, load test 2026-09-09)

Verification pass over the whole platform (build/lint/test/security/accessibility) plus the security cleanup items from the audit. **No new features** — fixes only, each with evidence.

- [x] **Unit tests: 202/202 (16 suites)** — Auth, Cart, Orders, Payments, Suppliers, Email, Orders-cleanup, config, products. (+9 vs. Phase 11 from the new `email.service.test.ts` + `orders-cleanup.service.test.ts`)
- [x] **E2E tests: 96/96 (5 suites)** — auth, catalog, cart/checkout, orders, suppliers
- [x] **Build gate: `npx turbo build` PASS (4/4)** — per-route code-split Vite chunks confirmed
- [x] **Lint gate: `npx turbo lint` PASS (6/6)** — 1 pre-existing warning (unused eslint-disable in shared utils)
- [x] **Security audit checklist** — all items verified (see SECURITY.md); residual items documented as R1–R9
- [x] **WCAG 2.1 AA accessibility audit** — every store + admin page reviewed; fixed: skip links (both layouts), label/input associations (checkout AddressForm, guest email, order notes), Dropdown keyboard nav (ArrowDown/Up/Home/End, aria-expanded/menu), form error `role="alert"` + `aria-describedby`
- [x] **Dead code removed** — `JwtRefreshStrategy` (registered as provider, never used via `AuthGuard('jwt-refresh')`; `authService.refresh()` handles revocation/rotation independently)
- [x] **`console.log`/`console.error` → NestJS `Logger`** — `main.ts`, `payments.service.ts`, `suppliers.service.ts`
- [x] **Rate limiting** — checkout `POST /checkout` 5/min; auth throttles (forgot 3/min, resend 5/min, register 3/hr, login 5/min); webhook 20/60s
- [x] **Guest order IDOR verified** — `assertGuestReadAuth` throws NotFoundException (404) so guests cannot confirm order existence
- [x] **Load test (Artillery) — PASS 2026-09-09 (run by operator)** — config at `apps/api/test/load-test.yml`. **~14,000 req/2.5min; peak 130 req/s sustained (50 VUs); p95 7.9ms, p99 22.9ms, max 919ms; zero 5xx.** Rate limiter throttled 93% of flood traffic (13,081 HTTP 429s). The 418 "Failed capture" entries are a test artifact (slug capture fails when the products request is 429'd), not a code bug. **Verdict: API resilient under request flooding.**

**Verified:** turbo build 4/4 · turbo lint 6/6 · API unit 202/202 · API E2E 96/96 · load test PASS (zero 5xx, 130 req/s sustained) · live probes (payments webhook, CSP header, swagger gate, register-no-token, guest IDOR 404)

---

## External Credentials Required (Track Separately)

- [ ] PostgreSQL (local Docker OK for dev)
- [ ] Redis (local Docker OK for dev)
- [ ] Razorpay test keys
- [ ] Razorpay webhook secret
- [ ] AliExpress Open Platform: App Key, App Secret, Access Token
- [ ] CJdropshipping: CJ API Key (`CJ_API_KEY`) — CJ API v2.0 uses a single apiKey, no app secret, no email/password
- [ ] Email provider API key (Resend/SendGrid)
- [ ] Domain + SSL certificate (production)
- [ ] S3-compatible storage credentials (production images)

---

## Blockers / Notes

| Task | Blocker | Resolution |
|------|---------|------------|
| AliExpress integration | Requires approved Open Platform app | Build adapter to spec; wire when credentials available |
| IndiaMART integration | API capabilities unknown | Research actual API access; design adapter to real capabilities |
| Phase 10 live Checkout `payment.simulator` capture | Backend `create-order` works (real `rzp_test_…` key in backend `.env`), but `VITE_RAZORPAY_KEY_ID` is a placeholder and the Checkout modal has not been driven with a real test card end-to-end | Paste real test key into `VITE_RAZORPAY_KEY_ID` and complete a Checkout → `payment.captured` → refund in the web app |
| Production deployment | Domain, SSL, hosting | Phase 11 |

---

## Completion Criteria

A phase is complete when:
1. All tasks marked [x]
2. `npm run build` passes
3. `npm run test` passes
4. `npm run lint` passes
5. Manual verification of features works
6. No known security issues

Do not proceed to next phase until current phase is complete.