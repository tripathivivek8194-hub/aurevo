import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentStatus, OrderStatus } from '@aurevo/shared/types';

/**
 * Order states from which a *captured* webhook may legitimately mark an order
 * PAID (A3). Every other state — CANCELLED / SHIPPED / DELIVERED / REFUNDED /
 * FAILED / PROCESSING / FULFILLMENT / RETURNED — is terminal or already
 * past-payment, and must never be flipped back to PAID by a webhook.
 */
const CAPTURE_ALLOWED_ORDER_STATES = new Set(['PENDING', 'PAYMENT_PENDING', 'PAID']);

/** A `.failed` event may only apply to an order that was never paid. */
const FAILURE_ALLOWED_ORDER_STATES = new Set(['PENDING', 'PAYMENT_PENDING', 'FAILED']);

/** A `.refunded` event may only apply to an order that was actually captured. */
const REFUND_ALLOWED_ORDER_STATES = new Set(['PAID']);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpay?: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Lazily constructs the Razorpay SDK on first use. The client is only
   * required when a payment operation actually runs, so the API can still boot
   * (and tests can run) when Razorpay keys are absent/unset.
   */
  private getRazorpay(): Razorpay {
    if (!this.razorpay) {
      const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
      const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');

      if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not configured');
      }

      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }
    return this.razorpay;
  }

  /**
   * Owner-guarded entry point used by the payments controller. All order-scoped
   * access control lives here so the guard cannot be bypassed by another route
   * calling into `createRazorpayOrder` directly.
   *
   * Authorization: a logged-in user (userId) must own the order; a guest order
   * (userId: null) is authorized by proving possession of the sessionId it was
   * created from (a capability token, treated like a password). orderId remains
   * required either way and is unguessable (Prisma cuid).
   */
  async createOrderPayment(orderId: string, userId?: string, sessionId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertPayableAuth(order, userId, sessionId);
    return this.createRazorpayOrder(order.id);
  }

  /**
   * Creates a Razorpay order. The amount/currency handed to Razorpay are derived
   * SQLY from the database order row (A5) — the client never supplies either, so
   * a tampered amount can never reach the payment provider. Gated (A4): only
   * PENDING/PAYMENT_PENDING orders are payable, and an order that already has a
   * live (non-failed) payment attempt can't open a second Razorpay order.
   */
  async createRazorpayOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'PAYMENT_PENDING' && order.status !== 'PENDING') {
      throw new ConflictException(`Order is not in a payable state: ${order.status}`);
    }

    // A4: refuse to create a duplicate live order — an unpaid order may only
    // have FAILED payment attempts (a retry), never a live one.
    const livePayment = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: { notIn: ['FAILED'] } },
    });
    if (livePayment) {
      throw new ConflictException('An active payment already exists for this order');
    }

    // A5: the only authoritative amount source is `order.total` — never a
    // client-supplied figure. order.total is ALREADY integer paise (the app-wide
    // money unit, confirmed by checkout/products), and Razorpay takes minor
    // units (paise) — so pass it through unchanged. Do NOT multiply by 100: that
    // would charge 100x the real total (regression-tested).
    const razorpayOrder = await this.getRazorpay().orders.create({
      amount: order.total,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: {
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
    });

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'RAZORPAY',
        providerOrderId: razorpayOrder.id,
        amount: order.total,
        currency: order.currency,
        status: 'PENDING',
      },
    });

    return {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: this.configService.get<string>('RAZORPAY_KEY_ID'),
      paymentId: payment.id,
    };
  }

  /**
   * Authorizes a payment action against an order.
   *
   * Logged-in orders (userId set) require the JWT's subject to match the owner.
   * Guest orders (userId null) require the sessionId stored at checkout — the
   * only proof that the caller created the order. sessionId is never logged.
   */
  private assertPayableAuth(
    order: { userId: string | null; sessionId?: string | null },
    userId?: string,
    sessionId?: string,
  ): void {
    if (order.userId != null) {
      if (!userId || order.userId !== userId) {
        throw new ForbiddenException('Not authorized');
      }
      return;
    }

    // Guest order: prove possession of the creating session.
    if (!order.sessionId || !sessionId || order.sessionId !== sessionId) {
      throw new ForbiddenException('Not authorized');
    }
  }

  async verifyPaymentWebhook(
    payload: any,
    rawBody: string,
    signature: string,
  ): Promise<{ verified: boolean; payment?: any; reason?: string }> {
    const webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('Razorpay webhook secret not configured');
    }

    // HMAC the EXACT bytes Razorpay transmitted. Re-serializing the parsed JSON
    // (JSON.stringify) breaks the signature the moment field order, spacing, or
    // escaping differs from the wire payload — every legitimate webhook would
    // fail verification.
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Constant-time compare (only meaningful at equal length) against the
    // HMAC-SHA256 we derived from the raw body. `timingSafeEqual` throws on
    // unequal buffer lengths, so guard for that first — both are hex-encoded
    // SHA-256 (64 chars), but never trust the attacker-supplied `signature`.
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');
    const verified =
      expectedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, providedBuffer);

    if (!verified) {
      return { verified: false };
    }

    // Process webhook event
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    if (!paymentEntity) {
      return { verified: true };
    }

    const razorpayPaymentId = paymentEntity.id;
    const razorpayOrderId = paymentEntity.order_id;
    // Razorpay transmits minor units (paise) — the same unit as Payment.amount
    // and order.total. Keep the value in paise and compare in paise; converting
    // to rupees here would break the A1 integrity check against the stored paise.
    const webhookAmountPaise =
      typeof paymentEntity.amount === 'number' ? paymentEntity.amount : undefined;
    const currency = paymentEntity.currency ?? 'INR';
    const status = paymentEntity.status;

    // Find our payment record
    const payment = await this.prisma.payment.findFirst({
      where: { providerPaymentId: razorpayPaymentId },
      include: { order: true },
    });

    // If not found by payment_id, try by order_id
    let targetPayment = payment;
    if (!targetPayment) {
      targetPayment = await this.prisma.payment.findFirst({
        where: { providerOrderId: razorpayOrderId },
        include: { order: true },
      });
    }

    if (!targetPayment) {
      this.logger.warn(`Payment not found for Razorpay payment_id: ${razorpayPaymentId}`);
      return { verified: true };
    }

    // A1: amount + currency are authoritative from OUR DB record, never from the
    // webhook. A signature-valid webhook whose numbers disagree with the stored
    // total is a billing-integrity event: hard-fail, log it as a security event,
    // and NEVER mutate anything (in particular never mark the order PAID). This
    // runs BEFORE idempotency (A2) — a replayed event is re-verified every time.
    // A missing amount is equally a hard fail: we cannot confirm what the client
    // paid, so we will not act on the event.
    if (typeof webhookAmountPaise !== 'number' || Math.abs(targetPayment.amount - webhookAmountPaise) > 1) {
      this.logger.error(
        `[SECURITY][PAYMENTS] Amount mismatch on payment ${targetPayment.id}: ` +
          `stored ${targetPayment.amount} ${targetPayment.currency}, webhook ${webhookAmountPaise} ${currency}, ` +
          `entity_id=${razorpayPaymentId} — webhook rejected, order NOT paid`,
      );
      return { verified: false, payment: targetPayment, reason: 'AMOUNT_MISMATCH' };
    }

    if (currency !== (targetPayment.currency || 'INR')) {
      this.logger.error(
        `[SECURITY][PAYMENTS] Currency mismatch on payment ${targetPayment.id}: ` +
          `stored ${targetPayment.currency}, webhook ${currency}, ` +
          `entity_id=${razorpayPaymentId} — webhook rejected, order NOT paid`,
      );
      return { verified: false, payment: targetPayment, reason: 'CURRENCY_MISMATCH' };
    }

    // A2: idempotency runs only AFTER the amount/currency re-check above, so the
    // same payment id is never applied twice, but every distinct event against it
    // still re-verifies the money first. Exception: a `refunded` event on an
    // already-verified payment still flows downstream so a refund issued outside
    // our API (Razorpay dashboard) persists a Refund row — the branch is
    // idempotent per providerRefundId.
    if (targetPayment.webhookVerified && status !== 'refunded') {
      return { verified: true, payment: targetPayment };
    }
    const eventStatusAlreadyApplied =
      (status === 'captured' && targetPayment.status === 'CAPTURED') ||
      (status === 'failed' && targetPayment.status === 'FAILED') ||
      (status === 'refunded' &&
        (targetPayment.status === 'REFUNDED' || targetPayment.status === 'PARTIALLY_REFUNDED'));
    if (eventStatusAlreadyApplied) {
      return { verified: true, payment: targetPayment };
    }

    // Statuses we do not act on (authorized, etc.) are accepted as verified but
    // never mutate the order.
    if (status !== 'captured' && status !== 'failed' && status !== 'refunded') {
      return { verified: true, payment: targetPayment };
    }

    // A3: order state-transition guard. A webhook may only advance an order from
    // a legal prior state — never flip CANCELLED/SHIPPED/DELIVERED/REFUNDED/etc.
    // back to PAID, and never mark a paid order FAILED.
    const orderStatus = targetPayment.order?.status;
    const allowedOrderStates =
      status === 'captured'
        ? CAPTURE_ALLOWED_ORDER_STATES
        : status === 'failed'
          ? FAILURE_ALLOWED_ORDER_STATES
          : REFUND_ALLOWED_ORDER_STATES;
    if (!orderStatus || !allowedOrderStates.has(orderStatus)) {
      this.logger.error(
        `[SECURITY][PAYMENTS] Illegal state transition on payment ${targetPayment.id}: ` +
          `order=${orderStatus} + event=${status} (entity_id=${razorpayPaymentId}) ` +
          `— webhook rejected, no state change applied`,
      );
      return { verified: false, payment: targetPayment, reason: 'ILLEGAL_ORDER_STATE' };
    }

    // Update payment and order based on status. capture/failed/refunded all run
    // through the same transaction; `applyCapture` is shared with the client
    // `/verify` path so both confirmations mutate identically.
    await this.prisma.$transaction(async (tx) => {
      if (status === 'captured') {
        await this.applyCapture(tx, targetPayment, razorpayPaymentId, payload);
      } else if (status === 'failed') {
        await tx.payment.update({
          where: { id: targetPayment.id },
          data: {
            status: 'FAILED',
            providerPaymentId: razorpayPaymentId,
            webhookVerified: true,
            webhookPayload: JSON.stringify(payload),
            failedAt: new Date(),
            failureReason: paymentEntity.failure_reason ?? null,
          },
        });

        await tx.order.update({
          where: { id: targetPayment.orderId },
          data: { status: 'FAILED' },
        });

        // Release reserved inventory
        await this.releaseReservedInventory(targetPayment.orderId, tx);
      } else if (status === 'refunded') {
        // Persist the provider's refund as a first-class Refund row so a refund
        // initiated on the Razorpay dashboard still lands in our DB. Idempotent
        // per providerRefundId.
        const refundEntity = payload?.payload?.refund?.entity;
        const refundAmount =
          typeof refundEntity?.amount === 'number' ? refundEntity.amount : undefined;
        if (refundEntity?.id) {
          const existing = await tx.refund.findFirst({
            where: { paymentId: targetPayment.id, providerRefundId: refundEntity.id },
          });
          if (!existing) {
            await tx.refund.create({
              data: {
                paymentId: targetPayment.id,
                providerRefundId: refundEntity.id,
                amount: refundAmount ?? targetPayment.amount,
                reason: refundEntity.notes?.reason ?? null,
                status: refundEntity.status === 'processed' ? 'PROCESSED' : 'PENDING',
                processedAt: refundEntity.status === 'processed' ? new Date() : null,
              },
            });
          }
        }

        // A full refund takes the payment (and order) to REFUNDED; a partial
        // refund marks the payment PARTIALLY_REFUNDED and leaves the order PAID.
        const isFullRefund = refundAmount === undefined || refundAmount >= targetPayment.amount;
        await tx.payment.update({
          where: { id: targetPayment.id },
          data: {
            status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            webhookVerified: true,
            webhookPayload: JSON.stringify(payload),
          },
        });

        if (isFullRefund) {
          await tx.order.update({
            where: { id: targetPayment.orderId },
            data: { status: 'REFUNDED' },
          });
        }
      }
    });

    const updatedPayment = await this.prisma.payment.findUnique({
      where: { id: targetPayment.id },
      include: { order: true },
    });

    return { verified: true, payment: updatedPayment };
  }

  /**
   * Client-initiated verification for the Razorpay Checkout `handler` callback.
   *
   * The signature is the Checkout signature — HMAC-SHA256 of
   * `razorpay_order_id|razorpay_payment_id` with RAZORPAY_KEY_SECRET (NOT the
   * webhook secret). The signature proves Razorpay issued both ids to us for
   * this Checkout session; it says nothing about the money, so the stored
   * Payment row remains the authority and the Razorpay payment entity is the
   * witness (A1): we re-fetch the payment from Razorpay and require its
   * amount/currency to match the order total before marking anything PAID.
   *
   * `/verify` and the `payment.captured` webhook can race — both are idempotent
   * and use the same `applyCapture` so the outcome is identical either way.
   * This endpoint handles ONLY the success path; payment failures are still the
   * webhook's job (`payment.failed` marks the order FAILED and releases stock).
   *
   * @returns the mutated payment; throws ForbiddenException on bad ownership,
   * UnauthorizedException on an invalid signature, BadRequestException on an
   * amount mismatch or illegal order state.
   */
  async verifyClientPayment(
    dto: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
    userId?: string,
    sessionId?: string,
  ) {
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      throw new Error('Razorpay credentials not configured');
    }

    // Constant-time compare (only meaningful at equal length) against the
    // Checkout signature derived from the pair Razorpay handed the client.
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
      .digest('hex');
    const provided = Buffer.from(dto.razorpay_signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (provided.length !== expectedBuffer.length || !crypto.timingSafeEqual(provided, expectedBuffer)) {
      throw new UnauthorizedException('Invalid payment signature');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: dto.razorpay_order_id },
      include: { order: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Ownership is enforced regardless of a valid signature: this order must
    // belong to the JWT user, or the guest who still holds its sessionId.
    this.assertPayableAuth(payment.order, userId, sessionId);

    // A1: the witness. A signature alone — even one Razorpay genuinely issued —
    // does not confirm what was paid. Re-fetch the Razorpay payment and require
    // its amount/currency to match our stored (server-derived) payment row. On
    // any disagreement, the order is NEVER marked PAID.
    let razorpayPayment: any;
    try {
      razorpayPayment = await this.getRazorpay().payments.fetch(dto.razorpay_payment_id);
    } catch {
      throw new BadRequestException('Could not confirm payment with provider');
    }
    const fetchedAmount =
      typeof razorpayPayment.amount === 'number' ? razorpayPayment.amount : undefined;
    if (
      typeof fetchedAmount !== 'number' ||
      Math.abs(payment.amount - fetchedAmount) > 1 ||
      (razorpayPayment.currency ?? 'INR') !== (payment.currency || 'INR')
    ) {
      this.logger.error(
        `[SECURITY][PAYMENTS] Amount/currency mismatch on verify for payment ${payment.id}: ` +
          `stored ${payment.amount} ${payment.currency}, provider ${fetchedAmount} ${razorpayPayment.currency} — order NOT paid`,
      );
      throw new BadRequestException('AMOUNT_MISMATCH');
    }

    // A3: same guard as the webhook — never capture from a terminal order state.
    const orderStatus = payment.order?.status;
    if (!orderStatus || !CAPTURE_ALLOWED_ORDER_STATES.has(orderStatus)) {
      this.logger.error(
        `[SECURITY][PAYMENTS] Illegal state on verify for payment ${payment.id}: ` +
          `order=${orderStatus} — order NOT paid`,
      );
      throw new BadRequestException('ILLEGAL_ORDER_STATE');
    }

    // Idempotent: verify can race the webhook (or retry after a network blip),
    // so an already-verified/captured payment returns its current state.
    if (payment.webhookVerified || payment.status === 'CAPTURED') {
      return this.prisma.payment.findUnique({
        where: { id: payment.id },
        include: { order: true },
      });
    }

    // Apply the SAME capture the webhook applies — state, provider id,
    // webhookVerified, capturedAt, order PAID + paidAt + sessionId cleared.
    await this.prisma.$transaction(async (tx) => {
      await this.applyCapture(tx, payment, dto.razorpay_payment_id, {
        source: 'verify',
        razorpay_order_id: dto.razorpay_order_id,
        razorpay_payment_id: dto.razorpay_payment_id,
      });
    });

    return this.prisma.payment.findUnique({
      where: { id: payment.id },
      include: { order: true },
    });
  }

  async getPaymentById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async getPaymentByOrderId(orderId: string) {
    return this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async refundPayment(paymentId: string, amount?: number, reason?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== 'CAPTURED') {
      throw new ConflictException('Only captured payments can be refunded');
    }

    // Defense in depth: a CAPTURED row should always carry the provider payment
    // id, but refuse to call the provider with `undefined` rather than 500.
    if (!payment.providerPaymentId) {
      throw new ConflictException('Payment has no provider reference');
    }

    // AUREVO money is integer paise everywhere (payment.amount is stored paise),
    // so refundAmount and the client-supplied `amount` are paise too.
    const refundAmount = amount ?? payment.amount;

    if (refundAmount > payment.amount) {
      throw new BadRequestException('Refund amount cannot exceed payment amount');
    }

    // Process refund via Razorpay — Razorpay takes minor units (paise), so pass
    // refundAmount through unchanged. Multiplying by 100 would over-refund 100x.
    const refund = await this.getRazorpay().payments.refund(payment.providerPaymentId, {
      amount: refundAmount,
      notes: { reason: reason ?? 'Customer requested refund' },
    });

    // Persist the refund as a first-class Refund row (spec: no more JSON stash
    // in Payment.webhookPayload). refund.amount is already paise.
    await this.prisma.refund.create({
      data: {
        paymentId,
        providerRefundId: refund.id,
        amount: refund.amount,
        reason: reason ?? null,
        status: refund.status === 'processed' ? 'PROCESSED' : 'PENDING',
        processedAt: refund.status === 'processed' ? new Date() : null,
      },
    });

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: refundAmount === payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      },
    });

    // Update order status only on a full refund; a partial refund leaves the
    // order PAID (the customer keeps the balance).
    if (refundAmount === payment.amount) {
      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'REFUNDED' },
      });
    }

    // refund.amount is already paise — returned as-is to match the app-wide unit.
    return { refundId: refund.id, amount: refund.amount, status: refund.status };
  }

  async getPaymentStats() {
    const [totalPayments, totalRevenue, statusCounts] = await Promise.all([
      this.prisma.payment.count(),
      this.prisma.payment.aggregate({
        where: { status: 'CAPTURED' },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    return {
      totalPayments,
      totalRevenue: totalRevenue._sum.amount ?? 0,
      byStatus: statusCounts.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Shared capture mutation used by both the `payment.captured` webhook and
   * POST /payments/verify. Sets the Payment to CAPTURED, records the
   * providerPaymentId, stamps `webhookVerified` (so a later replay of either
   * path is a no-op), stamps `capturedAt`, marks the Order PAID. Always
   * `JSON.stringify`s the payload so the `String?` column stays a string
   * (Prisma-SQLite may coerce, Postgres will not).
   *
   * The guest `sessionId` is intentionally kept after capture so the guest can
   * prove ownership when reading their order (S3 IDOR fix). Payment replay is
   * already prevented by the status guard in `createRazorpayOrder` (only
   * PENDING/PAYMENT_PENDING orders can open a new Razorpay order) and by the
   * `livePayment` check (no duplicate live payment). Keeping the sessionId also
   * lets the frontend refetch the order on the OrderConfirmation page after
   * payment succeeds.
   *
   * Caller is responsible for the A1 amount/currency check and the A3
   * capture-allowed-state check — this method only mutates.
   */
  private async applyCapture(
    tx: any,
    payment: { id: string; orderId: string },
    razorpayPaymentId: string,
    payload: unknown,
  ): Promise<void> {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CAPTURED',
        providerPaymentId: razorpayPaymentId,
        webhookVerified: true,
        webhookPayload: JSON.stringify(payload),
        capturedAt: new Date(),
      },
    });

    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }

  private async releaseReservedInventory(orderId: string, tx: any) {
    const items = await tx.orderItem.findMany({ where: { orderId } });

    for (const item of items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        include: { variants: { include: { inventory: true } }, inventory: true },
      });

      if (!product) continue;

      const variant = item.variantId
        ? product.variants.find(v => v.id === item.variantId)
        : null;

      const inventory = variant?.inventory ?? product.inventory?.[0];

      if (inventory && inventory.trackQuantity) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { reservedQuantity: { decrement: item.quantity } },
        });
      }
    }
  }
}