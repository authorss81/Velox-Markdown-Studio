import React from 'react';
import { X } from 'lucide-react';
import type { OutlineEntry } from '../services/markdown';

interface OutlinePanelProps {
  outline: OutlineEntry[];
  activeId: string | null;
  theme?: 'dark' | 'light';
  onJump: (id: string) => void;
  onClose: () => void;
}

/**
 * Document outline sidebar (MD11). Lists the headings the renderer emitted,
 * indented by depth; clicking a row scrolls the preview to that heading and
 * the row for the section in view is highlighted. Rendered only when the user
 * opens it, so the default layout is untouched.
 */
export const OutlinePanel: React.FC<OutlinePanelProps> = ({
  outline,
  activeId,
  theme = 'dark',
  onJump,
  onClose,
}) => {
  const isLight = theme === 'light';

  return (
    <nav
      aria-label="Document outline"
      className={`h-full w-56 shrink-0 overflow-y-auto border-l ${
        isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
      }`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 backdrop-blur">
        <span className={`text-xs font-semibold uppercase tracking-wider ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}>
          Outline
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close outline"
          title="Close outline"
          className={`rounded p-1 transition ${
            isLight
              ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
          }`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {outline.length === 0 ? (
        <p className={`px-3 py-2 text-xs ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
          No headings in this document.
        </p>
      ) : (
        <ul className="px-1.5 pb-3">
          {outline.map((entry) => {
            const active = entry.id === activeId;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onJump(entry.id)}
                  aria-current={active ? 'true' : undefined}
                  title={entry.text}
                  style={{ paddingLeft: `${8 + (Math.min(entry.depth, 6) - 1) * 12}px` }}
                  className={`block w-full truncate rounded px-2 py-1 text-left text-xs transition ${
                    active
                      ? 'bg-sky-500/20 font-semibold text-sky-400'
                      : isLight
                      ? 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {entry.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
};
