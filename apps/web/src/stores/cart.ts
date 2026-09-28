import { create } from 'zustand';
import { api } from '../lib/api';
import { getSessionId } from '../lib/session';
import { useAuthStore } from './auth';

interface CartSummary {
  itemCount: number;
  subtotal: number;
  distinctItems?: number;
}

interface CartState {
  /** Number of line items in the cart (for the header badge). */
  count: number;
  subtotal: number;
  loading: boolean;
  /** Silent merge of a guest (session) cart into the user cart after login. */
  refresh: () => Promise<void>;
  addItem: (productId: string, quantity: number, variantId?: string) => Promise<void>;
  mergeSessionIntoUser: () => Promise<void>;
  clear: () => void;
}

export const useCartStore = create<CartState>((set, get) => {
  /** Returns the sessionId query param for guests, or {} when logged in. */
  function sessionParam(): { sessionId?: string } {
    const authed = useAuthStore.getState().status === 'authenticated';
    return authed ? {} : { sessionId: getSessionId() };
  }

  async function refresh(): Promise<void> {
    try {
      const res = await api.get<CartSummary>('/cart/summary', { params: sessionParam() });
      set({ count: res.data.itemCount ?? 0, subtotal: res.data.subtotal ?? 0, loading: false });
    } catch {
      // Non-fatal — header badge just stays at its previous value.
      set({ loading: false });
    }
  }

  return {
    count: 0,
    subtotal: 0,
    loading: false,

    refresh,

    async addItem(productId, quantity, variantId) {
      set({ loading: true });
      try {
        await api.post('/cart', { productId, variantId, quantity }, { params: sessionParam() });
        await refresh();
      } finally {
        set({ loading: false });
      }
    },

    async mergeSessionIntoUser() {
      // Only meaningful once logged in; clears the guest id ONLY on success.
      if (useAuthStore.getState().status !== 'authenticated') return;
      const sessionId = localStorage.getItem('aurevo_session_id');
      if (!sessionId) return;
      try {
        await api.post('/cart/merge', { sessionId });
        // Only clear the sessionId AFTER successful merge — if merge fails,
        // the guest cart still exists and we can retry on next page load.
        localStorage.removeItem('aurevo_session_id');
      } catch {
        // Merge is best-effort; non-fatal. Keep sessionId so we can retry.
      }
      await refresh();
    },

    clear() {
      set({ count: 0, subtotal: 0 });
    },
  };
});

/** Trigger a one-time guest→user cart merge in a router guard / layout mount. */
export async function mergeGuestCartAfterLogin(): Promise<void> {
  await useCartStore.getState().mergeSessionIntoUser();
}