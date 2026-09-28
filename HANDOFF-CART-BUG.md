# AUREVO — Cart-Empty + P2002: Debugging Runbook (handoff)

Paste everything below as the opening message to the next Claude instance. It is
a complete systematic-debugging runbook: operating contract, full deployment
context, confirmed fixes, the exact data-flow model, a deterministic
evidence→decision table, and byte-accurate, ready-to-apply fixes gated behind that
evidence. **Do not edit anything until the evidence in "Phase 1" is gathered and
a single root cause is confirmed.**

---

## PART 0 — OPERATING CONTRACT (this is non-negotiable)

You are debugging a live production app. Follow the systematic-debugging skill
blindly:

- **Iron Law: no fixes without root-cause investigation first.** You are forbidden
  from pattern-matching an error message to an edit. A prior pass did exactly that
  (boolean=integer, table name, GREATEST, P2002 catch, merge-await) and two
  symptoms persist. Your job is to find the SINGLE underlying mechanism, not to
  keep patching symptoms.
- The four phases in order: (1) read errors + gather runtime evidence, (2) trace
  data flow fully, (3) form ONE hypothesis and test it minimally, (4) fix with a
  failing test first.
- One variable at a time. No bundled edits. No "while I'm here" additions.
- If 3+ fixes fail, STOP and question the architecture — do not attempt a 4th.
- Say "I don't know X" when you don't. Never bluff.

The two symptoms you must reconcile with ONE root cause:
1. `prisma:error ... Unique constraint failed on the fields: (sessionId)` repeatedly
   in the API logs.
2. Cart page AND checkout both render "Your cart is empty" — even though the user
   deliberately added products.

## PART 1 — ENVIRONMENT / MUST-KNOW CONSTRAINTS

- Windows 11 PC. App in Docker + Cloudflare Tunnel, public host `aurevo.buzz`.
- **You cannot run Docker** (the agent's own classifier blocks docker commands).
  The human runs every docker command. Hand them the exact command, then ask for
  verbatim stdout.
- Stack: NestJS + React 18 (Vite), Prisma, PostgreSQL, Redis, Nginx, Cloudflare
  Flexible SSL. Monorepo (Turborepo / npm workspaces): `@aurevo/api`, `@aurevo/web`,
  `@aurevo/design-system`, `@aurevo/shared`.
- API container runs `prisma db push --skip-generate && node main`. **`db push` — no
  migrate, no seed.** So prod has only what running code pushed plus manual rows.
- **KNOWN DATA GAP: prod has ZERO shipping methods.** Not from code — from data.
  The seed that creates one never runs. Until this is fixed, checkout cannot
  complete (nothing to select). This is a SEPARATE blocker from the empty-cart.
- Deploy (human): `docker compose -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d --build`
- Logs (human): `docker logs aurevo-api --tail 200`
- Prisma `@@map` table names (raw SQL MUST use these): `Cart`→`carts`,
  `CartItem`→`cart_items`, `Order`→`orders`, `ShippingMethod`→`shipping_methods`,
  `Product`→`products`, `Inventory`→`inventory`, `ProductVariant`→`product_variants`.
  **Columns are camelCase and quoted in raw SQL** (e.g. `"reservedQuantity"`,
  `"allowBackorder"`, `"createdAt"`), because the schema does not `@map` fields.
- `inventory.allowBackorder` is a **Boolean** column. Postgres rejects
  `boolean = integer`. Use `= true`. The release UPDATE in `orders.service.ts` uses
  Postgres `GREATEST(0, ...)` (scalar `MAX(0,...)` is SQLite → 42883 on Postgres).
- If you touch `schema.prisma`, you MUST regenerate the client before `nest build`
  or it fails TS2353: `npx prisma generate --schema apps/api/prisma/schema.prisma`.
- Tests: Jest via `npm test` (compiles first). Unit tests mock Prisma (no real DB);
  regressions assert on the QUERY STRINGS the mocked client would receive.
- API must run/verify with `PORT=4000` (never the routed 20128).

## PART 2 — CONFIRMED FIXES ALREADY IN THE CODE (verify, do NOT redo / do NOT re-break)

These fixed three distinct 500s and are locked by regression tests. Leave them.

1. `apps/api/src/modules/checkout/checkout.service.ts:186` — reserve SQL uses
   `"allowBackorder" = true` (was `= 1`). Test asserts `= true` present / `= 1` absent.
2. `apps/api/src/modules/admin/admin.service.ts` — revenue SQL reads `FROM "orders"`
   (was `"Order"`).
3. `apps/api/src/modules/orders/orders.service.ts:410` — release uses `GREATEST(0,...)`.
   Test asserts `GREATEST(0` present / `MAX(0` absent.
4. `apps/web/src/stores/cart.ts` — `mergeSessionIntoUser` only deletes
   `aurevo_session_id` after a SUCCESSFUL merge (was: deleted in `finally`).
5. `apps/web/src/layouts/store/StoreLayout.tsx` — on `authenticated`, `await`
   `mergeSessionIntoUser()` THEN refresh (was fire-and-forget).
6. `apps/api/src/modules/cart/cart.service.ts` `getOrCreateCart` — try/catch on P2002
   that re-fetches the winner.

**Open question you MUST settle before trusting the code:** does the running
container actually contain 4/5/6? Docker can rebuild from a cache. If the live
image predates these edits, the P2002 is uncaught (→500) and the merge is un-awaited
(→empty cart). That alone explains both symptoms. Top hypothesis. Cheap to rule out.

## PART 3 — THE DATA-FLOW MODEL (traced read-by-read; reason from THIS)

Cart row identity: a `carts` row has **either** `userId` (unique) **or** `sessionId`
(unique), never both. On the schema: `Cart { userId String? @unique, sessionId String? @unique }`
(also `@@index([userId])`, `@@index([sessionId])`).

- Signed-out visitor: `getSessionId()` (`apps/web/src/lib/session.ts`) reads/creates
  `localStorage['aurevo_session_id']` (a UUID). Cart calls add `?sessionId=<uuid>`.
- Signed-in user: helpers `sessionParams()` (`Cart.tsx:50`, `stores/cart.ts:26`) and
  `sp()` (`Checkout.tsx:76`) return `{}` when authenticated — **no sessionId sent**.
  Server keys on `userId` from the JWT (`@CurrentUser('sub')`).

`getOrCreateCart(userId, sessionId)` (`cart.service.ts:23`) is the single funnel for
every cart endpoint (get, summary, validate, add, update-item, remove-item, clear,
merge, checkout preview):
```
where = userId ? { userId } : { sessionId };
let cart = findFirst(where, { include items });
if (!cart) { try { cart = create({ data:{userId,sessionId}, include }}   // creates EMPTY cart
             catch(P2002){ cart=findFirst(where); if(!cart) throw; } }
return cart;
```
**Consequence: every read that misses CREATES a fresh EMPTY cart.** Even `GET /cart`,
`GET /cart/summary`, `GET /checkout/preview` create carts. This is the crux.

Merge on login — `mergeCarts(userId, sessionId)` (`cart.service.ts:267`):
```
sessionCart = findFirst({ where:{sessionId}, include:{items} });   // the 3-item guest cart
if (!sessionCart || items.length===0) return getOrCreateCart(userId); // EARLY EXIT → empty user cart
userCart = getOrCreateCart(userId);                                    // creates user cart if none
for (it of sessionCart.items) upsert items into userCart;              // move items
prisma.cart.delete({ where:{id:sessionCart.id} });                     // delete guest cart
return getOrCreateCart(userId);                                        // REDUNDANT (harmless)
```
Frontend (`stores/cart.ts:58`): `POST /cart/merge {sessionId}`, and only on success
`localStorage.removeItem('aurevo_session_id')`.

## PART 4 — PHASE 1: EVIDENCE TO GATHER (do ALL, verbatim, before any analysis fix)

Run these with the human, then STOP and reason. Map results to the table in Part 5.

**E1 — Which image is actually live?** (Cheapest; does ~30% of the diagnosis.)
```
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker image ls | grep aurevo-api
```
Note the API image digest/hash and creation time. If it looks stale, rebuild fresh
so the P2002 catch actually exists in the running code:
```
docker compose -f docker-compose.prod.yml -f docker-compose.tunnel.yml build --no-cache api
docker compose -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d api
```

**E2 — Fresh startup + P2002 in context.**
```
docker logs aurevo-api --tail 100
```
Record the newest startup timestamp. Check whether a `prisma:error P2002` is now
followed by a successfully-returned cart (handled catch) or by a 500 (uncaught).

**E3 — Inspect the carts table.**
```
docker compose exec -T postgres psql -U postgres -d <dbname> -c 'SELECT "id","userId","sessionId","createdAt" FROM carts ORDER BY "createdAt" DESC LIMIT 20;'
docker compose exec -T postgres psql -U postgres -d <dbname> -c 'SELECT c."id", c."userId", c."sessionId", count(ci."id") AS items, array_agg(ci."productId") FROM carts c LEFT JOIN cart_items ci ON ci."cartId"=c."id" GROUP BY c."id" ORDER BY c."createdAt" DESC LIMIT 20;'
```
(Replace `<dbname>`; find it from the compose/env. If the exec user differs, match it.)
Questions: how many carts? Any duplicate `sessionId` or `userId` (races/orphans)?
**Which row holds the user's 3 items — a `userId` row or a `sessionId` row?** Is there
a session cart with the items PLUS a newer empty one?

**E4 — Browser truth (the killer evidence, pairs with E3).** Ask the user to open
DevTools → Network, load the Cart page on `aurevo.buzz`:
- The exact `/cart` request URL — is `sessionId=` present or absent?
- The JSON response body — how many `items`, which names?
- Application → Local Storage → http://aurevo.buzz → paste `aurevo_session_id`.
- Is the user currently signed in or signed out when the cart is empty?

Cross the E4 localStorage UUID against the E3 `sessionId` column. If it doesn't match
any row-with-items → session rotated (Part 5 branch C2). If it matches an empty cart
while a full one exists elsewhere → race/orphan (C3/C4). If the user is signed-in and
the `userId` cart is empty → the merge never populated it (C1/C3).

## PART 5 — DECISION TABLE (single evidence → single conclusion → single fix)

| Observed | Root cause | Primary fix |
|---|---|---|
| E1 image hash/timestamp OLD, or E2 newest start predates your rebuild | **C1: stale image** — catch/merge fixes not deployed. Uncaught P2002 → 500; merge un-awaited → empty. | Rebuild `--no-cache api` (E1 command). Re-verify. Likely done after a clean rebuild. |
| Signed-in user, cart empty, E3 shows the 3 items pending in a `sessionId` row (not yet merged into `userId`) or the `userId` cart has 0 rows | **C3: merge/item-move never populated the user cart** (early-exit emptied it, or a concurrent read saw mid-merge state) | Fix A (atomic upsert) + Fix C (merge correctness). |
| Signed-OUT user sees empty; E3 shows the 3 items under a `userId` row; E4 shows a fresh/different `sessionId` | **C2: session rotation** — after merge the guest id is deleted; a later guest reload mints a NEW session cart (empty). Account items are (by design) not visible signed-out. | Fix B. Not a code bug if expected; document + optionally keep a recoverable guest id. |
| E3 shows DUPLICATE carts sharing one `sessionId`/`userId` | **C4: orphaned/duplicate rows** from prior races | Fix A (stops new duplicates) + sanitize SQL to fold items onto one canonical row and delete the rest (Part 7). |
| Any confirmed P2002 still pending, regardless of branch | Race is `findFirst`→`create` non-atomic | **Fix A mandatory.** |

If evidence is contradictory or does not fit one row → stop, report it, do not guess.

## PART 6 — FIX A (PRIMARY, always correct): make cart creation atomic via upsert

Replace the whole body of `getOrCreateCart` (`cart.service.ts:23–111`) with a single
atomic upsert. `where` is already `{ userId }` or `{ sessionId }` — both are valid
Prisma unique `where` inputs, so the upsert uses the same shape. **No P2002 is
possible by construction**: there is no separate create to race.

```ts
async getOrCreateCart(userId?: string, sessionId?: string) {
  if (!userId && !sessionId) {
    throw new BadRequestException('Either userId or sessionId is required');
  }
  if (!userId && !isValidSessionId(sessionId)) {
    throw new BadRequestException('Invalid session identifier');
  }
  const where = userId ? { userId } : { sessionId };
  return this.prisma.cart.upsert({
    where,
    update: {},
    create: { userId, sessionId },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: { where: { isPrimary: true }, take: 1 },
              variants: { where: { isActive: true } },
              inventory: true,
            },
          },
          variant: { include: { inventory: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}
```
Note `update: {}` leaves the existing cart untouched (never wipes items), and the
same `include` shape is returned whether the row existed or was just created.

## PART 7 — FIX B (C2) and Fix C (C3), only if their branch fires

- **C2 / Fix B (frontend):** do not lose recoverable identity. In
  `stores/cart.ts` `mergeSessionIntoUser`, before overwriting, also treat the
  transition symmetrically so a later logout still finds a guest cart — OR keep the
  3 items in the user cart deliberately (account feature). If the user simply expects
  "I logged out, show my stuff," the correct product answer is: it lives in their
  account; sign back in. Do not build data leakage — a signed-out client must never
  read another identity's cart.
- **C3 / Fix C (merge correctness):** in `cart.service.ts` `mergeCarts`, the early
  return at line 279-281 (`if items.length===0 return getOrCreateCart(userId)`) can
  manufacture an empty user cart; and the trailing `getOrCreateCart(userId)` at 315 is
  redundant. Also after the merge completes, the frontend should confirm the user cart
  now contains the merged count before treating login-cart as ready (the StoreLayout
  `await` in fix #5 already does most of this). Remove the redundant re-read and make
  the early-exit not imply "items lost."

## PART 8 — FIX D (data, the SEPARATE shipping blocker): prod has zero shipping methods

The seed that creates one only ships via `prisma db push`-never-seed. Insert directly
(human runs this against the prod postgres). Idempotent (unique `code` conflict-safe).
Columns are camelCase and quoted. `ShippingMethod → shipping_methods`:
```sql
INSERT INTO shipping_methods
  (id, name, code, description, baseCost, perItemCost, perKgCost,
   freeShippingThreshold, minOrderAmount, maxOrderAmount,
   estimatedDays, currency, isActive, sortOrder, createdAt, updatedAt)
VALUES
  ('seed_shipping_0000000001', 'Standard Shipping', 'standard', NULL, 0, NULL, NULL,
    NULL, NULL, NULL, 5, 'INR', true, 0, now(), now())
ON CONFLICT (code) DO NOTHING;
```
(Adjust the psql user/db per environment — same as E3.) Confirm afterward:
`SELECT count(*) FROM shipping_methods;`

## PART 9 — REGRESSION TEST YOU MUST WRITE BEFORE THE FIX (failing → then passing)

In `apps/api/src/modules/cart/cart.service.test.ts` (create if absent; mock Prisma,
no real DB) add a test for `getOrCreateCart` proving the create is atomic:

- Mock `prisma.cart.upsert` to resolve a cart fixture.
- Assert `getOrCreateCart('user-1', undefined)` calls `upsert` with
  `expect.objectContaining({ where: { userId: 'user-1' }, update: {}, create: { userId: 'user-1' } })`.
- Assert the guest path calls `upsert` with `where: { sessionId: '<uuid>' }`.
- Assert it NEVER calls `prisma.cart.create` (the race that caused P2002). This fails
  on the current `findFirst→create` code and passes after Fix A.

Keep the existing `allowBackorder`/`GREATEST` regressions green. Run:
```
cd apps/api && npm test
```
(The api workspace uses Jest; `npm test` compiles first.)

## PART 10 — DEFINITION OF DONE

- Human ran E1–E4 and pasted output; you mapped it to exactly one row of Part 5.
- You wrote the failing test (Part 9) and it fails before / passes after your ONE fix.
- Cart page and checkout preview on `aurevo.buzz` show the user's products (verify in
  browser, signed-in AND signed-out as applicable).
- No P2002 in a fresh `docker logs aurevo-api`, and no 500 on cart/checkout routes.
- `shipping_methods` has ≥1 active row (Fix D), so checkout can actually complete.
- `npm test` for `@aurevo/api` passes; prior regressions intact.
- A human confirms the places-order flow reaches the Razorpay step.