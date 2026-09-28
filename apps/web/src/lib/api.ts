import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

/**
 * AUREVO admin API client.
 *
 * The backend wraps every response in `{ success, data, meta }` (global
 * TransformInterceptor). This client unwraps that envelope so callers receive
 * the `data` payload directly. The HttpOnly refresh cookie is sent
 * automatically (`withCredentials`) and, on a 401, we attempt a single silent
 * refresh before surfacing the error. The access token is kept in memory and
 * injected as `Authorization: Bearer <token>` on every request.
 */

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { timestamp: string; path: string } & Record<string, unknown>;
}

/** Minimal user shape returned by /auth/me and /auth/login. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Normalized error thrown to callers so pages can show `error.message`. */
export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let accessToken: string | null = null;
/** Single-flight refresh so concurrent 401s trigger one refresh, not many. */
let refreshPromise: Promise<string | null> | null = null;
/** Optional callback invoked when a refresh fails (lets the auth store reset). */
let onAuthFailure: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setOnAuthFailure(handler: (() => void) | null): void {
  onAuthFailure = handler;
}

// Local Docker serves the API under `/api`. The hosted storefront uses the
// explicitly configured public API instead, so the same source works in both
// places without changing the locally running website or its domain.
const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export const api: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/** Unwrap the `{ success, data, meta }` envelope → returns `data` payload. */
api.interceptors.response.use((response) => {
  const envelope = response.data as ApiEnvelope<unknown>;
  response.data = envelope?.data ?? response.data;
  return response;
});

/** Refresh the access token using the HttpOnly cookie (returns new token or null). */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<{ accessToken: string }>('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = (error.config ?? {}) as RetryableConfig;
  const status = error.response?.status;
  const path = original.url ?? '';

  // Do not auto-refresh for the refresh endpoint itself or on repeat attempts.
  if (status === 401 && !path.startsWith('/auth/refresh') && !original._retry) {
    original._retry = true;
    const newToken = await refreshAccessToken();
    if (newToken) {
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    }
    onAuthFailure?.();
    setAccessToken(null);
  }

  const body = error.response?.data as
    | { error?: { message?: string | string[] }; message?: string | string[] }
    | undefined;
  // The backend envelopes errors as `{ success:false, error:{ message } }`
  // (AllExceptionsFilter). Falls back to a top-level `message` or the axios
  // message so the real reason (e.g. "Invalid credentials") reaches the UI.
  const backendMessage = body?.error?.message ?? body?.message;
  const raw = Array.isArray(backendMessage) ? backendMessage[0] : backendMessage;
  const message = raw || error.message || 'Request failed';
  throw new ApiError(message, error.response?.status);
});
