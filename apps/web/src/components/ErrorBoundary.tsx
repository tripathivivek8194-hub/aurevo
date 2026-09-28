import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** Optional fallback UI — defaults to the built-in recovery card. */
  fallback?: ReactNode;
  /** Called with the error + info so parent can log/report. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Class-component error boundary — the only way to catch unhandled render
 * errors in React < 19 without a full-page white-screen crash.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console so devs can inspect the component stack.
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[40vh] flex items-center justify-center p-8">
          <div className="max-w-md w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center space-y-4 shadow-sm">
            <div className="text-4xl" role="img" aria-label="error">
              &#x26A0;&#xFE0F;
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              An unexpected error crashed this part of the page.
              You can try reloading it or continue using other parts of the app.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 overflow-x-auto max-h-40 text-[var(--color-text-secondary)]">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer bg-[var(--color-primary)] text-white hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
