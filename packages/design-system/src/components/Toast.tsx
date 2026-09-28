import React, { ReactNode, useState, useCallback, useEffect, Fragment } from 'react';
import { cn, generateId } from '../utils';
import { Button } from './Button';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'default';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

export interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const typeStyles = {
  success: 'bg-[var(--color-status-success-bg)] border-[var(--color-border-success)]',
  error: 'bg-[var(--color-status-error-bg)] border-[var(--color-border-error)]',
  warning: 'bg-[var(--color-status-warning-bg)] border-[var(--color-border-warning)]',
  info: 'bg-[var(--color-status-info-bg)] border-[var(--color-border-info)]',
  default: 'bg-[var(--color-background-primary)] border-[var(--color-border-primary)]',
};

const typeIcons = {
  success: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  ),
  error: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
  warning: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
    />
  ),
  info: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 16h-1v-4H9m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
  default: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 16h-1v-4H9m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
};

const typeIconColors = {
  success: 'text-[var(--color-status-success)]',
  error: 'text-[var(--color-status-error)]',
  warning: 'text-[var(--color-status-warning)]',
  info: 'text-[var(--color-status-info)]',
  default: 'text-[var(--color-text-tertiary)]',
};

export function ToastComponent({ toast, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onClose(toast.id), 200);
    }, toast.duration ?? 5000);

    return () => clearTimeout(timer);
  }, [toast, onClose]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-slide-in',
        'min-w-[300px] max-w-md',
        typeStyles[toast.type],
        isExiting && 'animate-fade-out opacity-0'
      )}
      role="alert"
      aria-live="polite"
    >
      <svg
        className={cn('flex-shrink-0 w-5 h-5 mt-0.5', typeIconColors[toast.type])}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        {typeIcons[toast.type]}
      </svg>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
          {toast.title}
        </h4>
        {toast.description && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {toast.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {toast.action && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              toast.action?.onClick();
              onClose(toast.id);
            }}
          >
            {toast.action.label}
          </Button>
        )}
        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="flex-shrink-0 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-background-secondary)] transition-colors"
          aria-label="Dismiss toast"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

const positionStyles = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export function ToastContainer({ toasts, onClose, position = 'top-right' }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <Fragment>
      <div
        className={cn(
          'fixed z-[800] flex flex-col gap-2 pointer-events-none',
          positionStyles[position]
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto w-full">
            <ToastComponent toast={toast} onClose={onClose} />
          </div>
        ))}
      </div>
    </Fragment>
  );
}

// Hook for using toasts
interface UseToastReturn {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export function createToastContext() {
  let toasts: Toast[] = [];
  const listeners: Set<() => void> = new Set();

  const notify = () => listeners.forEach(l => l());

  return {
    get toasts() {
      return toasts;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addToast(toast: Omit<Toast, 'id'>) {
      const id = generateId('toast-');
      toasts = [...toasts, { ...toast, id }];
      notify();
      return id;
    },
    removeToast(id: string) {
      toasts = toasts.filter(t => t.id !== id);
      notify();
    },
    clearToasts() {
      toasts = [];
      notify();
    },
  };
}

export type ToastContext = ReturnType<typeof createToastContext>;