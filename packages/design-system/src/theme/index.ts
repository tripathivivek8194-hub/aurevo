// Theme configuration - maps semantic tokens to actual values for light/dark modes
import { colors } from '../tokens';

export const lightTheme = {
  // Backgrounds
  '--color-background-primary': colors.neutral[0],
  '--color-background-secondary': colors.neutral[50],
  '--color-background-tertiary': colors.neutral[100],
  '--color-background-inverse': colors.neutral[900],

  // Text
  '--color-text-primary': colors.neutral[900],
  '--color-text-secondary': colors.neutral[600],
  '--color-text-tertiary': colors.neutral[400],
  '--color-text-inverse': colors.neutral[0],
  '--color-text-link': colors.brand[600],
  '--color-text-link-hover': colors.brand[700],

  // Borders
  '--color-border-primary': colors.neutral[200],
  '--color-border-secondary': colors.neutral[300],
  '--color-border-focus': colors.brand[500],
  '--color-border-error': '#dc2626',
  '--color-border-success': '#16a34a',

  // Interactive
  '--color-interactive-primary': colors.brand[600],
  '--color-interactive-primary-hover': colors.brand[700],
  '--color-interactive-primary-active': colors.brand[800],
  '--color-interactive-secondary': colors.neutral[100],
  '--color-interactive-secondary-hover': colors.neutral[200],
  '--color-interactive-ghost': 'transparent',
  '--color-interactive-ghost-hover': colors.neutral[100],

  // Status
  '--color-status-success': '#16a34a',
  '--color-status-success-bg': '#f0fdf4',
  '--color-status-warning': '#f59e0b',
  '--color-status-warning-bg': '#fffbeb',
  '--color-status-error': '#dc2626',
  '--color-status-error-bg': '#fef2f2',
  '--color-status-info': '#2563eb',
  '--color-status-info-bg': '#eff6ff',

  // Overlay
  '--color-overlay-backdrop': 'rgba(0, 0, 0, 0.5)',
  '--color-overlay-modal': colors.neutral[0],

  // Shadows (lighter in light mode)
  '--shadow-xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  '--shadow-sm': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  '--shadow-md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  '--shadow-lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  '--shadow-xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '--shadow-2xl': '0 25px 50px -12px rgb(0 0 0 / 0.15)',
  '--shadow-inner': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  '--shadow-focus': '0 0 0 3px var(--color-border-focus)',
} as const;

export const darkTheme = {
  // Backgrounds
  '--color-background-primary': colors.neutral[950],
  '--color-background-secondary': colors.neutral[900],
  '--color-background-tertiary': colors.neutral[800],
  '--color-background-inverse': colors.neutral[0],

  // Text
  '--color-text-primary': colors.neutral[50],
  '--color-text-secondary': colors.neutral[400],
  '--color-text-tertiary': colors.neutral[500],
  '--color-text-inverse': colors.neutral[900],
  '--color-text-link': colors.brand[400],
  '--color-text-link-hover': colors.brand[300],

  // Borders
  '--color-border-primary': colors.neutral[700],
  '--color-border-secondary': colors.neutral[600],
  '--color-border-focus': colors.brand[400],
  '--color-border-error': '#ef4444',
  '--color-border-success': '#22c55e',

  // Interactive
  '--color-interactive-primary': colors.brand[500],
  '--color-interactive-primary-hover': colors.brand[400],
  '--color-interactive-primary-active': colors.brand[600],
  '--color-interactive-secondary': colors.neutral[800],
  '--color-interactive-secondary-hover': colors.neutral[700],
  '--color-interactive-ghost': 'transparent',
  '--color-interactive-ghost-hover': colors.neutral[800],

  // Status
  '--color-status-success': '#22c55e',
  '--color-status-success-bg': '#14532d',
  '--color-status-warning': '#fbbf24',
  '--color-status-warning-bg': '#78350f',
  '--color-status-error': '#ef4444',
  '--color-status-error-bg': '#7f1d1d',
  '--color-status-info': '#60a5fa',
  '--color-status-info-bg': '#1e3a5f',

  // Overlay
  '--color-overlay-backdrop': 'rgba(0, 0, 0, 0.7)',
  '--color-overlay-modal': colors.neutral[900],

  // Shadows (darker in dark mode)
  '--shadow-xs': '0 1px 2px 0 rgb(0 0 0 / 0.3)',
  '--shadow-sm': '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.3)',
  '--shadow-md': '0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
  '--shadow-lg': '0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.3)',
  '--shadow-xl': '0 20px 25px -5px rgb(0 0 0 / 0.4), 0 8px 10px -6px rgb(0 0 0 / 0.3)',
  '--shadow-2xl': '0 25px 50px -12px rgb(0 0 0 / 0.5)',
  '--shadow-inner': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.3)',
  '--shadow-focus': '0 0 0 3px var(--color-border-focus)',
} as const;

// Typography CSS variables
export const typographyVariables = {
  '--font-sans': '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  '--font-serif': '"Playfair Display", Georgia, Cambria, "Times New Roman", serif',
  '--font-mono': '"JetBrains Mono", "Fira Code", Consolas, monospace',

  '--text-xs': '0.75rem',
  '--text-sm': '0.875rem',
  '--text-base': '1rem',
  '--text-lg': '1.125rem',
  '--text-xl': '1.25rem',
  '--text-2xl': '1.5rem',
  '--text-3xl': '1.875rem',
  '--text-4xl': '2.25rem',
  '--text-5xl': 'clamp(2.5rem, 5vw, 3.5rem)',
  '--text-6xl': 'clamp(3rem, 6vw, 4.5rem)',
} as const;

// Spacing CSS variables
export const spacingVariables = {
  '--space-1': '0.25rem',
  '--space-2': '0.5rem',
  '--space-3': '0.75rem',
  '--space-4': '1rem',
  '--space-5': '1.25rem',
  '--space-6': '1.5rem',
  '--space-8': '2rem',
  '--space-10': '2.5rem',
  '--space-12': '3rem',
  '--space-16': '4rem',
  '--space-20': '5rem',
  '--space-24': '6rem',
  '--space-32': '8rem',
} as const;

// Border radius CSS variables
export const borderRadiusVariables = {
  '--radius-sm': '0.25rem',
  '--radius-md': '0.375rem',
  '--radius-lg': '0.5rem',
  '--radius-xl': '0.75rem',
  '--radius-2xl': '1rem',
  '--radius-full': '9999px',
} as const;

// Transition CSS variables
export const transitionVariables = {
  '--transition-fast': '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  '--transition-normal': '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  '--transition-slow': '300ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// Generate CSS custom properties string for injection
export function generateThemeCSS(theme: Record<string, string>): string {
  return Object.entries(theme)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n');
}

export function generateAllCSS(): string {
  const sections = [
    '/* Typography */',
    generateThemeCSS(typographyVariables),
    '',
    '/* Spacing */',
    generateThemeCSS(spacingVariables),
    '',
    '/* Border Radius */',
    generateThemeCSS(borderRadiusVariables),
    '',
    '/* Transitions */',
    generateThemeCSS(transitionVariables),
    '',
    '/* Light Theme (default) */',
    ':root, [data-theme="light"] {',
    generateThemeCSS(lightTheme).replace(/^/gm, '  '),
    '}',
    '',
    '/* Dark Theme */',
    '[data-theme="dark"] {',
    generateThemeCSS(darkTheme).replace(/^/gm, '  '),
    '}',
  ];
  return sections.join('\n');
}

// Theme type for TypeScript
export type ThemeVariables = typeof lightTheme & typeof typographyVariables & typeof spacingVariables & typeof borderRadiusVariables & typeof transitionVariables;