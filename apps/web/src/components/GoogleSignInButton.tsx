import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            ux_mode?: 'popup';
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** Google One Tap needs a browser client ID baked into the storefront build. */
export const isGoogleSignInAvailable = Boolean(
  import.meta.env.VITE_GOOGLE_CLIENT_ID,
);

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
}

export function GoogleSignInButton({
  onCredential,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;

    const initializeGoogle = () => {
      if (
        cancelled ||
        !containerRef.current ||
        !window.google
      ) {
        return;
      }

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

      if (!clientId) return;

      containerRef.current.innerHTML = '';

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          callbackRef.current(response.credential);
        },
        ux_mode: 'popup',
      });

      window.google.accounts.id.renderButton(
        containerRef.current,
        {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 320,
        },
      );
    };

    const existingScript = document.querySelector(
      `script[src="${GOOGLE_SCRIPT_SRC}"]`,
    );

    if (existingScript) {
      if (window.google) {
        initializeGoogle();
      } else {
        existingScript.addEventListener('load', initializeGoogle, {
          once: true,
        });
      }
    } else {
      const script = document.createElement('script');

      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogle;

      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-10 justify-center"
    />
  );
}
