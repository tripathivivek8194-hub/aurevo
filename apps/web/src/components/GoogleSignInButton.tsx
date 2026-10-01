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

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
  label?: 'continue_with' | 'signup_with';
}

export function GoogleSignInButton({
  onCredential,
  label = 'continue_with',
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

      if (!clientId) {
        console.error('VITE_GOOGLE_CLIENT_ID is not configured');
        return;
      }

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
          text: label,
          shape: 'pill',
          width: 384,
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
