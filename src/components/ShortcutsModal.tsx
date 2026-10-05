import React, { useState } from 'react';
import { X, Keyboard, Search, Sparkles, Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'dark' | 'light';
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'File Operations' | 'Search & Navigation' | 'Editing & Formatting' | 'View & System';
}

const SHORTCUTS: ShortcutItem[] = [
  // File Operations
  {
    keys: ['Ctrl', 'S'],
    description: 'Save changes directly to Windows disk',
    category: 'File Operations',
  },
  {
    keys: ['Ctrl', 'Shift', 'S'],
    description: 'Save as another file in Windows folder',
    category: 'File Operations',
  },
  {
    keys: ['Ctrl', 'O'],
    description: 'Open .md file from Windows File Explorer',
    category: 'File Operations',
  },
  {
    keys: ['Ctrl', 'N'],
    description: 'Create a new blank Markdown document',
    category: 'File Operations',
  },

  // Search & Navigation
  {
    keys: ['Ctrl', 'K'],
    description: 'Open Command Palette & full-text file search',
    category: 'Search & Navigation',
  },
  {
    keys: ['Ctrl', 'F'],
    description: 'Find keyword in current document',
    category: 'Search & Navigation',
  },
  {
    keys: ['Ctrl', 'H'],
    description: 'Find and Replace in current document',
    category: 'Search & Navigation',
  },

  // Editing & Formatting
  {
    keys: ['Ctrl', 'B'],
    description: 'Format selected text as Bold (**text**)',
    category: 'Editing & Formatting',
  },
  {
    keys: ['Ctrl', 'I'],
    description: 'Format selected text as Italic (*text*)',
    category: 'Editing & Formatting',
  },
  {
    keys: ['Tab'],
    description: 'Insert 2-space tab indentation',
    category: 'Editing & Formatting',
  },

  // View & System
  {
    keys: ['Ctrl', 'P'],
    description: 'Print document or Export to PDF',
    category: 'View & System',
  },
  {
    keys: ['F11'],
    description: 'Toggle full screen window mode',
    category: 'View & System',
  },
  {
    keys: ['Esc'],
    description: 'Close active dialog, palette, or lightbox',
    category: 'View & System',
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
  theme = 'dark',
}) => {
  const [filter, setFilter] = useState('');
  const isLight = theme === 'light';

  if (!isOpen) return null;

  const filteredShortcuts = SHORTCUTS.filter(
    (s) =>
      s.description.toLowerCase().includes(filter.toLowerCase()) ||
      s.keys.join(' ').toLowerCase().includes(filter.toLowerCase()) ||
      s.category.toLowerCase().includes(filter.toLowerCase())
  );

  const categories = Array.from(new Set(filteredShortcuts.map((s) => s.category)));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors duration-150 ${
          isLight
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isLight
                ? 'bg-sky-100 border-sky-300 text-sky-600'
                : 'bg-sky-500/20 border-sky-500/30 text-sky-400'
            }`}>
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                <span>Keyboard Shortcuts Reference</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                  isLight
                    ? 'bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  Windows 11
                </span>
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Quick keyboard commands for editing, saving, and navigation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Search */}
        <div className={`px-5 py-3 border-b flex items-center gap-2.5 ${
          isLight ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter shortcuts by key or action (e.g. Save, Ctrl+S, Bold)..."
            className={`w-full bg-transparent text-xs outline-none ${
              isLight ? 'text-slate-900 placeholder-slate-400' : 'text-slate-100 placeholder-slate-500'
            }`}
            autoFocus
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Shortcuts List by Category */}
        <div className="p-6 overflow-y-auto space-y-6">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No shortcuts found matching "{filter}"
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat} className="space-y-2.5">
                <div className={`text-xs font-bold uppercase tracking-wider ${
                  isLight ? 'text-sky-700' : 'text-sky-400'
                }`}>
                  {cat}
                </div>

                <div className={`rounded-xl border divide-y overflow-hidden ${
                  isLight ? 'bg-slate-50/80 border-slate-200 divide-slate-200' : 'bg-slate-950/60 border-slate-800 divide-slate-800/80'
                }`}>
                  {filteredShortcuts
                    .filter((s) => s.category === cat)
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3 flex items-center justify-between text-xs transition ${
                          isLight ? 'hover:bg-white' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                          {item.description}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.keys.map((k, kIdx) => (
                            <React.Fragment key={kIdx}>
                              <kbd className={`px-2 py-1 rounded-md text-[11px] font-mono font-semibold shadow-sm border ${
                                isLight
                                  ? 'bg-white text-slate-800 border-slate-300 shadow-slate-200'
                                  : 'bg-slate-800 text-slate-200 border-slate-700 shadow-black/40'
                              }`}>
                                {k}
                              </kbd>
                              {kIdx < item.keys.length - 1 && (
                                <span className="text-slate-400 text-xs">+</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between text-xs ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/80 border-slate-800 text-slate-500'
        }`}>
          <span>Tip: Press ESC anytime to close</span>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
              isLight
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
