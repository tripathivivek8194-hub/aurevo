import React, { ReactNode, useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { cn } from '../utils';
import { Button } from './Button';

export interface DropdownItem {
  label: string;
  value: string;
  icon?: ReactNode;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  onSelect?: (value: string, item: DropdownItem) => void;
  align?: 'left' | 'right';
  closeOnSelect?: boolean;
  disabled?: boolean;
}

export function Dropdown({
  trigger,
  items,
  onSelect,
  align = 'left',
  closeOnSelect = true,
  disabled = false,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClickOutside]);

  // Map items to the indices of focusable (non-divider, non-disabled) entries.
  const focusableIndices = items
    .map((item, index) => (item.divider || item.disabled ? -1 : index))
    .filter((index) => index !== -1);

  const focusItem = (index: number) => {
    if (index < 0 || index >= items.length) return;
    itemRefs.current[index]?.focus();
    setActiveIndex(index);
  };

  const moveFocus = (delta: number) => {
    if (focusableIndices.length === 0) return;
    const current = activeIndex;
    const currentPos = current === -1 ? -1 : focusableIndices.indexOf(current);
    const nextPos = (currentPos + delta + focusableIndices.length) % focusableIndices.length;
    focusItem(focusableIndices[nextPos]);
  };

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled || item.divider) return;
    onSelect?.(item.value, item);
    if (closeOnSelect) setIsOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen) {
      // Open on ArrowDown/ArrowUp/Enter/Space from the trigger.
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setIsOpen(true);
        // Focus the first item for ArrowDown, last for ArrowUp.
        setTimeout(() => focusItem(event.key === 'ArrowDown' ? focusableIndices[0] : focusableIndices[focusableIndices.length - 1]));
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-1);
        break;
      case 'Home':
        event.preventDefault();
        if (focusableIndices.length > 0) focusItem(focusableIndices[0]);
        break;
      case 'End':
        event.preventDefault();
        if (focusableIndices.length > 0) focusItem(focusableIndices[focusableIndices.length - 1]);
        break;
    }
  };

  return (
    <div className="relative inline-block" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="w-full"
      >
        {trigger}
      </button>

      {isOpen && (
        <Fragment>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={dropdownRef}
            className={cn(
              'absolute z-50 mt-1.5 min-w-[200px] bg-[var(--color-overlay-modal)] rounded-lg border border-[var(--color-border-primary)] shadow-lg animate-fade-in',
              align === 'right' ? 'right-0' : 'left-0'
            )}
            role="menu"
            tabIndex={-1}
          >
            <div className="py-1">
              {items.map((item, index) => {
                if (item.divider) {
                  return (
                    <div
                      key={index}
                      className="border-t border-[var(--color-border-primary)] my-1"
                      role="separator"
                    />
                  );
                }
                return (
                  <button
                    key={index}
                    ref={(el) => { itemRefs.current[index] = el; }}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
                      'hover:bg-[var(--color-background-secondary)] focus:bg-[var(--color-background-secondary)] focus:outline-none',
                      item.disabled && 'opacity-50 cursor-not-allowed',
                      item.danger && 'text-[var(--color-status-error)] hover:bg-[var(--color-status-error-bg)]'
                    )}
                  >
                    {item.icon && <span className="flex-shrink-0 w-5 h-5">{item.icon}</span>}
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Fragment>
      )}
    </div>
  );
}

export interface SelectDropdownProps {
  value: string;
  placeholder?: string;
  items: DropdownItem[];
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export function SelectDropdown({
  value,
  placeholder,
  items,
  onChange,
  disabled = false,
  label,
  error,
  fullWidth = false,
}: SelectDropdownProps) {
  const selectedItem = items.find(item => item.value === value);

  return (
    <div className={cn('w-full', fullWidth && 'w-full')}>
      {label && (
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
          {label}
        </label>
      )}
      <Dropdown
        disabled={disabled}
        items={items}
        onSelect={(val) => onChange(val)}
        align="left"
        trigger={
          <button
            type="button"
            className={cn(
              'w-full flex items-center justify-between px-4 py-2.5 text-base',
              'bg-[var(--color-background-primary)] border rounded-lg',
              'placeholder:text-[var(--color-text-tertiary)]',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-[var(--color-border-focus)]',
              'disabled:bg-[var(--color-background-tertiary)] disabled:cursor-not-allowed',
              'hover:border-[var(--color-border-secondary)]',
              error && 'border-[var(--color-border-error)] focus-visible:ring-[var(--color-border-error)]',
              disabled && 'opacity-50'
            )}
            aria-haspopup="listbox"
          >
            <span className={cn('truncate', !selectedItem && !value && 'text-[var(--color-text-tertiary)]')}>
              {selectedItem?.label || value || placeholder || 'Select...'}
            </span>
            <svg
              className={cn(
                'w-4 h-4 flex-shrink-0 ml-2 text-[var(--color-text-tertiary)]'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        }
      />
      {error && (
        <p className="mt-1.5 text-sm text-[var(--color-status-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}