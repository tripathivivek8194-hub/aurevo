import React, { ReactNode, useState, forwardRef } from 'react';
import { cn } from '../utils';

export interface AccordionItem {
  value: string;
  title: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  allowMultiple?: boolean;
  variant?: 'default' | 'bordered' | 'separated';
  className?: string;
}

export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      items,
      value,
      onChange,
      allowMultiple = false,
      variant = 'default',
      className,
    },
    ref
  ) => {
    const [openValues, setOpenValues] = useState<string[]>(() => {
      if (!value) return [];
      return allowMultiple ? (value as string[]) : [value as string];
    });

    const isOpen = (itemValue: string) => openValues.includes(itemValue);

    const handleToggle = (itemValue: string) => {
      let newValues: string[];
      if (allowMultiple) {
        newValues = isOpen(itemValue)
          ? openValues.filter(v => v !== itemValue)
          : [...openValues, itemValue];
      } else {
        newValues = isOpen(itemValue) ? [] : [itemValue];
      }
      setOpenValues(newValues);
      onChange?.(allowMultiple ? newValues : newValues[0]);
    };

    const variantStyles = {
      default: {
        container: '',
        item: 'border border-[var(--color-border-primary)] rounded-lg overflow-hidden',
        itemOpen: '',
      },
      bordered: {
        container: 'border border-[var(--color-border-primary)] rounded-lg overflow-hidden',
        item: 'border-b border-[var(--color-border-primary)] last:border-b-0',
        itemOpen: '',
      },
      separated: {
        container: '',
        item: 'border-b border-[var(--color-border-primary)]',
        itemOpen: '',
      },
    };

    const styles = variantStyles[variant];

    return (
      <div
        ref={ref}
        className={cn(styles.container, className)}
      >
        {items.map((item, index) => (
          <div
            key={item.value}
            className={cn(
              styles.item,
              variant === 'separated' && index === items.length - 1 && 'border-b-0'
            )}
          >
            <button
              type="button"
              onClick={() => !item.disabled && handleToggle(item.value)}
              disabled={item.disabled}
              className={cn(
                'w-full flex items-center justify-between px-4 py-4 text-left',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-border-focus)]',
                item.disabled && 'opacity-50 cursor-not-allowed'
              )}
              aria-expanded={isOpen(item.value)}
              aria-controls={`${item.value}-content`}
            >
              <span className="font-medium text-[var(--color-text-primary)] flex-1">
                {item.title}
              </span>
              <svg
                className={cn(
                  'w-5 h-5 flex-shrink-0 ml-4 text-[var(--color-text-tertiary)] transition-transform duration-200',
                  isOpen(item.value) && 'rotate-180'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              id={`${item.value}-content`}
              role="region"
              className={cn(
                'overflow-hidden transition-all duration-200 ease-in-out',
                isOpen(item.value)
                  ? 'max-h-96 opacity-100 pb-4'
                  : 'max-h-0 opacity-0'
              )}
            >
              <div className="px-4 text-[var(--color-text-secondary)]">
                {item.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
);

Accordion.displayName = 'Accordion';