import React, { ReactNode, useState, useRef, useEffect, forwardRef } from 'react';
import { cn } from '../utils';

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: 'line' | 'enclosed' | 'soft' | 'pills';
  orientation?: 'horizontal' | 'vertical';
  fullWidth?: boolean;
  className?: string;
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      items,
      value,
      onChange,
      variant = 'line',
      orientation = 'horizontal',
      fullWidth = false,
      className,
    },
    ref
  ) => {
    const variantStyles = {
      line: {
        container: 'border-b border-[var(--color-border-primary)]',
        tab: 'border-b-2 -mb-px',
        active: 'border-[var(--color-interactive-primary)] text-[var(--color-interactive-primary)]',
        inactive: 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]',
      },
      enclosed: {
        container: '',
        tab: 'rounded-md',
        active: 'bg-[var(--color-background-primary)] shadow-sm text-[var(--color-interactive-primary)]',
        inactive: 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)]',
      },
      soft: {
        container: '',
        tab: 'rounded-md',
        active: 'bg-[var(--color-interactive-primary)] text-[var(--color-text-inverse)]',
        inactive: 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)]',
      },
      pills: {
        container: '',
        tab: 'rounded-full',
        active: 'bg-[var(--color-interactive-primary)] text-[var(--color-text-inverse)] shadow-sm',
        inactive: 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)]',
      },
    };

    const styles = variantStyles[variant];

    return (
      <div ref={ref} className={cn(className)} role="tablist" aria-orientation={orientation}>
        {variant === 'line' && (
          <div className={cn(styles.container, orientation === 'horizontal' ? '' : 'border-b-0 border-r')}>
            <div
              className={cn(
                'flex gap-1',
                fullWidth && 'w-full',
                orientation === 'horizontal' ? '' : 'flex-col'
              )}
            >
              {items.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={value === item.value}
                  aria-disabled={item.disabled}
                  onClick={() => !item.disabled && onChange(item.value)}
                  disabled={item.disabled}
                  className={cn(
                    'relative flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-border-focus)]',
                    fullWidth && 'w-full',
                    value === item.value ? styles.active : styles.inactive,
                    item.disabled && 'opacity-50 cursor-not-allowed',
                    styles.tab
                  )}
                >
                  {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full',
                        value === item.value
                          ? 'bg-[var(--color-text-inverse)] text-[var(--color-interactive-primary)]'
                          : 'bg-[var(--color-background-tertiary)] text-[var(--color-text-tertiary)]'
                      )}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {variant !== 'line' && (
          <div
            className={cn(
              'flex gap-2',
              fullWidth && 'w-full',
              orientation === 'horizontal' ? '' : 'flex-col'
            )}
          >
            {items.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={value === item.value}
                aria-disabled={item.disabled}
                onClick={() => !item.disabled && onChange(item.value)}
                disabled={item.disabled}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-border-focus)]',
                  fullWidth && 'w-full',
                  value === item.value ? styles.active : styles.inactive,
                  item.disabled && 'opacity-50 cursor-not-allowed',
                  styles.tab
                )}
              >
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span
                    className={cn(
                      'px-2 py-0.5 text-xs rounded-full',
                      value === item.value
                        ? 'bg-[var(--color-text-inverse)] text-[var(--color-interactive-primary)]'
                        : 'bg-[var(--color-background-tertiary)] text-[var(--color-text-tertiary)]'
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
);

Tabs.displayName = 'Tabs';

export interface TabPanelsProps {
  children: ReactNode;
  value: string;
}

export const TabPanels: React.FC<TabPanelsProps> = ({ children, value }) => {
  return <div role="tabpanel">{children}</div>;
};

export interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(
  ({ value, children, className }, ref) => {
    // Only render if active (for SSR safety)
    // In client-side, could use conditional rendering with animation
    return (
      <div
        ref={ref}
        role="tabpanel"
        className={cn(className)}
        hidden={false} // Controlled by parent
      >
        {children}
      </div>
    );
  }
);

TabPanel.displayName = 'TabPanel';

// Client-side only TabPanel with animation
export function AnimatedTabPanel({
  value,
  activeValue,
  children,
  className,
}: TabPanelProps & { activeValue: string }) {
  const isActive = value === activeValue;
  const [mounted, setMounted] = useState(isActive);

  useEffect(() => {
    if (isActive) setMounted(true);
  }, [isActive]);

  useEffect(() => {
    if (!isActive && mounted) {
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isActive, mounted]);

  if (!mounted) return null;

  return (
    <div
      role="tabpanel"
      className={cn(
        'animate-fade-in',
        className
      )}
    >
      {children}
    </div>
  );
}