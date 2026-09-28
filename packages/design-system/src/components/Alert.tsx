import React, { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  onClose?: () => void;
}

const iconPaths = {
  info: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 16h-1v-4H9m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
  success: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  ),
  warning: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
    />
  ),
  error: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
};

const variantStyles = {
  info: {
    container: 'bg-[var(--color-status-info-bg)] border-[var(--color-border-info)]',
    icon: 'text-[var(--color-status-info)]',
    title: 'text-[var(--color-status-info)]',
    description: 'text-[var(--color-text-secondary)]',
  },
  success: {
    container: 'bg-[var(--color-status-success-bg)] border-[var(--color-border-success)]',
    icon: 'text-[var(--color-status-success)]',
    title: 'text-[var(--color-status-success)]',
    description: 'text-[var(--color-text-secondary)]',
  },
  warning: {
    container: 'bg-[var(--color-status-warning-bg)] border-[var(--color-border-warning)]',
    icon: 'text-[var(--color-status-warning)]',
    title: 'text-[var(--color-status-warning)]',
    description: 'text-[var(--color-text-secondary)]',
  },
  error: {
    container: 'bg-[var(--color-status-error-bg)] border-[var(--color-border-error)]',
    icon: 'text-[var(--color-status-error)]',
    title: 'text-[var(--color-status-error)]',
    description: 'text-[var(--color-text-secondary)]',
  },
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ variant = 'info', title, description, onClose, children, className, ...props }, ref) => {
    const styles = variantStyles[variant];

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          'flex gap-3 p-4 rounded-lg border',
          styles.container,
          className
        )}
        {...props}
      >
        <span className="flex-shrink-0 mt-0.5">
          <svg
            className={cn('w-5 h-5', styles.icon)}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {iconPaths[variant]}
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={cn('text-sm font-medium', styles.title)}>
              {title}
            </h4>
          )}
          {description && (
            <p className={cn('mt-1 text-sm', styles.description)}>
              {description}
            </p>
          )}
          {children}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Dismiss alert"
          >
            <svg
              className="w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

Alert.displayName = 'Alert';