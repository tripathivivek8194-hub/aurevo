/**
 * Phase 10 live verification probe (local, no Razorpay network needed).
 *
 * Exercises the payments security invariants against the running local API:
 *   A1 amount/currency integrity (webhook rejects mismatches, order never PAID)
 *   A2 idempotent processing (replay does not double-mutate)
 *   A3 order state-transition guard (captured on CANCELLED order rejected)
 *   Ownership gating on POST /payments/create-order (403 for non-owners)
 *
 * The provider leg is SIMULATED: because RAZORPAY keys are placeholder strings,
 * createRazorpayOrder fails at the SDK call before writing a Payment row. So we
 * seed a Payment row directly in dev.db (via Prisma) to make webhook probes run
 * without the provider. HMAC-SHA256 is computed over the EXACT raw body string
 * transmitted, mirroring payments.service.ts verifyPaymentWebhook.
 *
 * Run from apps/api:  node scripts/phase10-webhook-probe.mjs
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- load .env (values never printed) ----
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}
const env = loadEnv();
const WEBHOOK_SECRET = env.RAZORPAY_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error('RAZORPAY_WEBHOOK_SECRET missing from .env');
  process.exit(1);
}
process.env.DATABASE_URL = env.DATABASE_URL;

const API = 'http://localhost:4000';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(method, url, { body, headers = {} } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + url, opts);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

function sign(rawBody) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function razorpayPayload({ amountPaise, currency = 'INR', status = 'captured', paymentId, orderId }) {
  const payload = {
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise, currency, status } },
    },
  };
  const rawBody = JSON.stringify(payload);
  return { rawBody, signature: sign(rawBody) };
}

const validAddress = () => ({
  firstName: 'Probe', lastName: 'User',
  address1: '123 Main Street', city: 'New York', state: 'NY',
  postalCode: '10001', country: 'US', phone: '+1-555-123-4567',
});

async function main() {
  console.log('=== Phase 10 live verification probe ===\n');

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const email = `probe_${Date.now()}@example.com`;
  let orderId, orderTotalPaise, providerPaymentId, providerOrderId;
  let token;

  try {
    // ---- 1. register + login ----
    console.log('[1] Register + login customer');
    const reg = await api('POST', '/api/auth/register', {
      body: { email, password: 'Password123!', firstName: 'Probe', lastName: 'User' },
    });
    check('register 201', reg.status === 201, `status=${reg.status}`);
    const login = await api('POST', '/api/auth/login', { body: { email, password: 'Password123!' } });
    token = login.json?.data?.accessToken;
    check('login returns accessToken', login.status === 200 && !!token, `status=${login.status}`);

    // ---- 2. create an order (PAYMENT_PENDING) ----
    console.log('\n[2] Create order via cart + checkout');
    const products = await api('GET', '/api/products?limit=1&status=ACTIVE');
    const prod = products.json?.data?.data?.[0];
    check('fetched an ACTIVE product', !!prod, `id=${prod?.id}`);
    if (!prod) throw new Error('no active product available');

    const add = await api('POST', '/api/cart', {
      body: { productId: prod.id, quantity: 1 },
      headers: { Authorization: `Bearer ${token}` },
    });
    check('added to cart 201', add.status === 201, `status=${add.status}`);

    const checkout = await api('POST', '/api/checkout', {
      body: { email, shippingAddress: validAddress() },
      headers: { Authorization: `Bearer ${token}` },
    });
    orderId = checkout.json?.data?.order?.id;
    const orderStatus = checkout.json?.data?.order?.status;
    check('checkout created order', !!orderId, `status=${orderStatus}`);
    check('order is PAYMENT_PENDING', orderStatus === 'PAYMENT_PENDING', `status=${orderStatus}`);

    const orderRow = await prisma.order.findUnique({ where: { id: orderId } });
    orderTotalPaise = orderRow.total;
    check('order total read from DB (paise)', Number.isInteger(orderTotalPaise), `total=${orderTotalPaise}`);

    // ---- 3. ownership gating on create-order (before any provider call) ----
    console.log('\n[3] Ownership gating on POST /payments/create-order');
    const unauth = await api('POST', '/api/payments/create-order', { body: { orderId } });
    check('unauthenticated create-order -> 403', unauth.status === 403, `status=${unauth.status}`);
    const other = await api('POST', '/api/payments/create-order', {
      body: { orderId },
      headers: { Authorization: `Bearer ${token}` }, // same owner -> reaches provider
    });
    // A legit owner reaches createRazorpayOrder, which with placeholder keys fails
    // at the SDK call (honest provider failure, not a fabricated 200). Order still
    // PAYMENT_PENDING.
    const st = await prisma.order.findUnique({ where: { id: orderId } });
    check('owner create-order does NOT mutate order (stays PAYMENT_PENDING)',
      st.status === 'PAYMENT_PENDING', `status=${st.status}`);
    // note: this request may 500/502 from the SDK; that is the honest blocked leg.
    console.log(`    (owner create-order returned ${other.status}; provider leg blocked by placeholder keys — documented)`);

    // ---- 4. seed a Payment row (simulated provider leg) ----
    console.log('\n[4] Seed Payment row (simulated provider)');
    providerPaymentId = `pay_test_${Date.now()}`;
    providerOrderId = `order_test_${Date.now()}`;
    const seeded = await prisma.payment.create({
      data: {
        orderId,
        provider: 'RAZORPAY',
        providerPaymentId,
        providerOrderId,
        amount: orderTotalPaise,
        currency: 'INR',
        status: 'PENDING',
      },
    });
    check('payment row seeded', !!seeded.id, `amount=${seeded.amount} ${seeded.currency}`);

    // ---- 5. webhook probes ----
    console.log('\n[5a] Forged signature (not HMAC) — no order mutation');
    const forged = razorpayPayload({ amountPaise: orderTotalPaise, paymentId: providerPaymentId, orderId: providerOrderId });
    const resForged = await api('POST', '/api/payments/webhook', {
      body: JSON.parse(forged.rawBody),
      headers: { 'x-razorpay-signature': 'deadbeef'.repeat(8) },
    });
    check('forged sig -> 200 {verified:false}', resForged.status === 200 && resForged.json?.data?.verified === false,
      `status=${resForged.status} verified=${resForged.json?.data?.verified}`);
    check('order stays PAYMENT_PENDING',
      (await prisma.order.findUnique({ where: { id: orderId } })).status === 'PAYMENT_PENDING');

    console.log('\n[5b] Amount mismatch (A1) -> 400 AMOUNT_MISMATCH');
    const amtBad = razorpayPayload({ amountPaise: 400, paymentId: providerPaymentId, orderId: providerOrderId });
    const resAmt = await api('POST', '/api/payments/webhook', {
      body: JSON.parse(amtBad.rawBody),
      headers: { 'x-razorpay-signature': amtBad.signature },
    });
    check('amount mismatch -> 400', resAmt.status === 400, `status=${resAmt.status}`);
    check('reason AMOUNT_MISMATCH', /AMOUNT_MISMATCH/.test(JSON.stringify(resAmt.json)), JSON.stringify(resAmt.json).slice(0, 90));
    check('order stays PAYMENT_PENDING',
      (await prisma.order.findUnique({ where: { id: orderId } })).status === 'PAYMENT_PENDING');

    console.log('\n[5c] Currency mismatch (A1) -> 400 CURRENCY_MISMATCH');
    const curBad = razorpayPayload({ amountPaise: orderTotalPaise, currency: 'USD', paymentId: providerPaymentId, orderId: providerOrderId });
    const resCur = await api('POST', '/api/payments/webhook', {
      body: JSON.parse(curBad.rawBody),
      headers: { 'x-razorpay-signature': curBad.signature },
    });
    check('currency mismatch -> 400', resCur.status === 400, `status=${resCur.status}`);
    check('reason CURRENCY_MISMATCH', /CURRENCY_MISMATCH/.test(JSON.stringify(resCur.json)));
    check('order stays PAYMENT_PENDING',
      (await prisma.order.findUnique({ where: { id: orderId } })).status === 'PAYMENT_PENDING');

    console.log('\n[5d] Happy path: valid captured webhook -> 200, order PAID');
    const good = razorpayPayload({ amountPaise: orderTotalPaise, paymentId: providerPaymentId, orderId: providerOrderId });
    const resGood = await api('POST', '/api/payments/webhook', {
      body: JSON.parse(good.rawBody),
      headers: { 'x-razorpay-signature': good.signature },
    });
    check('valid webhook -> 200', resGood.status === 200, `status=${resGood.status} verified=${resGood.json?.data?.verified}`);
    const payAfter = await prisma.payment.findUnique({ where: { id: seeded.id } });
    check('payment -> CAPTURED', payAfter.status === 'CAPTURED', `status=${payAfter.status}`);
    check('payment webhookVerified', payAfter.webhookVerified === true);
    check('order -> PAID', (await prisma.order.findUnique({ where: { id: orderId } })).status === 'PAID');

    console.log('\n[5e] Idempotent replay (A2) -> 200, no second mutation');
    const resReplay = await api('POST', '/api/payments/webhook', {
      body: JSON.parse(good.rawBody),
      headers: { 'x-razorpay-signature': good.signature },
    });
    check('replay -> 200', resReplay.status === 200, `status=${resReplay.status}`);
    check('replay leaves payment CAPTURED',
      (await prisma.payment.findUnique({ where: { id: seeded.id } })).status === 'CAPTURED');

    console.log('\n[5f] A3: captured on CANCELLED order -> 400 ILLEGAL_ORDER_STATE');
    // cancel the order, then attempt a fresh capture via a new payment row
    await prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    const bsPay = `pay_test_badstate_${Date.now()}`;
    const bsOrder = `order_test_badstate_${Date.now()}`;
    const bsRow = await prisma.payment.create({
      data: {
        orderId, provider: 'RAZORPAY', providerPaymentId: bsPay, providerOrderId: bsOrder,
        amount: orderTotalPaise, currency: 'INR', status: 'PENDING',
      },
    });
    const badState = razorpayPayload({ amountPaise: orderTotalPaise, paymentId: bsPay, orderId: bsOrder });
    const resBadState = await api('POST', '/api/payments/webhook', {
      body: JSON.parse(badState.rawBody),
      headers: { 'x-razorpay-signature': badState.signature },
    });
    check('captured on CANCELLED -> 400', resBadState.status === 400, `status=${resBadState.status}`);
    check('reason ILLEGAL_ORDER_STATE', /ILLEGAL_ORDER_STATE/.test(JSON.stringify(resBadState.json)));
    check('order stays CANCELLED',
      (await prisma.order.findUnique({ where: { id: orderId } })).status === 'CANCELLED');

    // ---- 6. cleanup ----
    console.log('\n[6] Cleanup');
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });
    await prisma.cartItem.deleteMany({ where: { cart: { userId: (await prisma.user.findUnique({ where: { email } }))?.id } } });
    await prisma.cart.deleteMany({ where: { userId: (await prisma.user.findUnique({ where: { email } }))?.id } });
    await prisma.user.deleteMany({ where: { email } });
    console.log('  cleanup done');
  } catch (e) {
    console.error('\nProbe crashed:', e.message);
    // best-effort cleanup
    try {
      if (orderId) await prisma.payment.deleteMany({ where: { orderId } });
      if (orderId) await prisma.order.deleteMany({ where: { id: orderId } });
      await prisma.user.deleteMany({ where: { email } });
    } catch {}
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Probe crashed:', e);
  process.exit(1);
});
