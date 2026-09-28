export type StoreEvent = 'SESSION' | 'PRODUCT_VIEW' | 'ADD_TO_CART' | 'CHECKOUT_STARTED';

type TrafficSource = 'DIRECT' | 'ORGANIC_SEARCH' | 'SOCIAL' | 'REFERRAL' | 'CAMPAIGN';

const VISITOR_KEY = 'aurevo_analytics_visitor_id';
const SESSION_AT_KEY = 'aurevo_analytics_session_at';
const SESSION_WINDOW_MS = 30 * 60 * 1000;

function visitorId(): string | null {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function trafficSource(): TrafficSource {
  const params = new URLSearchParams(window.location.search);
  if (params.has('utm_source') || params.has('utm_campaign')) return 'CAMPAIGN';
  try {
    if (!document.referrer) return 'DIRECT';
    const host = new URL(document.referrer).hostname.toLowerCase();
    if (host === window.location.hostname.toLowerCase()) return 'DIRECT';
    if (/google\.|bing\.|duckduckgo\.|yahoo\.|ecosia\./.test(host)) return 'ORGANIC_SEARCH';
    if (/instagram\.|facebook\.|tiktok\.|youtube\.|x\.com$|twitter\.|pinterest\./.test(host)) return 'SOCIAL';
    return 'REFERRAL';
  } catch {
    return 'DIRECT';
  }
}

export function trackStoreEvent(
  event: StoreEvent,
  details: { productId?: string; path?: string; dedupeKey?: string } = {},
) {
  const id = visitorId();
  if (!id) return;

  if (details.dedupeKey) {
    const key = `aurevo_analytics_${details.dedupeKey}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Tracking remains best effort when storage is unavailable.
    }
  }

  void fetch('/api/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({
      visitorId: id,
      event,
      ...(event === 'SESSION' ? { source: trafficSource() } : {}),
      path: (details.path ?? window.location.pathname).slice(0, 240),
      ...(details.productId ? { productId: details.productId } : {}),
    }),
  }).catch(() => undefined);
}

export function trackStoreSession() {
  try {
    const lastSessionAt = Number(localStorage.getItem(SESSION_AT_KEY) ?? 0);
    if (Date.now() - lastSessionAt < SESSION_WINDOW_MS) return;
    localStorage.setItem(SESSION_AT_KEY, String(Date.now()));
  } catch {
    // A session can still be counted when timestamp storage is unavailable.
  }
  trackStoreEvent('SESSION');
}
