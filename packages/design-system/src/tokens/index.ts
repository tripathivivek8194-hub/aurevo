// Design tokens - single source of truth for all design values

// Color palette - semantic naming for light/dark theming
export const colors = {
  // Brand colors
  brand: {
    50: '#faf7f5',
    100: '#f2ebe4',
    200: '#e6d6c9',
    300: '#d4b8a3',
    400: '#c19578',
    500: '#ae7855',  // Primary brand
    600: '#9d6346',
    700: '#824f39',
    800: '#6b4132',
    900: '#58372c',
    950: '#2e1c16',
  },

  // Neutral grays
  neutral: {
    0: '#ffffff',
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0a0a0a',
  },

  // Semantic colors (map to brand/neutral in theme)
  semantic: {
    // Backgrounds
    background: {
      primary: 'var(--color-background-primary)',
      secondary: 'var(--color-background-secondary)',
      tertiary: 'var(--color-background-tertiary)',
      inverse: 'var(--color-background-inverse)',
    },
    // Text
    text: {
      primary: 'var(--color-text-primary)',
      secondary: 'var(--color-text-secondary)',
      tertiary: 'var(--color-text-tertiary)',
      inverse: 'var(--color-text-inverse)',
      link: 'var(--color-text-link)',
      linkHover: 'var(--color-text-link-hover)',
    },
    // Borders
    border: {
      primary: 'var(--color-border-primary)',
      secondary: 'var(--color-border-secondary)',
      focus: 'var(--color-border-focus)',
      error: 'var(--color-border-error)',
      success: 'var(--color-border-success)',
    },
    // Interactive
    interactive: {
      primary: 'var(--color-interactive-primary)',
      primaryHover: 'var(--color-interactive-primary-hover)',
      primaryActive: 'var(--color-interactive-primary-active)',
      secondary: 'var(--color-interactive-secondary)',
      secondaryHover: 'var(--color-interactive-secondary-hover)',
      ghost: 'var(--color-interactive-ghost)',
      ghostHover: 'var(--color-interactive-ghost-hover)',
    },
    // Status
    status: {
      success: 'var(--color-status-success)',
      successBg: 'var(--color-status-success-bg)',
      warning: 'var(--color-status-warning)',
      warningBg: 'var(--color-status-warning-bg)',
      error: 'var(--color-status-error)',
      errorBg: 'var(--color-status-error-bg)',
      info: 'var(--color-status-info)',
      infoBg: 'var(--color-status-info-bg)',
    },
    // Overlay
    overlay: {
      backdrop: 'var(--color-overlay-backdrop)',
      modal: 'var(--color-overlay-modal)',
    },
  },
} as const;

// Typography scale - fluid using clamp()
export const typography = {
  fontFamilies: {
    sans: 'var(--font-sans, "Inter", system-ui, -apple-system, sans-serif)',
    serif: 'var(--font-serif, "Playfair Display", Georgia, serif)',
    mono: 'var(--font-mono, "JetBrains Mono", monospace)',
  },
  fontWeights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  fontSizes: {
    xs: 'var(--text-xs, 0.75rem)',      // 12px
    sm: 'var(--text-sm, 0.875rem)',     // 14px
    base: 'var(--text-base, 1rem)',     // 16px
    lg: 'var(--text-lg, 1.125rem)',     // 18px
    xl: 'var(--text-xl, 1.25rem)',      // 20px
    '2xl': 'var(--text-2xl, 1.5rem)',   // 24px
    '3xl': 'var(--text-3xl, 1.875rem)', // 30px
    '4xl': 'var(--text-4xl, 2.25rem)',  // 36px
    '5xl': 'var(--text-5xl, 3rem)',     // 48px
    '6xl': 'var(--text-6xl, 3.75rem)',  // 60px
  },
  lineHeights: {
    tight: 1.1,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
  letterSpacings: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// Spacing scale - 4px base unit
export const spacing = {
  0: '0',
  1: 'var(--space-1, 0.25rem)',   // 4px
  2: 'var(--space-2, 0.5rem)',    // 8px
  3: 'var(--space-3, 0.75rem)',   // 12px
  4: 'var(--space-4, 1rem)',      // 16px
  5: 'var(--space-5, 1.25rem)',   // 20px
  6: 'var(--space-6, 1.5rem)',    // 24px
  8: 'var(--space-8, 2rem)',      // 32px
  10: 'var(--space-10, 2.5rem)',  // 40px
  12: 'var(--space-12, 3rem)',    // 48px
  16: 'var(--space-16, 4rem)',    // 64px
  20: 'var(--space-20, 5rem)',    // 80px
  24: 'var(--space-24, 6rem)',    // 96px
  32: 'var(--space-32, 8rem)',    // 128px
} as const;

// Border radius
export const borderRadius = {
  none: '0',
  sm: 'var(--radius-sm, 0.25rem)',    // 4px
  md: 'var(--radius-md, 0.375rem)',   // 6px
  lg: 'var(--radius-lg, 0.5rem)',     // 8px
  xl: 'var(--radius-xl, 0.75rem)',    // 12px
  '2xl': 'var(--radius-2xl, 1rem)',   // 16px
  full: 'var(--radius-full, 9999px)',
} as const;

// Shadows
export const shadows = {
  none: 'none',
  xs: 'var(--shadow-xs, 0 1px 2px 0 rgb(0 0 0 / 0.05))',
  sm: 'var(--shadow-sm, 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1))',
  md: 'var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1))',
  lg: 'var(--shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1))',
  xl: 'var(--shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1))',
  '2xl': 'var(--shadow-2xl, 0 25px 50px -12px rgb(0 0 0 / 0.25))',
  inner: 'var(--shadow-inner, inset 0 2px 4px 0 rgb(0 0 0 / 0.05))',
  focus: 'var(--shadow-focus, 0 0 0 3px var(--color-border-focus))',
} as const;

// Transitions
export const transitions = {
  fast: 'var(--transition-fast, 150ms cubic-bezier(0.4, 0, 0.2, 1))',
  normal: 'var(--transition-normal, 200ms cubic-bezier(0.4, 0, 0.2, 1))',
  slow: 'var(--transition-slow, 300ms cubic-bezier(0.4, 0, 0.2, 1))',
} as const;

// Breakpoints
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// Z-index scale
export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 100,
  sticky: 200,
  fixed: 300,
  modalBackdrop: 400,
  modal: 500,
  popover: 600,
  tooltip: 700,
  toast: 800,
} as const;

// Container widths
export const containers = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1440px',
  full: '100%',
} as const;

// Animation durations
export const durations = {
  instant: '0ms',
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
} as const;

// Easing functions
export const easings = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;