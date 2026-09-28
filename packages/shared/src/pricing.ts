/**
 * AUREVO 30% minimum profit margin helpers
 *
 * Margin-on-sale convention (NOT markup-on-cost):
 *   margin = (sellPrice - cost) / sellPrice
 *   sellPrice = cost / (1 - margin/100)
 *
 * Every price (cost / sellPrice) is in minor units (paise for INR).
 * All functions are pure — no I/O, no DB, no framework dependency.
 */

/** Minimum margin percentage enforced repo-wide. */
export const MIN_MARGIN_PCT = 30 as const;

/** Ratio form: 0.30. */
export const MIN_MARGIN_RATIO = 0.3 as const;

// ---------------------------------------------------------------------------
// Core helpers required by the spec
// ---------------------------------------------------------------------------

/**
 * Compute the minimum sell price (floor) for a given cost and target margin.
 *
 *   floor = cost / (1 - marginPct/100), rounded UP to the next integer minor
 *   unit so the resulting margin is always >= marginPct.
 *
 * Returns `null` when cost is zero, negative, or non-finite — i.e. "no cost
 * data", in which case the product cannot be sold. Never returns NaN/±Infinity.
 */
export function computeMinSellPrice(
  cost: number,
  marginPct: number = MIN_MARGIN_PCT,
): number | null {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  const ratio = marginPct / 100;
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return null;
  return Math.ceil(cost / (1 - ratio));
}

export interface MarginValidation {
  /** Actual margin percentage (0–100), 2 decimals. */
  marginPct: number;
  /** Floor price for the given cost — below this the margin is < marginPct. */
  minSellPrice: number;
  /** True when sellPrice >= minSellPrice (margin meets the minimum). */
  passes: boolean;
}

/**
 * Validate a sell price against the cost floor.
 *
 *   marginPct = (sellPrice - cost) / sellPrice * 100
 *
 * `passes` is false when cost or sellPrice are missing/zero/negative, or when
 * sellPrice is below the computed 30% floor. Never throws.
 */
export function validateMargin(
  cost: number,
  sellPrice: number,
  marginPct: number = MIN_MARGIN_PCT,
): MarginValidation {
  const floor = computeMinSellPrice(cost, marginPct);
  if (
    floor === null ||
    !Number.isFinite(sellPrice) ||
    sellPrice <= 0
  ) {
    return { marginPct: 0, minSellPrice: 0, passes: false };
  }
  const margin = (sellPrice - cost) / sellPrice;
  const pct = Math.round(margin * 10000) / 100;
  return {
    marginPct: Math.max(0, pct),
    minSellPrice: floor,
    passes: sellPrice >= floor,
  };
}

// ---------------------------------------------------------------------------
// Margin health band (shared so the UI never hand-rolls thresholds)
// ---------------------------------------------------------------------------

/** Sell price yielding 30–35% margin — above the floor, but trim. */
export const MARGIN_WARNING_PCT = MIN_MARGIN_PCT; // 30
/** Sell price yielding >=35% margin — healthy buffer over the floor. */
export const MARGIN_GOOD_PCT = 35 as const;

export type MarginTone = 'critical' | 'warning' | 'good' | 'unknown';

/**
 * Classify a margin percentage into a health band for UI colouring:
 *   unknown   – no cost data / non-finite input     (neutral)
 *   critical  – margin < 30% (below the floor)      (red)
 *   warning   – 30% <= margin < 35%                 (amber)
 *   good      – margin >= 35%                       (green)
 *
 * Pure. Never throws.
 */
export function marginTone(marginPct: number | null | undefined): MarginTone {
  if (marginPct === null || marginPct === undefined || !Number.isFinite(marginPct)) {
    return 'unknown';
  }
  if (marginPct >= MARGIN_GOOD_PCT) return 'good';
  if (marginPct >= MARGIN_WARNING_PCT) return 'warning';
  return 'critical';
}