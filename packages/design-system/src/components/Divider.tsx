import React, { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  variant?: 'solid' | 'dashed' | 'dotted';
  label?: string;
}

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  ({ orientation = 'horizontal', variant = 'solid', label, className, ...props }, ref) => {
    const baseStyles = 'flex items-center';

    const orientationStyles = {
      horizontal: 'w-full my-4',
      vertical: 'h-full mx-4 flex-col',
    };

    const lineStyles = {
      solid: 'border-[var(--color-border-primary)]',
      dashed: 'border-dashed border-[var(--color-border-primary)]',
      dotted: 'border-dotted border-[var(--color-border-primary)]',
    };

    const lineBase = orientation === 'horizontal'
      ? 'flex-1 border-t'
      : 'flex-1 border-l';

    if (!label) {
      return (
        <div
          ref={ref}
          role="separator"
          className={cn(baseStyles, orientationStyles[orientation], className)}
          {...props}
        >
          <div className={cn(lineBase, lineStyles[variant])} />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        role="separator"
        className={cn(baseStyles, orientationStyles[orientation], className)}
        {...props}
      >
        <div className={cn(lineBase, lineStyles[variant])} />
        <span className="px-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide whitespace-nowrap">
          {label}
        </span>
        <div className={cn(lineBase, lineStyles[variant])} />
      </div>
    );
  }
);

Divider.displayName = 'Divider';