import { useEffect, useState } from 'react';

type CookiePreferences = {
  version: 1;
  essential: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

const STORAGE_KEY = 'aurevo_cookie_preferences';
const OPEN_SETTINGS_EVENT = 'aurevo:open-cookie-settings';

function readPreferences(): CookiePreferences | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<CookiePreferences>;
    if (parsed.version !== 1 || parsed.essential !== true) return null;

    return {
      version: 1,
      essential: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

function savePreferences(analytics: boolean, marketing: boolean) {
  const preferences: CookiePreferences = {
    version: 1,
    essential: true,
    analytics,
    marketing,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Consent still applies for this visit if browser storage is unavailable.
  }
}

/**
 * Keeps optional analytics/marketing disabled until a customer explicitly
 * chooses them. Essential cookies (authentication, security and cart) remain
 * available because the storefront cannot function without them.
 */
export function CookieConsent() {
  const [saved, setSaved] = useState<CookiePreferences | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const preferences = readPreferences();
    setSaved(preferences);
    setAnalytics(preferences?.analytics ?? false);
    setMarketing(preferences?.marketing ?? false);

    const openSettings = () => setShowSettings(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings);
  }, []);

  const persist = (nextAnalytics: boolean, nextMarketing: boolean) => {
    savePreferences(nextAnalytics, nextMarketing);
    setSaved({
      version: 1,
      essential: true,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      updatedAt: new Date().toISOString(),
    });
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    setShowSettings(false);
  };

  const showBanner = saved === null && !showSettings;

  return (
    <>
      {showBanner && (
        <section
          aria-label="Cookie choices"
          className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5 shadow-2xl sm:bottom-6 sm:p-6"
        >
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Your privacy, your choice</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            AUREVO uses essential cookies for secure sign-in, your cart and checkout. Optional cookies help us understand visits and measure marketing.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => persist(true, true)}
              className="rounded-lg bg-[var(--color-interactive-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-interactive-primary-text)] transition-opacity hover:opacity-90"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => persist(false, false)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-background-hover)]"
            >
              Reject optional
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="px-2 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              Cookie settings
            </button>
          </div>
        </section>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[101] flex items-end bg-black/50 p-4 sm:items-center sm:justify-center" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 id="cookie-settings-title" className="text-lg font-semibold text-[var(--color-text-primary)]">
                  Cookie settings
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Choose which optional cookies AUREVO may use.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-2xl leading-none text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                aria-label="Close cookie settings"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <CookieOption
                title="Essential cookies"
                description="Secure sign-in, cart, checkout and fraud prevention. Always active."
                enabled
                locked
                onChange={() => undefined}
              />
              <CookieOption
                title="Analytics cookies"
                description="Help us understand which pages and products are useful."
                enabled={analytics}
                onChange={() => setAnalytics((value) => !value)}
              />
              <CookieOption
                title="Marketing cookies"
                description="Measure advertising performance and improve product promotions."
                enabled={marketing}
                onChange={() => setMarketing((value) => !value)}
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => persist(false, false)}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-background-hover)]"
              >
                Reject optional
              </button>
              <button
                type="button"
                onClick={() => persist(analytics, marketing)}
                className="rounded-lg bg-[var(--color-interactive-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-interactive-primary-text)] hover:opacity-90"
              >
                Save choices
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function CookieOption({
  title,
  description,
  enabled,
  locked = false,
  onChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] p-4">
      <div>
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
        <p className="mt-1 text-sm leading-5 text-[var(--color-text-secondary)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${title}: ${enabled ? 'enabled' : 'disabled'}`}
        disabled={locked}
        onClick={onChange}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? 'bg-[var(--color-interactive-primary)]' : 'bg-[var(--color-border)]'} ${locked ? 'cursor-not-allowed opacity-80' : ''}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
