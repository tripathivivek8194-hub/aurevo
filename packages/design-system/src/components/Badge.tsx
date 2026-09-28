import React, { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      children,
      variant = 'default',
      size = 'md',
      dot = false,
      className,
      ...props
    },
    ref
  ) => {
    const variantStyles = {
      default: 'bg-[var(--color-interactive-secondary)] text-[var(--color-text-primary)]',
      success: 'bg-[var(--color-status-success-bg)] text-[var(--color-status-success)] border border-[var(--color-border-success)]',
      warning: 'bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border border-[var(--color-border-warning)]',
      error: 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] border border-[var(--color-border-error)]',
      info: 'bg-[var(--color-status-info-bg)] text-[var(--color-status-info)] border border-[var(--color-border-info)]',
      outline: 'bg-transparent text-[var(--color-text-primary)] border border-[var(--color-border-primary)]',
    };

    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs gap-1',
      md: 'px-2.5 py-1 text-sm gap-1.5',
      lg: 'px-3 py-1.5 text-base gap-2',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium rounded-full',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn(
              'rounded-full',
              variant === 'success' && 'bg-[var(--color-status-success)]',
              variant === 'warning' && 'bg-[var(--color-status-warning)]',
              variant === 'error' && 'bg-[var(--color-status-error)]',
              variant === 'info' && 'bg-[var(--color-status-info)]',
              variant === 'default' && 'bg-[var(--color-text-tertiary)]',
              size === 'sm' && 'w-1.5 h-1.5',
              size === 'md' && 'w-2 h-2',
              size === 'lg' && 'w-2.5 h-2.5'
            )}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';