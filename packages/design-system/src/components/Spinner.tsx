import React, { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
}

export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  ({ size = 'md', label = 'Loading', className, ...props }, ref) => {
    const sizeStyles = {
      xs: 'w-3 h-3 border-2',
      sm: 'w-4 h-4 border-2',
      md: 'w-6 h-6 border-[3px]',
      lg: 'w-8 h-8 border-4',
      xl: 'w-12 h-12 border-4',
    };

    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn('inline-flex items-center gap-3', className)}
        {...props}
      >
        <div
          className={cn(
            'rounded-full border-[var(--color-interactive-primary)] border-t-transparent animate-spin',
            sizeStyles[size],
            className
          )}
        />
        {label && (
          <span className="sr-only">{label}</span>
        )}
      </div>
    );
  }
);

Spinner.displayName = 'Spinner';