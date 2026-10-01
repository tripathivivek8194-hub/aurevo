type BrandLogoProps = {
  className?: string;
  descriptor?: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizes = {
  sm: {
    mark: 'h-7 w-7',
    word: 'text-lg',
  },
  md: {
    mark: 'h-8 w-8 sm:h-9 sm:w-9',
    word: 'text-xl sm:text-2xl',
  },
  lg: {
    mark: 'h-10 w-10',
    word: 'text-2xl',
  },
} as const;

/**
 * Permanent AUREVO brand lockup.
 *
 * The mark is inline SVG rather than a runtime image URL, so it is bundled
 * directly into every storefront build and cannot disappear because an
 * uploaded/local asset was omitted from a deployment.
 */
export function BrandLogo({
  className = '',
  descriptor,
  size = 'md',
}: BrandLogoProps) {
  const selectedSize = sizes[size];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2.5 ${className}`}
      aria-label={descriptor ? `AUREVO ${descriptor}` : 'AUREVO'}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        className={`${selectedSize.mark} shrink-0 drop-shadow-[0_6px_14px_rgba(99,102,241,0.28)]`}
      >
        <path d="M32 4 59 25 32 60 5 25Z" fill="#6d28d9" />
        <path d="M32 4 47 25H17Z" fill="#8b5cf6" />
        <path d="M5 25h54L32 60Z" fill="#4f46e5" />
        <path
          d="M32 14c2.2 8 7.8 13.6 16 16-8.2 2.4-13.8 8-16 16-2.2-8-7.8-13.6-16-16 8.2-2.4 13.8-8 16-16Z"
          fill="var(--color-background-primary)"
        />
      </svg>

      <span
        className={`${selectedSize.word} font-bold leading-none tracking-[-0.045em] text-[var(--color-text-primary)]`}
      >
        AUREVO
      </span>

      {descriptor && (
        <span className="hidden border-l border-[var(--color-border)] pl-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] sm:block">
          {descriptor}
        </span>
      )}
    </span>
  );
}
