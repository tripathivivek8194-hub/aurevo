import { useCallback } from 'react';
import { usePaymentStore } from '../stores/paymentStore';
import { openCheckoutModal } from '../lib/razorpay';

/**
 * React-facing payment flow for checkout: create the Razorpay order, open the
 * modal, and verify the returned signature. Callers pass navigation callbacks —
 * a successful `handler` verifies on the backend first, so `onSuccess` only
 * fires once the order is actually marked PAID server-side.
 */

export interface OpenCheckoutParams {
  orderId: string;
  /** Paise — the create-order response amount is authoritative and echoed back. */
  amount: number;
  currency: string;
  orderNumber: string;
  sessionId?: string;
  name?: string;
  email?: string;
  phone?: string;
  /** Called after POST /payments/verify succeeds (order is PAID). */
  onSuccess?: () => void;
  /** Called when the customer dismisses the modal, a payment fails, or verify fails. */
  onCancel?: () => void;
}

export function useRazorpay() {
  const status = usePaymentStore((s) => s.status);
  const error = usePaymentStore((s) => s.error);
  const createOrder = usePaymentStore((s) => s.createOrder);
  const verify = usePaymentStore((s) => s.verify);
  const reset = usePaymentStore((s) => s.reset);

  /**
   * Creates the Razorpay order and opens the checkout modal. Never throws for a
   * customer dismissal or a failed payment — those call `onCancel`. It only
   * rejects when the create-order call or the script load itself fails (the
   * modal never opened), which callers treat as a "retry on confirmation".
   */
  const openCheckout = useCallback(
    async (p: OpenCheckoutParams) => {
      reset();

      // Backend derives amount/currency from the order row — the client never
      // sends money, and the returned `amount` is what the modal shows.
      const order = await createOrder(p.orderId, p.sessionId);

      const instance = await openCheckoutModal({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.razorpayOrderId,
        name: 'AUREVO',
        description: `Order ${p.orderNumber}`,
        prefill: {
          name: p.name,
          email: p.email,
          contact: p.phone,
        },
        handler: async (response) => {
          try {
            await verify(response);
            p.onSuccess?.();
          } catch {
            // Server did not confirm the payment — surface the retry state.
            p.onCancel?.();
          }
        },
        modal: { ondismiss: () => p.onCancel?.() },
      });

      instance.on('payment.failed', () => p.onCancel?.());

      return instance;
    },
    [createOrder, verify, reset],
  );

  return { status, error, openCheckout, reset };
}