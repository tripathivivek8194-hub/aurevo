/**
 * Unit tests for the 30% minimum profit margin helpers.
 * Pure functions, no DB, no framework. Uses Jest.
 */
import {
  computeMinSellPrice,
  validateMargin,
  marginTone,
  MIN_MARGIN_PCT,
  MIN_MARGIN_RATIO,
  MARGIN_WARNING_PCT,
  MARGIN_GOOD_PCT,
} from './pricing';

// ---------------------------------------------------------------------------
// computeMinSellPrice
// ---------------------------------------------------------------------------
describe('computeMinSellPrice', () => {
  it('is exported and equals 30', () => {
    expect(MIN_MARGIN_PCT).toBe(30);
    expect(MIN_MARGIN_RATIO).toBeCloseTo(0.30);
  });

  it('returns Math.ceil(cost / 0.70) for the default 30% margin', () => {
    // 70 000 / 0.70 = 100 000 exactly → ceil(100 000) = 100 000
    expect(computeMinSellPrice(70_000)).toBe(100_000);

    // 100 / 0.70 = 142.857... → ceil = 143
    expect(computeMinSellPrice(100)).toBe(143);

    // 1 / 0.70 = 1.428... → ceil = 2
    expect(computeMinSellPrice(1)).toBe(2);
  });

  it('uses an optional custom marginPct', () => {
    // 50% margin → floor = ceil(100 / 0.50) = 200
    expect(computeMinSellPrice(100, 50)).toBe(200);

    // 99% margin → floor = ceil(100 / 0.01) = 10_000
    expect(computeMinSellPrice(100, 99)).toBe(10_000);
  });

  it('returns null for zero / negative cost', () => {
    expect(computeMinSellPrice(0)).toBeNull();
    expect(computeMinSellPrice(-100)).toBeNull();
  });

  it('returns null for non-finite cost (NaN, Infinity)', () => {
    expect(computeMinSellPrice(NaN)).toBeNull();
    expect(computeMinSellPrice(Infinity)).toBeNull();
    expect(computeMinSellPrice(-Infinity)).toBeNull();
  });

  it('returns null when marginPct is out of valid range (0–100 exclusive)', () => {
    expect(computeMinSellPrice(100, 0)).toBeNull();
    expect(computeMinSellPrice(100, -10)).toBeNull();
    expect(computeMinSellPrice(100, 100)).toBeNull();
    expect(computeMinSellPrice(100, 150)).toBeNull();
  });

  it('handles very large costs without overflow', () => {
    const huge = 1e12;
    expect(computeMinSellPrice(huge)).toBe(Math.ceil(huge / 0.7));
    expect(Number.isFinite(computeMinSellPrice(huge)!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateMargin
// ---------------------------------------------------------------------------
describe('validateMargin', () => {
  const FLOOR_70K = Math.ceil(70_000 / 0.7); // 100 000

  it('passes when sellPrice meets the exact floor', () => {
    const v = validateMargin(70_000, FLOOR_70K);
    expect(v.passes).toBe(true);
    expect(v.minSellPrice).toBe(FLOOR_70K);
    expect(v.marginPct).toBeGreaterThanOrEqual(30);
  });

  it('passes when sellPrice exceeds the floor', () => {
    const v = validateMargin(70_000, FLOOR_70K + 1_000);
    expect(v.passes).toBe(true);
    expect(v.marginPct).toBeGreaterThan(30);
  });

  it('fails when sellPrice is one unit below the floor', () => {
    const v = validateMargin(70_000, FLOOR_70K - 1);
    expect(v.passes).toBe(false);
    expect(v.minSellPrice).toBe(FLOOR_70K);
    // Raw margin is 29.999…%, which rounds to 30.00 at 2 dp — so assert the
    // rounded value never reports ABOVE the floor (the `passes` flag is the
    // real gate; marginPct is display-precision).
    expect(v.marginPct).toBeLessThanOrEqual(30);
  });

  it('fails when sellPrice is much lower than the floor', () => {
    const v = validateMargin(70_000, 75_000); // margin-on-sale = 5000/75000 = 6.67%
    expect(v.passes).toBe(false);
    expect(v.marginPct).toBeCloseTo(6.67, 2);
  });

  it('returns passes: false with zero fields for missing cost', () => {
    const v = validateMargin(0, 100_000);
    expect(v.passes).toBe(false);
    expect(v.marginPct).toBe(0);
    expect(v.minSellPrice).toBe(0);
  });

  it('returns passes: false for negative or zero sellPrice', () => {
    expect(validateMargin(70_000, 0).passes).toBe(false);
    expect(validateMargin(70_000, -1).passes).toBe(false);
  });

  it('returns passes: false for NaN sellPrice', () => {
    expect(validateMargin(70_000, NaN).passes).toBe(false);
  });

  it('custom marginPct changes the floor accordingly', () => {
    const v = validateMargin(100, 143, 30);
    expect(v.passes).toBe(true);
    expect(v.marginPct).toBeGreaterThanOrEqual(30);

    const v2 = validateMargin(100, 143, 50); // floor for 50% is 200
    expect(v2.passes).toBe(false);
    expect(v2.minSellPrice).toBe(200);
  });

  it('never returns NaN or Infinity', () => {
    const v = validateMargin(Infinity, Infinity);
    expect(Number.isFinite(v.marginPct)).toBe(true);
    expect(Number.isFinite(v.minSellPrice)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// marginTone (client colour band)
// ---------------------------------------------------------------------------
describe('marginTone', () => {
  it('exposes the band boundaries', () => {
    expect(MARGIN_WARNING_PCT).toBe(30);
    expect(MARGIN_GOOD_PCT).toBe(35);
  });

  it('returns unknown for missing / non-finite margin', () => {
    expect(marginTone(null)).toBe('unknown');
    expect(marginTone(undefined)).toBe('unknown');
    expect(marginTone(NaN)).toBe('unknown');
    expect(marginTone(Infinity)).toBe('unknown');
  });

  it('marks <30 as critical (red)', () => {
    expect(marginTone(0)).toBe('critical');
    expect(marginTone(29.9)).toBe('critical');
    expect(marginTone(MARGIN_WARNING_PCT - 0.01)).toBe('critical');
  });

  it('marks 30–35 as warning (amber), inclusive of 30', () => {
    expect(marginTone(MARGIN_WARNING_PCT)).toBe('warning'); // exactly the floor
    expect(marginTone(32)).toBe('warning');
    expect(marginTone(MARGIN_GOOD_PCT - 0.01)).toBe('warning');
  });

  it('marks >=35 as good (green)', () => {
    expect(marginTone(MARGIN_GOOD_PCT)).toBe('good');
    expect(marginTone(46.1)).toBe('good');
    expect(marginTone(99)).toBe('good');
  });
});
