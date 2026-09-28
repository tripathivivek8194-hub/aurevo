import React, { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      label,
      checked = false,
      onChange,
      disabled,
      required,
      id,
      className,
      ...props
    },
    ref
  ) => {
    const radioId = id || `radio-${Math.random().toString(36).substring(2, 9)}`;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event.target.checked);
    };

    return (
      <div className="flex items-start gap-3">
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            type="radio"
            id={radioId}
            checked={checked}
            disabled={disabled}
            required={required}
            onChange={handleChange}
            className="sr-only"
            {...props}
          />
          <div
            className={cn(
              'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-border-focus)]',
              checked
                ? 'border-[var(--color-interactive-primary)]'
                : 'border-[var(--color-border-primary)] hover:border-[var(--color-border-secondary)]',
              disabled && 'opacity-50 cursor-not-allowed',
              className
            )}
          >
            {checked && (
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-interactive-primary)]" />
            )}
          </div>
        </div>
        {label && (
          <label
            htmlFor={radioId}
            className="text-sm text-[var(--color-text-primary)] cursor-pointer select-none leading-relaxed"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Radio.displayName = 'Radio';

export interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  label?: string;
  error?: string;
  orientation?: 'horizontal' | 'vertical';
  fullWidth?: boolean;
}

export function RadioGroup({
  name,
  value,
  onChange,
  options,
  label,
  error,
  orientation = 'vertical',
  fullWidth = false,
}: RadioGroupProps) {
  return (
    <div className={cn('w-full', fullWidth && 'w-full')}>
      {label && (
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
          {label}
        </label>
      )}
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          'flex gap-4',
          orientation === 'vertical' && 'flex-col gap-3'
        )}
      >
        {options.map((option) => (
          <Radio
            key={option.value}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            disabled={option.disabled}
            label={option.label}
          />
        ))}
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-[var(--color-status-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}