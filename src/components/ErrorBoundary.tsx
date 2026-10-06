import React from 'react';

interface ErrorBoundaryProps {
  /** Shown in the fallback so the user knows which part failed. */
  label: string;
  children: React.ReactNode;
  /**
   * Custom recovery UI. Receives a reset callback. Supplying this lets the owner
   * offer a meaningful escape route - e.g. the preview offering "switch to the
   * raw editor" - instead of a dead end.
   */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  /** Notified on every caught error, for logging. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains a render-time throw so it cannot take the whole window with it.
 *
 * This mattered more than it sounds: a throw while rendering the preview unmounted
 * the entire React tree, so the tab state - which lives only in App and was never
 * persisted - went with it. The user got a white window and lost every unsaved
 * edit, with no recovery path.
 *
 * Boundaries are placed *inside* the component tree that owns the state worth
 * protecting, so catching a failure does not discard it.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[${this.props.label}] render failed`, error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-semibold text-rose-300">{this.props.label} could not be displayed</p>
        <p className="max-w-md text-xs text-slate-400">
          Your document is untouched. You can retry, or switch view to keep working.
        </p>
        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded border border-slate-700 bg-slate-900/60 p-2 text-left text-2xs text-slate-400">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="rounded border border-sky-600 bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600"
        >
          Try again
        </button>
      </div>
    );
  }
}
