import 'reflect-metadata';
import crypto from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Security regression tests for the payments hardening:
 *  - the Razorpay webhook HMAC is computed over the EXACT raw bytes transmitted
 *    (never a re-serialized object);
 *  - a signature-valid webhook whose amount/currency disagree with the stored
 *    order total is REJECTED (verified:false) and never marks the order PAID (A1);
 *  - idempotency runs AFTER the amount/currency re-check (A2);
 *  - order state-transition guards refuse illegal flips (A3);
 *  - create-order is gated on order state + duplicate live payments (A4);
 *  - the amount/currency sent to Razorpay are derived server-side only (A5).
 * Prisma/config are mocked; no DB or network is touched.
 */
describe('PaymentsService — webhook signature verification', () => {
  const WEBHOOK_SECRET = 'whsec_test_0123456789abcdef';

  function build() {
    const prisma: any = {
      payment: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
      order: { update: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const configService: any = {
      get: (key: string) => {
        if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_key';
        if (key === 'RAZORPAY_KEY_SECRET') return 'rzp_test_secret';
        if (key === 'RAZORPAY_WEBHOOK_SECRET') return WEBHOOK_SECRET;
        return undefined;
      },
    };
    const service = new PaymentsService(prisma, configService);
    // Replace the real Razorpay client — the tests must never reach the network.
    const razorpayMock = { orders: { create: jest.fn() } };
    (service as any).razorpay = razorpayMock;
    return { service, prisma, configService, razorpayMock };
  }

  function sign(body: string, secret: string) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  /** Builds a signed `payment.captured` webhook for a fresh, pending payment. */
  function signedCapture(rawBodyExtra = '') {
    const rawBody = `{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_X","order_id":"rzp_1","amount":100000,"status":"captured","currency":"INR"${rawBodyExtra}}}}}`;
    return { rawBody, payload: JSON.parse(rawBody), signature: sign(rawBody, WEBHOOK_SECRET) };
  }

  describe('verifyPaymentWebhook', () => {
    it('accepts a signature computed over the raw body string', async () => {
      const { service, prisma } = build();
      const rawBody = signedCapture().rawBody;

      prisma.payment.findFirst.mockResolvedValueOnce(null);
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerPaymentId: 'pay_X', providerOrderId: 'rzp_1',
        amount: 100000, currency: 'INR', status: 'PENDING', webhookVerified: false,
        order: { status: 'PAYMENT_PENDING' },
      });
      prisma.payment.findUnique.mockResolvedValue({ id: 'p1', status: 'CAPTURED', order: { status: 'PAID' } });

      const result = await service.verifyPaymentWebhook(
        JSON.parse(rawBody), rawBody, sign(rawBody, WEBHOOK_SECRET),
      );
      expect(result.verified).toBe(true);
    });

    it('would FAIL if the verification had been done against re-serialized JSON', () => {
      // Regression proof: JSON.stringify(JSON.parse(raw)) rewrites the body, so
      // the HMAC no longer matches — which is exactly why the raw string must
      // be passed through untouched.
      const rawBody = '{"event":"payment.captured",   "id": 42}';
      const reserialized = JSON.stringify(JSON.parse(rawBody));
      expect(reserialized).not.toBe(rawBody);
      const signatureOnRaw = sign(rawBody, WEBHOOK_SECRET);
      const signatureOnReserialized = sign(reserialized, WEBHOOK_SECRET);
      expect(signatureOnRaw).not.toBe(signatureOnReserialized);
    });

    it('rejects a tampered body whose signature does not match', async () => {
      const { service } = build();
      const rawBody = '{"event":"payment.captured","payload":{}}';
      const payload = JSON.parse(rawBody);
      const signature = sign('{"event":"payment.failed","payload":{}}', WEBHOOK_SECRET);

      const result = await service.verifyPaymentWebhook(payload, rawBody, signature);
      expect(result.verified).toBe(false);
    });

    it('returns verified when the payment is already CAPTURED (idempotency)', async () => {
      const { service, prisma } = build();
      const { payload, rawBody, signature } = signedCapture();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', amount: 100000, currency: 'INR', status: 'CAPTURED', webhookVerified: true,
        order: { status: 'PAID' },
      });

      const result = await service.verifyPaymentWebhook(payload, rawBody, signature);
      expect(result.verified).toBe(true);
      expect(result.payment.status).toBe('CAPTURED');
    });
  });

  describe('verifyPaymentWebhook — billing integrity (A1/A2/A3)', () => {
    it('rejects a captured webhook whose amount does not match the order total, and NEVER pays (A1)', async () => {
      const { service, prisma } = build();
      // Webhook claims ₹2000; the order is ₹1000.
      const rawBody = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_X', order_id: 'rzp_1', amount: 200000, status: 'captured', currency: 'INR' } } },
      });
      const signature = sign(rawBody, WEBHOOK_SECRET);
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'PENDING', webhookVerified: false, order: { status: 'PAYMENT_PENDING' },
      });

      const result = await service.verifyPaymentWebhook(JSON.parse(rawBody), rawBody, signature);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('AMOUNT_MISMATCH');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects a captured webhook with a missing amount (nothing to verify against) (A1)', async () => {
      const { service, prisma } = build();
      const rawBody = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_X', order_id: 'rzp_1', status: 'captured', currency: 'INR' } } },
      });
      const signature = sign(rawBody, WEBHOOK_SECRET);
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'PENDING', webhookVerified: false, order: { status: 'PAYMENT_PENDING' },
      });

      const result = await service.verifyPaymentWebhook(JSON.parse(rawBody), rawBody, signature);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('AMOUNT_MISMATCH');
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects a captured webhook whose currency differs from the order (A1)', async () => {
      const { service, prisma } = build();
      const rawBody = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_X', order_id: 'rzp_1', amount: 100000, status: 'captured', currency: 'USD' } } },
      });
      const signature = sign(rawBody, WEBHOOK_SECRET);
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'PENDING', webhookVerified: false, order: { status: 'PAYMENT_PENDING' },
      });

      const result = await service.verifyPaymentWebhook(JSON.parse(rawBody), rawBody, signature);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('CURRENCY_MISMATCH');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('never flips a CANCELLED order back to PAID (A3)', async () => {
      const { service, prisma } = build();
      const { payload, rawBody, signature } = signedCapture();
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'PENDING', webhookVerified: false, order: { status: 'CANCELLED' },
      });

      const result = await service.verifyPaymentWebhook(payload, rawBody, signature);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('ILLEGAL_ORDER_STATE');
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('never flips a SHIPPED order back to PAID (A3)', async () => {
      const { service, prisma } = build();
      const { payload, rawBody, signature } = signedCapture();
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'PENDING', webhookVerified: false, order: { status: 'SHIPPED' },
      });

      const result = await service.verifyPaymentWebhook(payload, rawBody, signature);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('ILLEGAL_ORDER_STATE');
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects a refunded event on an order that was never paid (A3)', async () => {
      const { service, prisma } = build();
      const rawBody = JSON.stringify({
        event: 'payment.refunded',
        payload: { payment: { entity: { id: 'pay_X', order_id: 'rzp_1', amount: 100000, status: 'refunded', currency: 'INR' } } },
      });
      const signature = sign(rawBody, WEBHOOK_SECRET);
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'CAPTURED', webhookVerified: false, order: { status: 'PENDING' },
      });

      const result = await service.verifyPaymentWebhook(JSON.parse(rawBody), rawBody, signature);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('ILLEGAL_ORDER_STATE');
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('applies a valid capture once, then treats a replay as verified without re-applying (A2)', async () => {
      const { service, prisma } = build();
      const { payload, rawBody, signature } = signedCapture();

      const tx = {
        payment: { update: jest.fn().mockResolvedValue(undefined) },
        order: { update: jest.fn().mockResolvedValue(undefined) },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      // First event: payment is fresh (this mock is consumed by the first call).
      prisma.payment.findFirst.mockResolvedValueOnce({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'PENDING', webhookVerified: false, order: { status: 'PAYMENT_PENDING' },
      });
      // Replays thereafter: the payment is already processed. Amount/currency
      // are STILL re-verified before the idempotent early-return.
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'CAPTURED', webhookVerified: true, order: { status: 'PAID' },
      });
      prisma.payment.findUnique.mockResolvedValue({ id: 'p1', status: 'CAPTURED', order: { status: 'PAID' } });

      const first = await service.verifyPaymentWebhook(payload, rawBody, signature);
      expect(first.verified).toBe(true);

      const replay = await service.verifyPaymentWebhook(payload, rawBody, signature);
      expect(replay.verified).toBe(true);

      // Exactly one mutation across the two events.
      expect(tx.order.update).toHaveBeenCalledTimes(1);
      expect(tx.payment.update).toHaveBeenCalledTimes(1);
    });

    it('rejects a failed event on an already-paid order (cannot un-pay) (A3)', async () => {
      const { service, prisma } = build();
      const rawBody = JSON.stringify({
        event: 'payment.failed',
        payload: { payment: { entity: { id: 'pay_X', order_id: 'rzp_1', amount: 100000, status: 'failed', currency: 'INR' } } },
      });
      const signature = sign(rawBody, WEBHOOK_SECRET);
      prisma.payment.findFirst.mockResolvedValue({
        id: 'p1', providerOrderId: 'rzp_1', amount: 100000, currency: 'INR',
        status: 'PENDING', webhookVerified: false, order: { status: 'PAID' },
      });

      const result = await service.verifyPaymentWebhook(JSON.parse(rawBody), rawBody, signature);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('ILLEGAL_ORDER_STATE');
    });
  });

  describe('createOrderPayment (owner gating)', () => {
    it('throws NotFound for an order that does not exist', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.createOrderPayment('ord1', 'user-a')).rejects.toThrow(NotFoundException);
    });

    it('throws Forbidden for another user\'s order', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue({ id: 'ord1', userId: 'user-b' });
      await expect(service.createOrderPayment('ord1', 'user-a')).rejects.toThrow(ForbiddenException);
    });

    it('delegates to createRazorpayOrder for the owner', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue({ id: 'ord1', userId: 'user-a', status: 'PAYMENT_PENDING' });
      (service as any).createRazorpayOrder = jest.fn().mockResolvedValue({ razorpayOrderId: 'rzp_1' });
      const result = await service.createOrderPayment('ord1', 'user-a');
      expect((service as any).createRazorpayOrder).toHaveBeenCalledWith('ord1');
      expect(result.razorpayOrderId).toBe('rzp_1');
    });
  });

  describe('createRazorpayOrder — payable-state gating (A4) + authoritative amount (A5)', () => {
    // AUREVO stores every money amount as INTEGER PAISE (order.total, Payment.amount,
    // product basePrice, cart totals). order.total below is ₹2,500.00 = 250000 paise.
    const payableOrder = {
      id: 'ord1', userId: 'user-a', orderNumber: 'AURTEST123', total: 250000,
      currency: 'INR', status: 'PAYMENT_PENDING',
    };

    it('derives the Razorpay amount/currency server-side from the order row (A5)', async () => {
      const { service, prisma, razorpayMock } = build();
      prisma.order.findUnique.mockResolvedValue(payableOrder);
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({ id: 'pay1' });
      razorpayMock.orders.create.mockResolvedValue({ id: 'rzp_1', amount: 250000, currency: 'INR' });

      // The method takes ONLY orderId — a client can never inject amount/currency.
      const result = await service.createRazorpayOrder('ord1');
      expect(razorpayMock.orders.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 250000, currency: 'INR', receipt: 'AURTEST123' }),
      );
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 250000, currency: 'INR' }),
        }),
      );
      expect(result.amount).toBe(250000);
      expect(result.currency).toBe('INR');
    });

    it('passes order.total to Razorpay in paise AS-IS — no 100x inflation (A5 regression)', async () => {
      // Regression: the RAZORPAY order amount must equal order.total (250000 paise
      // = ₹2,500), NOT order.total*100 (25000000 paise = a 100x overcharge). The
      // old code multiplied by 100, silently charging ₹2,50,000 for a ₹2,500 order.
      const { service, prisma, razorpayMock } = build();
      prisma.order.findUnique.mockResolvedValue(payableOrder);
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({ id: 'pay1' });
      razorpayMock.orders.create.mockResolvedValue({ id: 'rzp_1', amount: 250000, currency: 'INR' });

      await service.createRazorpayOrder('ord1');
      expect(razorpayMock.orders.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 250000, currency: 'INR' }),
      );
      expect(razorpayMock.orders.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ amount: 25000000 }),
      );
    });

    it('rejects a paid order with a 409 Conflict (A4)', async () => {
      const { service, prisma, razorpayMock } = build();
      prisma.order.findUnique.mockResolvedValue({ ...payableOrder, status: 'PAID' });
      await expect(service.createRazorpayOrder('ord1')).rejects.toThrow(ConflictException);
      expect(razorpayMock.orders.create).not.toHaveBeenCalled();
    });

    it('rejects a cancelled order with a 409 Conflict (A4)', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue({ ...payableOrder, status: 'CANCELLED' });
      await expect(service.createRazorpayOrder('ord1')).rejects.toThrow(ConflictException);
    });

    it('refuses a second live payment for the same unpaid order (A4)', async () => {
      const { service, prisma, razorpayMock } = build();
      prisma.order.findUnique.mockResolvedValue(payableOrder);
      prisma.payment.findFirst.mockResolvedValue({ id: 'p0', status: 'PENDING' });
      await expect(service.createRazorpayOrder('ord1')).rejects.toThrow(ConflictException);
      expect(razorpayMock.orders.create).not.toHaveBeenCalled();
    });

    it('allows a retry after a FAILED payment attempt (A4)', async () => {
      const { service, prisma, razorpayMock } = build();
      prisma.order.findUnique.mockResolvedValue(payableOrder);
      // The live-payment query explicitly excludes FAILED attempts — a null
      // result here simulates that the only prior attempt failed and a retry
      // is allowed.
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({ id: 'pay2' });
      razorpayMock.orders.create.mockResolvedValue({ id: 'rzp_2', amount: 250000, currency: 'INR' });

      const result = await service.createRazorpayOrder('ord1');
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { notIn: ['FAILED'] } }),
        }),
      );
      expect(razorpayMock.orders.create).toHaveBeenCalled();
      expect(result.razorpayOrderId).toBe('rzp_2');
    });

    it('throws NotFound for an order that does not exist', async () => {
      const { service, prisma } = build();
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.createRazorpayOrder('missing')).rejects.toThrow(NotFoundException);
    });
  });
});