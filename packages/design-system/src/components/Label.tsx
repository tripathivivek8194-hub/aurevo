import React, { LabelHTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ children, required, className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'block text-sm font-medium text-[var(--color-text-primary)] mb-1.5',
          className
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="text-[var(--color-status-error)] ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
    );
  }
);

Label.displayName = 'Label';