import { create } from 'zustand';
import { UserRole } from '@aurevo/shared';
import { api, AuthUser, setAccessToken, setOnAuthFailure } from '../lib/api';

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  /** 'unknown' while the boot-time refresh/me check is running. */
  status: 'unknown' | 'authenticated' | 'unauthenticated';
  initialized: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
loginWithGoogle: (idToken: string) => Promise<AuthUser>;
logout: () => Promise<void>;
  initialize: () => Promise<void>;
  /** Merge a PATCH /users/me response into the in-memory session. */
  updateUser: (partial: Partial<AuthUser>) => void;
}

// If a background 401 refresh fails, drop the session so the router guard can
// redirect. Backend remains the real security boundary — this is UX state only.
setOnAuthFailure(() => {
  setAccessToken(null);
  useAuthStore.setState({ user: null, accessToken: null, status: 'unauthenticated' });
});

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  status: 'unknown',
  initialized: false,

  async login(email, password) {
    const res = await api.post<LoginResponse>('/auth/login', { email, password });
    setAccessToken(res.data.accessToken);
    set({ user: res.data.user, accessToken: res.data.accessToken, status: 'authenticated' });
    return res.data.user;
  },

async loginWithGoogle(idToken) {
  const res = await api.post<LoginResponse>('/auth/google', {
    idToken,
  });

  setAccessToken(res.data.accessToken);

  set({
    user: res.data.user,
    accessToken: res.data.accessToken,
    status: 'authenticated',
  });

  return res.data.user;
},
  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the server call fails, clear local session below.
    }
    setAccessToken(null);
    set({ user: null, accessToken: null, status: 'unauthenticated' });
  },

  async initialize() {
  if (get().initialized) return;
  try {
    const res = await api.post<LoginResponse>('/auth/refresh');
    setAccessToken(res.data.accessToken);
    set({ user: res.data.user, accessToken: res.data.accessToken, status: 'authenticated' });
} catch {
      set({ user: null, accessToken: null, status: 'unauthenticated' });
    } finally {
      set({ initialized: true });
    }
  },

  updateUser(partial) {
    const current = get().user;
    if (!current) return;
    set({ user: { ...current, ...partial } });
  },
}));

/** UX/navigation convenience: is the current session an admin? */
export function isAdmin(role?: string | null): boolean {
  return role === UserRole.ADMIN;
}
