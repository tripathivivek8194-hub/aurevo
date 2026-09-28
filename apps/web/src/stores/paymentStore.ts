import { create } from 'zustand';
import { api } from '../lib/api';

/**
 * Payment lifecycle state for the checkout flow (create-order → modal → verify).
 *
 * The store only performs read/write of payment state via the API; it never
 * holds an amount — the backend derives the amount from the order row (A5), and
 * `/verify` cross-checks it against Razorpay (A1), so the client cannot tamper.
 */

/** Response of POST /payments/create-order. keyId is the public RAZORPAY_KEY_ID. */
export interface CreateOrderResult {
  razorpayOrderId: string;
  /** Paise — the app-wide minor unit. Never multiplied by 100 on the client. */
  amount: number;
  currency: string;
  keyId: string;
  paymentId: string;
}

/** Body of POST /payments/verify — mirrors the backend VerifyPaymentDto. */
export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export type PaymentStatus =
  | 'idle'
  | 'creating' // POST /payments/create-order in flight
  | 'ready' // modal can be opened
  | 'verifying' // POST /payments/verify in flight
  | 'succeeded'
  | 'failed';

interface PaymentState {
  status: PaymentStatus;
  error: string | null;
  /** Order + (guest) session the payment belongs to; kept so a later verify
   *  uses the same session that created the payment attempt. */
  orderId: string | null;
  sessionId: string | null;

  /** POST /payments/create-order → Razorpay order id + public key. */
  createOrder: (orderId: string, sessionId?: string) => Promise<CreateOrderResult>;
  /** POST /payments/verify with the Checkout handler's response. */
  verify: (payload: VerifyPaymentPayload) => Promise<void>;
  reset: () => void;
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  status: 'idle',
  error: null,
  orderId: null,
  sessionId: null,

  async createOrder(orderId, sessionId) {
    set({ status: 'creating', error: null, orderId, sessionId: sessionId ?? null });
    try {
      const res = await api.post<CreateOrderResult>(
        '/payments/create-order',
        { orderId },
        { params: sessionId ? { sessionId } : {} },
      );
      set({ status: 'ready' });
      return res.data;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not create payment';
      set({ status: 'failed', error: message });
      throw e;
    }
  },

  async verify(payload) {
    set({ status: 'verifying', error: null });
    try {
      await api.post('/payments/verify', payload, {
        params: get().sessionId ? { sessionId: get().sessionId } : {},
      });
      set({ status: 'succeeded' });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Payment could not be verified';
      set({ status: 'failed', error: message });
      throw e;
    }
  },

  reset() {
    set({ status: 'idle', error: null, orderId: null, sessionId: null });
  },
}));