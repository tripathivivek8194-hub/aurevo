// Framework-agnostic utility functions shared across apps and packages

/**
 * Generate a slug from a string
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Format price in smallest currency unit to display string
 */
export function formatPrice(amount: number, currency: string = 'INR', locale: string = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'INR' ? 0 : 2,
    maximumFractionDigits: currency === 'INR' ? 0 : 2,
  }).format(amount / 100);
}

/**
 * Format price without currency symbol
 */
export function formatPricePlain(amount: number, currency: string = 'INR', locale: string = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: currency === 'INR' ? 0 : 2,
    maximumFractionDigits: currency === 'INR' ? 0 : 2,
  }).format(amount / 100);
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length).trim() + '...';
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate unique ID
 */
export function generateId(prefix: string = ''): string {
  return `${prefix}${Math.random().toString(36).substring(2, 15)}${Date.now().toString(36)}`;
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * CSPRNG index into [0, max): draws from Web Crypto (`crypto.getRandomValues`,
 * available in every modern browser AND Node 19+ / Node 18 webcrypto), using
 * rejection sampling so the result is perfectly uniform with no modulo bias.
 *
 * C4: order numbers were generated with Math.random() — predictable, so an
 * attacker could enumerate or forge order references. They are now drawn from a
 * cryptographically secure source. Math.random ONLY as a loud, documented last
 * resort on runtimes with no Web Crypto (never expected in production).
 */
function secureRandomIndex(max: number): number {
  const cryptoObj = (
    globalThis as unknown as {
      crypto?: { getRandomValues?: <T extends ArrayBufferView>(array: T) => T };
    }
  ).crypto;

  if (typeof cryptoObj?.getRandomValues === 'function') {
    const byte = new Uint8Array(1);
    const limit = Math.floor(256 / max) * max;
    let value = 0;
    do {
      cryptoObj.getRandomValues(byte);
      value = byte[0];
    } while (value >= limit);
    return value % max;
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[aurevo] Web Crypto unavailable — falling back to Math.random for order ' +
      'numbers. This is NOT cryptographically secure and should never happen.',
  );
  return Math.floor(Math.random() * max);
}

/**
 * Generate order number
 */
export function generateOrderNumber(prefix: string = 'AUR', length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(secureRandomIndex(chars.length));
  }
  return `${prefix}${result}`;
}