import React, { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export type CheckboxState = boolean | 'indeterminate';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
  label?: string;
  checked?: CheckboxState;
  onChange?: (checked: boolean) => void;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      checked = false,
      indeterminate = false,
      onChange,
      disabled,
      required,
      id,
      className,
      ...props
    },
    ref
  ) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substring(2, 9)}`;
    const isIndeterminate = checked === 'indeterminate' || indeterminate;
    const isChecked = checked === true || isIndeterminate;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isIndeterminate) return;
      onChange?.(event.target.checked);
    };

    return (
      <div className="flex items-start gap-3">
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            checked={isChecked}
            disabled={disabled}
            required={required}
            onChange={handleChange}
            className="sr-only"
            aria-checked={isIndeterminate ? 'mixed' : isChecked}
            {...props}
          />
          <div
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-border-focus)]',
              isChecked && !isIndeterminate
                ? 'bg-[var(--color-interactive-primary)] border-[var(--color-interactive-primary)]'
                : 'border-[var(--color-border-primary)] hover:border-[var(--color-border-secondary)]',
              disabled && 'opacity-50 cursor-not-allowed',
              className
            )}
          >
            {isChecked && (
              <svg
                className={cn(
                  'w-3.5 h-3.5 text-[var(--color-text-inverse)]',
                  isIndeterminate && 'w-4 h-4'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isIndeterminate ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
                )}
              </svg>
            )}
          </div>
        </div>
        {label && (
          <label
            htmlFor={checkboxId}
            className="text-sm text-[var(--color-text-primary)] cursor-pointer select-none leading-relaxed"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';