// Utility functions for the design system
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine class names with tailwind-merge for proper precedence
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Generate unique ID
 */
export function generateId(prefix: string = ''): string {
  return `${prefix}${Math.random().toString(36).substring(2, 15)}${Date.now().toString(36)}`;
}

/**
 * Class name builder for compound components
 */
export function createCompoundClass(base: string, variant?: string, size?: string, state?: string): string {
  return cn(
    base,
    variant && `${base}--${variant}`,
    size && `${base}--${size}`,
    state && `${base}--${state}`
  );
}

/**
 * Focus ring styles for accessibility
 */
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-border-focus)]';

/**
 * Visually hidden but accessible
 */
export const visuallyHidden = 'absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0';
export const visuallyHiddenFocusable = 'focus-visible:absolute focus-visible:w-auto focus-visible:h-auto focus-visible:p-0 focus-visible:m-0 focus-visible:overflow-visible focus-visible:whitespace-normal focus-visible:border-none';

// Pure, framework-agnostic helpers live in @aurevo/shared:
// slugify, formatPrice, formatPricePlain, truncate, debounce, generateId, sleep, generateOrderNumber