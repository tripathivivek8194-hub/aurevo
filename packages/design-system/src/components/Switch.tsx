import React, { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange' | 'size'> {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      label,
      checked = false,
      onChange,
      disabled,
      required,
      size = 'md',
      id,
      className,
      ...props
    },
    ref
  ) => {
    const switchId = id || `switch-${Math.random().toString(36).substring(2, 9)}`;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event.target.checked);
    };

    const sizeStyles = {
      sm: 'w-8 h-5',
      md: 'w-11 h-6',
      lg: 'w-14 h-7',
    };

    const thumbSize = {
      sm: 'w-3.5 h-3.5 translate-x-1',
      md: 'w-4 h-4 translate-x-1',
      lg: 'w-5 h-5 translate-x-1',
    };

    const thumbTranslate = {
      sm: 'translate-x-4',
      md: 'translate-x-5',
      lg: 'translate-x-7',
    };

    return (
      <div className="flex items-center gap-3">
        <div className="relative flex items-center">
          <input
            ref={ref}
            type="checkbox"
            id={switchId}
            role="switch"
            checked={checked}
            disabled={disabled}
            required={required}
            onChange={handleChange}
            className="sr-only"
            aria-checked={checked}
            {...props}
          />
          <div
            className={cn(
              'relative rounded-full transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-border-focus)]',
              checked
                ? 'bg-[var(--color-interactive-primary)]'
                : 'bg-[var(--color-background-tertiary)]',
              disabled && 'opacity-50 cursor-not-allowed',
              sizeStyles[size],
              className
            )}
          >
            <div
              className={cn(
                'rounded-full bg-white shadow-lg transition-transform duration-200 ease-in-out',
                thumbSize[size],
                checked && thumbTranslate[size]
              )}
            />
          </div>
        </div>
        {label && (
          <label
            htmlFor={switchId}
            className="text-sm text-[var(--color-text-primary)] cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Switch.displayName = 'Switch';