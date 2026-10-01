import aurevoLogo from '../assets/aurevo-logo.png';

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
 * The official mark is imported from the source tree rather than loaded from
 * an external or temporary URL. Vite fingerprints and bundles it into every
 * storefront build, and the wordmark remains visible as a graceful fallback.
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
      <img
        src={aurevoLogo}
        alt=""
        aria-hidden="true"
        className={`${selectedSize.mark} shrink-0 object-contain drop-shadow-[0_6px_14px_rgba(99,102,241,0.28)]`}
      />

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
