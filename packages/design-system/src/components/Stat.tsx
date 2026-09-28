import React, { HTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '../utils';

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  /** Short KPI name shown above the value. */
  label: string;
  /** The primary figure. Pass a pre-formatted string (e.g. "₹1,20,400"). */
  value: ReactNode;
  /** Optional small caption under the value (e.g. "MTD", "vs 30 days ago"). */
  hint?: ReactNode;
  /** Signed delta in the same unit as `value`. Arrow + color derive from sign. */
  delta?: number;
  /** Format the delta when it is not a plain number (e.g. "+12%"). When set, overrides auto-formatting. */
  deltaFormat?: (delta: number) => string;
  /** When true, a negative delta is treated as GOOD (e.g. refunds, failures). Default: positive is good. */
  invertTrend?: boolean;
  /** Trend arrow side: 'left' renders it after the value, 'right' before it. */
  deltaPosition?: 'left' | 'right';
  /** Optional inline SVG / series rendered beneath the value. Consumer draws its own axes/paths. */
  sparkline?: ReactNode;
  /** Optional icon/emoji in the top-right corner. */
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

const toneAccent: Record<NonNullable<StatProps['tone']>, string> = {
  default: 'text-[var(--color-text-primary)]',
  success: 'text-[var(--color-status-success)]',
  warning: 'text-[var(--color-status-warning)]',
  error: 'text-[var(--color-status-error)]',
  info: 'text-[var(--color-status-info)]',
};

export const Stat = forwardRef<HTMLDivElement, StatProps>(
  (
    {
      label,
      value,
      hint,
      delta,
      deltaFormat,
      invertTrend = false,
      deltaPosition = 'left',
      sparkline,
      icon,
      tone = 'default',
      className,
      ...props
    },
    ref
  ) => {
    const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
    const deltaAbs = hasDelta ? Math.abs(delta as number) : 0;
    const isGood = hasDelta ? (invertTrend ? (delta as number) < 0 : (delta as number) >= 0) : false;
    const deltaText = hasDelta
      ? deltaFormat
        ? deltaFormat(delta as number)
        : `${(delta as number) >= 0 ? '+' : '−'}${deltaAbs}`
      : '';

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-background-primary)] p-4 sm:p-5',
          'shadow-sm transition-shadow hover:shadow-md',
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {label}
          </p>
          {icon && <span className="shrink-0 text-[var(--color-text-tertiary)]">{icon}</span>}
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn('text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight', toneAccent[tone])}>
            {value}
          </span>
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
                isGood
                  ? 'text-[var(--color-status-success)]'
                  : 'text-[var(--color-status-error)]'
              )}
              aria-label={`${isGood ? 'Strong' : 'Weak'} change of ${deltaText}`}
            >
              {deltaPosition === 'right' && (isGood ? '↑' : '↓')}
              <span>{deltaText}</span>
              {deltaPosition === 'left' && (isGood ? '↑' : '↓')}
            </span>
          )}
        </div>

        {hint && (
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{hint}</p>
        )}

        {sparkline && (
          <div className="mt-3" aria-hidden="true">
            {sparkline}
          </div>
        )}
      </div>
    );
  }
);

Stat.displayName = 'Stat';