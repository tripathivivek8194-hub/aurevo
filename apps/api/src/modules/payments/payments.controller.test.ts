import 'reflect-metadata';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';

/**
 * Security regression tests for the payments controller.
 *  - `create-order` ownership lives in PaymentsService.createOrderPayment; the
 *    controller must not bypass it (this suite pins the delegation contract).
 *  - A signature-valid webhook that fails billing integrity (amount/currency
 *    mismatch, illegal order-state transition) surfaces as HTTP 400 with the
 *    service's `verified:false` result — never a silent mark-PAID.
 * Dependencies are mocked.
 */
describe('PaymentsController — ownership enforcement & webhook rejection', () => {
  function build() {
    const paymentsService: any = {
      prisma: { order: { findUnique: jest.fn() } },
      createOrderPayment: jest.fn(),
      createRazorpayOrder: jest.fn(),
      verifyPaymentWebhook: jest.fn(),
      getPaymentById: jest.fn(),
      getPaymentByOrderId: jest.fn(),
      refundPayment: jest.fn(),
      getPaymentStats: jest.fn(),
    };
    const controller = new PaymentsController(paymentsService);
    return { controller, paymentsService };
  }

  describe('createOrder', () => {
    it('delegates order-scoped gating to createOrderPayment (403 on another user\'s order)', async () => {
      const { controller, paymentsService } = build();
      paymentsService.createOrderPayment.mockRejectedValue(new ForbiddenException('Not authorized'));

      await expect(
        controller.createOrder('user-a', undefined, { orderId: 'ord1' }),
      ).rejects.toThrow(ForbiddenException);
      expect(paymentsService.createOrderPayment).toHaveBeenCalledWith('ord1', 'user-a', undefined);
    });

    it('surfaces NotFound from the service when the order does not exist', async () => {
      const { controller, paymentsService } = build();
      paymentsService.createOrderPayment.mockRejectedValue(new NotFoundException('Order not found'));

      await expect(
        controller.createOrder('user-a', undefined, { orderId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the order owner to open a payment', async () => {
      const { controller, paymentsService } = build();
      paymentsService.createOrderPayment.mockResolvedValue({ razorpayOrderId: 'rzp_1' });

      const result = await controller.createOrder('user-a', undefined, { orderId: 'ord1' });
      expect(paymentsService.createOrderPayment).toHaveBeenCalledWith('ord1', 'user-a', undefined);
      expect(result.razorpayOrderId).toBe('rzp_1');
    });
  });

  describe('webhook', () => {
    function req(raw = '{}') {
      return { rawBody: Buffer.from(raw), body: {} } as any;
    }

    it('rejects an amount/currency-mismatched webhook with HTTP 400 (order never paid)', async () => {
      const { controller, paymentsService } = build();
      paymentsService.verifyPaymentWebhook.mockResolvedValue({
        verified: false, reason: 'AMOUNT_MISMATCH',
      });

      await expect(
        controller.webhook(req('{"event":"payment.captured"}'), 'sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an illegal order-state transition with HTTP 400', async () => {
      const { controller, paymentsService } = build();
      paymentsService.verifyPaymentWebhook.mockResolvedValue({
        verified: false, reason: 'ILLEGAL_ORDER_STATE',
      });

      await expect(
        controller.webhook(req('{"event":"payment.captured"}'), 'sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('passes through a verified webhook unchanged', async () => {
      const { controller, paymentsService } = build();
      paymentsService.verifyPaymentWebhook.mockResolvedValue({
        verified: true, payment: { id: 'p1' },
      });

      const result = await controller.webhook(req('{"ok":true}'), 'sig');
      expect(result.verified).toBe(true);
    });
  });

  describe('getPaymentById', () => {
    it('rejects reading another user\'s payment (403, not 500)', async () => {
      const { controller, paymentsService } = build();
      paymentsService.getPaymentById.mockResolvedValue({
        id: 'pay1', order: { userId: 'user-b' },
      });

      await expect(controller.getPaymentById('pay1', 'user-a')).rejects.toThrow(ForbiddenException);
    });

    it('allows the owner to read their payment', async () => {
      const { controller, paymentsService } = build();
      paymentsService.getPaymentById.mockResolvedValue({
        id: 'pay1', order: { userId: 'user-a' },
      });

      const result = await controller.getPaymentById('pay1', 'user-a');
      expect(result.id).toBe('pay1');
    });
  });

  describe('getPaymentByOrderId', () => {
    it('rejects reading a payment via another user\'s order (403, not 500)', async () => {
      const { controller, paymentsService } = build();
      paymentsService.prisma.order.findUnique.mockResolvedValue({
        id: 'ord1', userId: 'user-b',
      });

      await expect(controller.getPaymentByOrderId('ord1', 'user-a')).rejects.toThrow(ForbiddenException);
      expect(paymentsService.getPaymentByOrderId).not.toHaveBeenCalled();
    });

    it('allows the owner to read a payment via their order', async () => {
      const { controller, paymentsService } = build();
      paymentsService.prisma.order.findUnique.mockResolvedValue({
        id: 'ord1', userId: 'user-a',
      });
      paymentsService.getPaymentByOrderId.mockResolvedValue({ id: 'pay1' });

      const result = await controller.getPaymentByOrderId('ord1', 'user-a');
      expect(result.id).toBe('pay1');
    });
  });
});