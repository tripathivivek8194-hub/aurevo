import { Input, type InputProps } from '@aurevo/design-system';
import { useState } from 'react';

type PasswordInputProps = Omit<InputProps, 'type' | 'rightIcon'>;

/** Password input with an accessible show/hide control. */
export function PasswordInput({ className = '', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`pr-12 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? (
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.8 10.8 0 0112 4c5 0 8.7 4.2 9.7 6.5a3.7 3.7 0 010 3M6.2 6.2C4.2 7.6 2.8 9.5 2.3 10.5a3.7 3.7 0 000 3C3.3 15.8 7 20 12 20a10 10 0 004.1-.9" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.3 10.5C3.3 8.2 7 4 12 4s8.7 4.2 9.7 6.5a3.7 3.7 0 010 3C20.7 15.8 17 20 12 20s-8.7-4.2-9.7-6.5a3.7 3.7 0 010-3z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
