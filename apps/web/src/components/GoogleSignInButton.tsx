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
    let resizeObserver: ResizeObserver | null = null;
    let renderedWidth = 0;

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

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          callbackRef.current(response.credential);
        },
        ux_mode: 'popup',
      });

      const renderButton = () => {
        const container = containerRef.current;
        if (!container || !window.google) return;

        const availableWidth = Math.floor(container.clientWidth);
        if (availableWidth <= 0) return;

        const width = Math.min(384, Math.max(200, availableWidth));
        if (Math.abs(width - renderedWidth) < 2) return;

        renderedWidth = width;
        container.innerHTML = '';
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: label,
          shape: 'pill',
          width,
        });
      };

      renderButton();
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(renderButton);
      resizeObserver.observe(containerRef.current);
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
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-10 w-full min-w-0 justify-center overflow-hidden"
    />
  );
}
