/**
 * Razorpay Checkout (checkout.js) loader + minimal local types.
 *
 * The checkout script is loaded from Razorpay's CDN once and cached. The modal
 * `key` is the public `RAZORPAY_KEY_ID` returned by POST /payments/create-order
 * (never the secret, which stays server-side). This module deliberately ships
 * NO credentials — the secret is a backend-only env var.
 */

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayPrefill {
  name?: string;
  email?: string;
  contact?: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  /** Minor units (paise) — matches the app-wide money unit. */
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: RazorpayPrefill;
  notes?: Record<string, string>;
  theme?: { color?: string };
  /** Called with the payment response once the customer completes payment. */
  handler?: (response: RazorpayPaymentResponse) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayPaymentFailedResponse {
  error?: { code?: string; reason?: string; source?: string };
}

export interface RazorpayInstance {
  open: () => void;
  close: () => void;
  on: (
    event: 'payment.failed',
    handler: (response?: RazorpayPaymentFailedResponse) => void,
  ) => void;
}

export type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptPromise: Promise<RazorpayConstructor> | null = null;

/** The public key id, exposed for debugging / UI hints only. Empty until set. */
export function razorpayKeyId(): string {
  return import.meta.env.VITE_RAZORPAY_KEY_ID ?? '';
}

/**
 * Resolves to the global `Razorpay` constructor, loading checkout.js on first
 * use and caching both the script element and the promise. A failed load resets
 * the cache so a `loadRazorpay()` retry can work.
 */
export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        if (window.Razorpay) resolve(window.Razorpay);
        else reject(new Error('Razorpay script loaded but the global is missing'));
      };
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Failed to load the Razorpay checkout script'));
      };
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

/**
 * Loads the script (if needed) and opens a checkout modal. Returns the instance
 * so callers can attach a `payment.failed` listener; resolves after `open()`,
 * not after the customer closes the modal (that is driven by `handler`).
 */
export async function openCheckoutModal(
  options: RazorpayCheckoutOptions,
): Promise<RazorpayInstance> {
  const Razorpay = await loadRazorpay();
  const instance = new Razorpay(options);
  instance.open();
  return instance;
}