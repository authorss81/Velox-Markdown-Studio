import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  FileText,
  FilePlus,
  FolderOpen,
  Save,
  FileDown,
  Eye,
  Code,
  Columns2,

  Printer,
  Sparkles,
  Keyboard,
} from 'lucide-react';
import { MarkdownFileRecord, ViewMode } from '../types';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { filterFilesByQuery } from '../services/search';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  recentFiles: MarkdownFileRecord[];
  theme?: 'dark' | 'light';
  onOpenFileById: (fileId: string) => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onOpenSampleLibrary: () => void;
  onPrintPdf: () => void;
  onOpenShortcuts?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  recentFiles,
  theme = 'dark',
  onOpenFileById,
  onNewFile,
  onOpenFile,
  onSave,
  onSaveAs,
  onChangeViewMode,
  onOpenSampleLibrary,
  onPrintPdf,
  onOpenShortcuts,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isLight = theme === 'light';

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // The callbacks below are recreated by App on every render, so listing them in
  // the useMemo dependency array meant the memo was invalidated by *any* state
  // change anywhere in the app - it was providing no caching at all. Holding them
  // in a ref lets the memo depend only on what actually affects its output.
  const actions = useRef({
    onOpenFileById,
    onNewFile,
    onOpenFile,
    onSave,
    onSaveAs,
    onChangeViewMode,
    onOpenSampleLibrary,
    onPrintPdf,
    onOpenShortcuts,
  });
  actions.current = {
    onOpenFileById,
    onNewFile,
    onOpenFile,
    onSave,
    onSaveAs,
    onChangeViewMode,
    onOpenSampleLibrary,
    onPrintPdf,
    onOpenShortcuts,
  };

  // Debounced so a burst of keystrokes filters once rather than once per letter.
  const debouncedQuery = useDebouncedValue(query, 120);

  const items = useMemo(() => {
    const q = debouncedQuery.toLowerCase();

    // 1. Matched files from permanent memory.
    // filterFilesByQuery reuses the cached lowercase projection instead of
    // allocating a lowercase copy of every document on every keystroke.
    const matchedFiles = filterFilesByQuery(recentFiles, q, 5).map((f) => ({
      id: `file-${f.id}`,
      title: f.name,
      subtitle: f.path || `${f.wordCount} words • ${f.tags.join(', ')}`,
      icon: <FileText className="w-4 h-4 text-sky-500" />,
      action: () => actions.current.onOpenFileById(f.id),
    }));

    // 2. Commands
    const commands = [
      {
        id: 'cmd-shortcuts',
        title: 'Keyboard Shortcuts Reference',
        subtitle: 'View all keyboard shortcuts (Ctrl+S, Ctrl+O, Ctrl+N, Ctrl+K)',
        icon: <Keyboard className="w-4 h-4 text-sky-500" />,
        action: () => actions.current.onOpenShortcuts?.(),
      },
      {
        id: 'cmd-new',
        title: 'New Markdown Document',
        subtitle: 'Create a new empty markdown file (Ctrl+N)',
        icon: <FilePlus className="w-4 h-4 text-emerald-500" />,
        action: actions.current.onNewFile,
      },
      {
        id: 'cmd-open',
        title: 'Open File from Windows...',
        subtitle: 'Pick any .md file from your computer (Ctrl+O)',
        icon: <FolderOpen className="w-4 h-4 text-amber-500" />,
        action: actions.current.onOpenFile,
      },
      {
        id: 'cmd-save',
        title: 'Save Current File',
        subtitle: 'Commit changes back to Windows disk (Ctrl+S)',
        icon: <Save className="w-4 h-4 text-sky-500" />,
        action: actions.current.onSave,
      },
      {
        id: 'cmd-saveas',
        title: 'Save As Another File...',
        subtitle: 'Save to a new location in Windows (Ctrl+Shift+S)',
        icon: <FileDown className="w-4 h-4 text-emerald-500" />,
        action: actions.current.onSaveAs,
      },
      {
        id: 'cmd-preview',
        title: 'Switch to Preview Mode',
        subtitle: 'Render formatted markdown with syntax highlighting',
        icon: <Eye className="w-4 h-4 text-sky-500" />,
        action: () => actions.current.onChangeViewMode('preview'),
      },
      {
        id: 'cmd-raw',
        title: 'Switch to Raw Code Editor',
        subtitle: 'Edit markdown source text in monospaced editor',
        icon: <Code className="w-4 h-4 text-purple-500" />,
        action: () => actions.current.onChangeViewMode('raw'),
      },
      {
        id: 'cmd-split',
        title: 'Switch to Split Dual View',
        subtitle: 'Side-by-side live editor and rendered preview',
        icon: <Columns2 className="w-4 h-4 text-indigo-500" />,
        action: () => actions.current.onChangeViewMode('split'),
      },
      {
        id: 'cmd-print',
        title: 'Print / Save as PDF...',
        subtitle: 'Print formatted document or export to PDF (Ctrl+P)',
        icon: <Printer className="w-4 h-4 text-amber-500" />,
        action: actions.current.onPrintPdf,
      },
      {
        id: 'cmd-samples',
        title: 'Browse Sample Markdown Library',
        subtitle: 'Templates, syntax cheatsheets, and guides',
        icon: <Sparkles className="w-4 h-4 text-amber-500" />,
        action: actions.current.onOpenSampleLibrary,
      },
    ].filter((c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q));

    return [...matchedFiles, ...commands];
    // Only the query and the library affect the result. The action callbacks are
    // read through `actions` precisely so they stay out of this list.
  }, [debouncedQuery, recentFiles]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % (items.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 + items.length) % (items.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/70 backdrop-blur-sm animate-in fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-100 ${
          isLight
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Search Input */}
        <div className={`flex items-center gap-3 px-4.5 py-3.5 border-b ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search opened files..."
            className={`flex-1 bg-transparent text-sm ${
              isLight ? 'text-slate-900 placeholder-slate-400' : 'text-slate-100 placeholder-slate-500'
            }`}
            autoFocus
          />
          <kbd className={`text-[10px] px-2 py-0.5 rounded border font-mono ${
            isLight ? 'bg-white text-slate-600 border-slate-300' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-84 overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching commands or files found
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => {
                  item.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition ${
                  selectedIndex === idx
                    ? isLight
                      ? 'bg-sky-50 text-sky-950 border border-sky-200'
                      : 'bg-sky-600/20 text-white border border-sky-500/30'
                    : isLight
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="shrink-0">{item.icon}</div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-xs sm:text-sm font-semibold truncate">{item.title}</div>
                  <div className={`text-[11px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {item.subtitle}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={`px-4.5 py-2.5 border-t flex items-center justify-between text-[11px] ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/80 border-slate-800 text-slate-500'
        }`}>
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>VeloxMD Command Palette</span>
        </div>
      </div>
    </div>
  );
};
