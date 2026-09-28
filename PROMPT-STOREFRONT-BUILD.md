# AUREVO Storefront Enhancement — Designer/Developer Build Prompt

**Security-first. Ship-blocking defects fixed before features.**

---

## Project context

- **Store**: aurevo.buzz — live production, real customers can visit.
- **Stack**: NestJS API (apps/api), React 18 + Vite (apps/web), Prisma ORM, PostgreSQL, Redis, Docker Comprod production images, Cloudflare Tunnel (Flexible SSL), Turborepo/npm workspaces (@aurevo/api, @aurevo/web, @aurevo/design-system, @aurevo/shared).
- **Auth**: JWT access tokens (15 min) + HttpOnly refresh cookie (30 days), bcrypt cost 12, OptionalJwtAuthGuard for guest routes, JwtAuthGuard + RolesGuard + @Roles(UserRole.ADMIN) on every admin mutation.
- **Payments**: Razorpay LIVE keys active. Server-side amount derivation (client never sets price). HMAC-SHA256 signature verification in constant time on both webhook and client-verify paths. Idempotent order capture. Full + partial refund support.
- **Known production state** (verified 2026-09-14): cart works (atomic upsert, P2002 eliminated), Razorpay live checkout works, all 10 admin pages real, 6 analytics endpoints real, security guards sound on all 21 controllers.

---

## Existing ship-blocking gaps (fix these FIRST, before new features)

### G0 — Shipping methods: empty in production database

The prod `shipping_methods` table has zero rows. Seed data never runs (API container uses `prisma db push`, not `prisma db seed`). Checkout cannot complete because there is nothing for the customer to select.

**Fix before any new feature work:**
```sql
INSERT INTO shipping_methods
  (id, name, code, baseCost, perItemCost, perKgCost,
   freeShippingThreshold, minOrderAmount, maxOrderAmount,
   estimatedDays, currency, isActive, sortOrder, createdAt, updatedAt)
VALUES
  ('seed_shipping_0000000001', 'Standard Shipping', 'standard',
   0, NULL, NULL, NULL, NULL, NULL, 5, 'INR', true, 0, now(), now())
ON CONFLICT (code) DO NOTHING;
```
Verify: `SELECT count(*) FROM shipping_methods;` returns ≥ 1.

### G1 — Transactional email is disabled

`EMAIL_API_KEY` is empty. Resend-backed email service logs `[EMAIL-NOOP]` for every send. This means:
- Email verification links are never delivered.
- Password reset links are never delivered.
- Order confirmation emails are never sent.

**Fix**: Set a live Resend API key (`EMAIL_API_KEY`) plus verify a sender domain. Then place one test order and confirm the confirmation email lands.

### G2 — Email-change re-verification not implemented

The Account page (apps/web/src/pages/store/Account.tsx) states: "Email is display-only — changing it requires re-verification, which is not implemented yet." Until this is built, customers cannot update their email address.

---

## Security posture requirements (non-negotiable)

These are not suggestions. Every item must be explicitly addressed in your implementation and verified in your security review.

### S1 — Secrets and credentials

- Never commit `.env` values to git. Never log them.
- All Razorpay keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) are live keys. Treat them as production secrets. Never display, log, or expose them in client-side code or API responses.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` must be ≥ 32 characters and not start with `change-me`.
- The existing `apps/api/src/config/env.validation.ts` rejects weak secrets and non-live Razorpay keys in production. Do not bypass it.

### S2 — Authentication and authorization

- Every admin page and mutation must be behind `JwtAuthGuard + RolesGuard + @Roles(UserRole.ADMIN)`.
- Guest cart operations use `OptionalJwtAuthGuard` — the caller may be anonymous or authenticated.
- Wishlist operations require `JwtAuthGuard` — only authenticated users; scope to their own data only.
- Public reads (products, categories, reviews) remain public; mutations on those resources require admin.
- Webhook endpoints (Razorpay, CJ) are intentionally public but verify signatures before processing.

### S3 — Cart and session security

- Guest session IDs must be validated UUIDs (`/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`).
- An authenticated user's cart is keyed by `userId` from the JWT, never by `sessionId`. A `sessionId` supplied alongside an authenticated request is ignored.
- Guest→user cart merge on login: await the merge, only clear `localStorage['aurevo_session_id']` after successful merge, then refresh.

### S4 — Payment security

- Amount is derived server-side from the database. The client never supplies or can influence the order amount.
- Razorpay webhook signature: HMAC-SHA256, constant-time comparison (`crypto.timingSafeEqual`).
- Razorpay client-verify: same HMAC-SHA256 + constant-time compare + amount re-verification from the Razorpay API.
- Order state transitions are guarded: capture only allowed in PENDING, PAYMENT_PENDING, or PAID states. No double-capture (idempotency check).
- On payment failure: release any reserved inventory.

### S5 — Content Security Policy (nginx)

`apps/api/nginx.tunnel.conf` must keep these CSP directives correct for Razorpay:
```
script-src 'self' https://checkout.razorpay.com;
connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com;
frame-src https://checkout.razorpay.com;
```
Do not weaken this. Do not add wildcard hosts. Do not remove `server_tokens off`.

### S6 — Input validation and error handling

- All API inputs validated via `class-validator` DTOs (existing pattern in apps/api/src/modules/*/dto/).
- Error responses never leak stack traces, Prisma internals, or internal file paths.
- Rate limiting on auth endpoints (login, register, forgot-password).

---

## Design requirements

### Aesthetic

- **Typography**: Use the IBM Plex family (Sans for body/headings, Mono for data labels and technical units) loaded via Google Fonts. Pair with a characterful display face for hero headings — e.g., Instrument Serif or Fraunces — used sparingly.
- **Color palette**: A deep teal/petrol accent (`#0e6b63` in light, `#2fb3a4` in dark) for the storefront brand. Semantic colors for status: emerald (`#1d7a44`) for success, amber (`#a75e0a`) for warnings, vermilion (`#b42318`) for errors. Neutral grounds: warm off-white (`#f6f5f1`) in light, near-black blue (`#101316`) in dark.
- **Font sizes**: 11px–15px range as requested. Body text: 15px/1.55. Headings: 20px–40px scale. Captions/data: 11–12px IBM Plex Mono.
- **Layout**: Max-width 880px for readable content. Side gutter ≥ 16px at all widths. Flexbox/grid with `gap` for spacing (no collapsing margins).
- **Theme**: Full light + dark mode. Design both. `body` must set explicit `background` from a token (never transparent — the viewer paints its own ground). Every color must resolve in both themes.

### Responsive

- Mobile-first. Stack to one column at ~400px. No horizontal overflow on body. Tables/code blocks get `overflow-x: auto` on their own containers.
- Sticky header on mobile. Search bar collapses to mobile drawer.

### Accessibility

- Skip-to-content link on every page (visible on keyboard focus).
- All interactive elements must have visible focus states.
- Cart badge uses `aria-label` with item count.
- Product images require `alt` text.
- Respect `prefers-reduced-motion` — disable or reduce animations.
- Form controls must have stable `id` attributes.

---

## Build phases (in strict order)

### Phase 1 — Audit

**Goal**: Confirm the running production system matches the expected state before touching anything.

1. Verify the live API image contains the upsert cart fix: `docker logs aurevo-api --tail 50 | grep -i "Started"` — confirm fresh startup timestamp.
2. Verify no P2002 errors in recent logs: `docker logs aurevo-api --tail 200 | grep "P2002"` — must return nothing.
3. Verify shipping methods exist: `docker compose exec -T postgres psql -U postgres -d <dbname> -c "SELECT count(*) FROM shipping_methods;"` — must return ≥ 1. If 0, run the G0 fix.
4. Verify Razorpay is live: confirm `VITE_RAZORPAY_KEY_ID` starts with `rzp_live_` in the web container/build.
5. Run existing tests: `cd apps/api && npm test` — must pass with 0 failures (confirms upsert regression tests, allowBackorder tests, GREATEST tests all green).

**Pass/fail**: All 5 checks pass. If any fail, fix it before proceeding. No feature work until the foundation is confirmed.

### Phase 2 — Design

**Goal**: Design-system components and page layouts before writing any feature code.

1. Extend the design system (`@aurevo/design-system`) with:
   - `Badge` component (semantic color variants: success, warning, error, info)
   - `Stat` component (for KPI cards: label, value, trend arrow, sparkline slot)
   - `DataTable` component (sortable columns, loading skeleton, empty state, responsive overflow)
   - `Modal` component (focus trap, escape-to-close, backdrop click)
   - `Toast` / notification component (auto-dismiss, position configurable)
   - `Skeleton` component (for loading states — never show blank pages)
2. Define the complete token system in CSS custom properties (both themes).
3. Design all new page layouts as static HTML/CSS mockups before React implementation.
4. Audit every new page against: responsive breakpoints, both themes, keyboard navigation, focus states.

**Pass/fail**: Every new/modified component renders correctly in both light and dark themes. Every interactive element has a visible focus state. No layout shifts at phone width.

### Phase 3 — Build (Lightweight)

**Goal**: Smallest real features that unblock a sale and a reasonable customer experience.

1. **Shipping method seeding**: Ensure at least one active shipping method is created automatically on first startup (add to the startup script or a one-time migration, not the production seed which is intentionally disabled). Verify by restarting the API container and checking the count.
2. **Product search refinement**: If the current search is basic, add server-side full-text search on product `name` and `description` fields using Postgres `@@fulltext` or trgm index. Wire to the existing search input in StoreLayout.
3. **Cart item count in header**: Confirm the live badge count matches reality (already working — verify with a quick manual add-to-cart + check header).
4. **Mobile header**: Hamburger menu for navigation, search, cart on phones.

**Pass/fail**: A customer can search for a product, add it to cart, see the correct count in the header, and reach checkout with a shipping method available to select — all on a phone.

### Phase 4 — Build (Medium)

**Goal**: Complete the order lifecycle and admin experience.

1. **Order confirmation page**: After successful payment, show a rich confirmation with order number, items, total, estimated delivery, and a "Continue shopping" link.
2. **My Orders page**: List the customer's order history with status, date, total. Click into order detail.
3. **Admin order management**: Orders list with status filter, click into detail, update status (processing, shipped, delivered), add tracking number.
4. **Category pages**: `/products?category=<slug>` filtering. Category navigation in the header.
5. **Wishlist**: Add/remove from product cards and detail page. Wishlist page showing saved items.
6. **Product reviews**: Star rating + text review on product detail page. Reviews displayed with date and reviewer name (no email).

**Pass/fail**: A customer can complete the full journey: browse → add to cart → checkout → pay → see confirmation → view order in "My Orders". Admin can manage orders.

### Phase 5 — Build (Heavy)

**Goal**: Advanced features, analytics, and polish.

1. **Account page enhancements**: Order history summary, saved addresses, notification preferences (UI only until email is enabled).
2. **Advanced analytics dashboard**: Revenue trends, conversion funnel visualization, top products/customers with charts (leverage the existing 6 analytics endpoints).
3. **Inventory management UI**: Admin can view/edit stock levels, set low-stock thresholds, see reservation counts.
4. **Supplier management**: Admin CRUD for suppliers, view supplier-linked products.
5. **Email templates**: Build the HTML templates for verification, password reset, and order confirmation (even if email is still disabled — templates should be ready).
6. **Performance**: Lazy-load all route components (already done via React.lazy). Add `loading="lazy"` to all product images. Implement virtual scrolling for large product lists if needed.
7. **Analytics instrumentation**: Track page views, add-to-cart events, checkout starts, payment completions. Use the existing analytics endpoints. Consider a lightweight event queue.

**Pass/fail**: The admin panel is fully functional. Analytics show real data. Email templates exist and render correctly. Page load performance is acceptable (LCP < 2.5s on 3G).

### Phase 6 — Security Review

**Goal**: Verify every security requirement is met before any code ships.

Run through every item from the Security Posture section (S1–S6) and check it against the actual code:

1. **Secrets audit**: `grep -r "rzp_live\|JWT_ACCESS\|JWT_REFRESH\|ENCRYPTION_KEY" apps/web/src/` — must return NOTHING. These must never appear in client-side code.
2. **Webhook signature verification**: Read `apps/api/src/modules/payments/payments.service.ts` — confirm both webhook and client-verify paths use HMAC-SHA256 with `crypto.timingSafeEqual`.
3. **Admin guard audit**: `grep -r "UseGuards" apps/api/src/modules/ --include="*.controller.ts" | grep -v Jwt` — must return nothing except webhook controllers and cart/checkout (which use OptionalJwt).
4. **CSP audit**: Read `apps/api/nginx.tunnel.conf` — confirm CSP allows only Razorpay domains, no wildcards.
5. **Input validation**: Confirm every POST/PUT endpoint has a DTO with `class-validator` decorators.
6. **Error handling**: Confirm no `catch (e) { res.status(500).send(e) }` patterns. Errors should return generic messages; stack traces logged server-side only.
7. **Cookie security**: Confirm refresh token cookie has `httpOnly: true`, `secure: true` (in production), `sameSite: 'strict'`, and a reasonable `maxAge`.
8. **Session ID validation**: Confirm the UUID regex is enforced on both server (`cart.service.ts`) and client (`lib/session.ts`).

**Pass/fail**: Every one of the 8 checks passes. If any fails, fix it and re-check.

### Phase 7 — Test

**Goal**: Automated verification that nothing is broken.

1. **Unit tests**: Run `cd apps/api && npm test` — must pass with 0 failures. All existing regression tests (upsert, allowBackorder, GREATEST) must remain green.
2. **New unit tests**: Write tests for any new service/controller code. Mock Prisma (no real DB). Assert on query shapes.
3. **E2e smoke test** (manual or Playwright): 
   - Visit aurevo.buzz as a guest → browse products → add to cart → verify cart badge shows count.
   - Log in → verify guest cart merges into user cart.
   - Go to checkout → select shipping method → see Razorpay button.
   - (Do NOT complete a real payment in testing — just confirm the button appears and the order preview shows the correct total.)
4. **Admin smoke test** (manual):
   - Log in as admin → navigate all 10 admin sections → confirm no blank pages, no 500 errors.
   - Create/edit/delete a shipping method in Settings.
5. **Responsive test**: Open on phone (or Chrome DevTools mobile view) → verify header, product grid, cart, checkout all render without horizontal scroll.
6. **Theme test**: Toggle dark mode → verify all text is legible, no broken contrast, all interactive elements visible.

**Pass/fail**: All 6 checks pass. No test failures. No blank pages. No horizontal scroll on any page.

### Phase 8 — Review

**Goal**: Human-in-the-loop quality gate.

1. Self-review the complete diff against the acceptance checklist below.
2. Check for: console.log statements left in production code, TODO comments that should be addressed, dead code, unused imports.
3. Verify all new API endpoints have corresponding frontend calls.
4. Verify the build succeeds: `npm run build` from the monorepo root (or `turbo build`).
5. Verify no TypeScript errors: `npx tsc --noEmit` in both apps/api and apps/web.

**Pass/fail**: Build succeeds, no TypeScript errors, no dead code, no console.log in production paths.

### Phase 9 — Ship

**Goal**: Deploy to production and verify live.

1. Rebuild: `docker compose -f docker-compose.prod.yml -f docker-compose.tunnel.yml build --no-cache api web`
2. Deploy: `docker compose -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d`
3. Verify API health: `curl -fsS https://aurevo.buzz/api/health` returns 200.
4. Verify no P2002 in fresh logs: `docker logs aurevo-api --tail 100 | grep P2002` — must return nothing.
5. Full customer journey on aurevo.buzz: browse → cart → checkout → Razorpay → confirm.
6. Admin journey: log in → all sections load → manage shipping method.

**Pass/fail**: The live site works end-to-end. No 500 errors in logs.

---

## Final acceptance checklist (run this yourself before declaring done)

- [ ] Shipping method exists in prod (SELECT count returns ≥ 1)
- [ ] Razorpay checkout opens with the live key (not "coming soon")
- [ ] Cart badge count matches actual cart contents
- [ ] Guest→user cart merge works (add as guest, log in, cart items preserved)
- [ ] Checkout shows shipping method selection
- [ ] Payment completes (or at minimum, the Razorpay modal opens with the correct amount)
- [ ] Order confirmation page displays after payment
- [ ] My Orders page shows the order
- [ ] Admin dashboard loads with real KPIs
- [ ] All 10 admin sections load without blank pages
- [ ] Dark mode works on every page
- [ ] Mobile layout works on every page (no horizontal scroll)
- [ ] No console.log in production code paths
- [ ] `npm test` passes with 0 failures
- [ ] `npm run build` succeeds
- [ ] No P2002 errors in API logs
- [ ] No 500 errors in API logs during the smoke test
- [ ] CSP headers correct (Razorpay only, no wildcards)
- [ ] No secrets in client-side bundle (grep apps/web/src for rzp_live, JWT, ENCRYPTION)
- [ ] Cookie settings correct (httpOnly, secure, sameSite)
