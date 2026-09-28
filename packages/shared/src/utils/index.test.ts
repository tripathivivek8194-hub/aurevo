import {
  slugify,
  formatPrice,
  formatPricePlain,
  truncate,
  generateId,
  sleep,
  generateOrderNumber,
} from './index';

describe('utils', () => {
  describe('slugify', () => {
    it('lowercases and trims', () => {
      expect(slugify('  Hello World  ')).toBe('hello-world');
    });

    it('strips non-word characters and collapses separators', () => {
      expect(slugify('Men’s 100% Cotton — Tee!')).toBe('mens-100-cotton-tee');
    });

    it('removes leading/trailing hyphens', () => {
      expect(slugify('-foo-')).toBe('foo');
    });
  });

  describe('formatPrice', () => {
    it('formats INR paise to rupees with 0 decimals', () => {
      expect(formatPrice(29900, 'INR', 'en-IN')).toBe('₹299');
    });

    it('formats USD cents with 2 decimals', () => {
      expect(formatPrice(1234, 'USD', 'en-US')).toBe('$12.34');
    });
  });

  describe('formatPricePlain', () => {
    it('omits the currency symbol', () => {
      expect(formatPricePlain(1234, 'USD', 'en-US')).toBe('12.34');
    });
  });

  describe('truncate', () => {
    it('truncates long strings with ellipsis', () => {
      expect(truncate('abcdefghij', 5)).toBe('abcde...');
    });

    it('returns short strings unchanged', () => {
      expect(truncate('abc', 5)).toBe('abc');
    });
  });

  describe('generateId', () => {
    it('returns unique values across calls', () => {
      expect(generateId()).not.toBe(generateId());
    });

    it('respects a prefix', () => {
      expect(generateId('cart-').startsWith('cart-')).toBe(true);
    });
  });

  describe('generateOrderNumber', () => {
    it('uses the prefix and requested length', () => {
      const n = generateOrderNumber('AUR', 10);
      expect(n.startsWith('AUR')).toBe(true);
      expect(n).toHaveLength(13);
      expect(n).toMatch(/^AUR[A-Z0-9]{10}$/);
    });

    it('produces unique order numbers', () => {
      expect(generateOrderNumber()).not.toBe(generateOrderNumber());
    });

    it('draws its characters from a CSPRNG source, not Math.random (C4)', () => {
      const cryptoObj = (
        globalThis as unknown as { crypto?: { getRandomValues: (...args: unknown[]) => unknown } }
      ).crypto;
      // A runtime without Web Crypto falls back (with a warning) — nothing to
      // assert there; every supported browser & Node 19+ has it.
      if (!cryptoObj?.getRandomValues) return;

      const spy = jest.spyOn(cryptoObj, 'getRandomValues');
      try {
        generateOrderNumber('AUR', 10);
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('sleep', () => {
    it('resolves after at least the given delay', async () => {
      // Use a delay comfortably above timer resolution so the integer-ms
      // Date.now() measurement never under-reads.
      const start = Date.now();
      await sleep(20);
      expect(Date.now() - start).toBeGreaterThanOrEqual(20);
    });
  });
});