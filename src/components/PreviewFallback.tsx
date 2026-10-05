import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface PreviewFallbackProps {
  onSwitchToRaw: () => void;
  onRetry: () => void;
}

/**
 * Recovery UI for a failed preview render.
 *
 * Switching to the raw editor is the important action: it gets the user back into
 * their document, which is still intact, instead of leaving them staring at an
 * error with no way to carry on.
 */
export const PreviewFallback: React.FC<PreviewFallbackProps> = ({ onSwitchToRaw, onRetry }) => (
  <div
    role="alert"
    className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center"
  >
    <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
    <p className="text-sm font-semibold text-amber-200">This document could not be previewed</p>
    <p className="max-w-sm text-xs leading-relaxed text-slate-400">
      Your text is safe. The preview choked on something in this file &mdash; switching to the
      editor lets you keep working on it.
    </p>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onSwitchToRaw}
        className="rounded border border-sky-600 bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600"
      >
        Open the editor
      </button>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
      >
        Try again
      </button>
    </div>
  </div>
);
