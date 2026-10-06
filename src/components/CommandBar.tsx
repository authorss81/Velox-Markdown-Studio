import React, { useEffect, useRef, useState } from 'react';
import {
  FilePlus,
  FolderOpen,
  Save,
  FileDown,
  Share2,
  Eye,
  Code,
  Columns2,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  CheckSquare,
  Quote,
  SquareCode,
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  MoreHorizontal,
  WrapText,
  ZoomIn,
  ZoomOut,
  Keyboard,
  Link2,
  Unlink2,
} from 'lucide-react';
import { ViewMode } from '../types';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface CommandBarProps {
  viewMode: ViewMode;
  theme?: 'dark' | 'light';
  wordWrap?: boolean;
  syncScroll?: boolean;
  onToggleSyncScroll?: () => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onInsertMarkdown: (prefix: string, suffix?: string, defaultText?: string) => void;
  onOpenExportModal: () => void;
  onOpenShortcuts: () => void;
  onToggleWordWrap?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  isDirty: boolean;
  hasHandle: boolean;
  isHomeView: boolean;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  viewMode,
  theme = 'dark',
  wordWrap = true,
  syncScroll = true,
  onToggleSyncScroll,
  onChangeViewMode,
  onNewFile,
  onOpenFile,
  onSave,
  onSaveAs,
  onInsertMarkdown,
  onOpenExportModal,
  onOpenShortcuts,
  onToggleWordWrap,
  onZoomIn,
  onZoomOut,
  isDirty,
  hasHandle,
  isHomeView,
}) => {
  const isLight = theme === 'light';

  // One source for the twelve formatting actions, rendered inline on wide
  // windows and inside the overflow menu on narrow ones. Duplicating the
  // buttons in two places would desync them; this way there is only one list.
  const formatTools = [
    { key: 'bold', label: 'Bold (Ctrl+B)', icon: <Bold className="w-4 h-4" />, run: () => onInsertMarkdown('**', '**', 'bold text'), extra: 'font-bold' },
    { key: 'italic', label: 'Italic (Ctrl+I)', icon: <Italic className="w-4 h-4" />, run: () => onInsertMarkdown('*', '*', 'italic text'), extra: 'italic' },
    { key: 'strike', label: 'Strikethrough', icon: <Strikethrough className="w-4 h-4" />, run: () => onInsertMarkdown('~~', '~~', 'strikethrough'), extra: '' },
    { key: 'h1', label: 'Heading 1', icon: <Heading1 className="w-4 h-4" />, run: () => onInsertMarkdown('# ', '', 'Heading 1'), extra: '' },
    { key: 'h2', label: 'Heading 2', icon: <Heading2 className="w-4 h-4" />, run: () => onInsertMarkdown('## ', '', 'Heading 2'), extra: '' },
    { key: 'quote', label: 'Blockquote', icon: <Quote className="w-4 h-4" />, run: () => onInsertMarkdown('> ', '', 'Quote text'), extra: '' },
    { key: 'code', label: 'Inline Code', icon: <SquareCode className="w-4 h-4" />, run: () => onInsertMarkdown('`', '`', 'code'), extra: '' },
    { key: 'task', label: 'Task Checklist', icon: <CheckSquare className="w-4 h-4" />, run: () => onInsertMarkdown('- [ ] ', '', 'Task item'), extra: '' },
    { key: 'bullet', label: 'Bulleted List', icon: <List className="w-4 h-4" />, run: () => onInsertMarkdown('- ', '', 'Bullet item'), extra: '' },
    { key: 'table', label: 'Insert Table', icon: <TableIcon className="w-4 h-4" />, run: () => onInsertMarkdown('| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n'), extra: '' },
    { key: 'image', label: 'Insert Responsive Image', icon: <ImageIcon className="w-4 h-4" />, run: () => onInsertMarkdown('![Image description](', ')', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800'), extra: '' },
    { key: 'link', label: 'Insert Link', icon: <LinkIcon className="w-4 h-4" />, run: () => onInsertMarkdown('[', '](https://example.com)', 'Link title'), extra: '' },
  ];

  const formatButtonClass = (extra: string) =>
    `h-7 w-7 inline-flex items-center justify-center rounded transition ${extra ? `${extra} ` : ''}${
      isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
    }`;

  // Wide enough for the inline format group (about 400px of buttons); below
  // that they collapse into the overflow menu so Export is never scrolled away.
  const showFormatInline = useMediaQuery('(min-width: 1280px)');
  // One breakpoint for every toolbar label instead of six scattered prefixes
  // that changed the toolbar at six different widths.
  const showLabels = useMediaQuery('(min-width: 1024px)');

  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const formatMenuButtonRef = useRef<HTMLButtonElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const [formatMenuPos, setFormatMenuPos] = useState({ top: 0, left: 0 });

  const openFormatMenu = () => {
    const rect = formatMenuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setFormatMenuPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 248) });
    }
    setFormatMenuOpen(true);
  };

  useEffect(() => {
    if (!formatMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!formatMenuRef.current?.contains(el) && !formatMenuButtonRef.current?.contains(el)) {
        setFormatMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFormatMenuOpen(false);
        formatMenuButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [formatMenuOpen]);

  return (
    <div className={`h-10 border-b px-4 flex items-center justify-between gap-2 overflow-x-auto text-xs no-scrollbar select-none transition-colors duration-150 ${
      isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-300'
    }`}>
      {/* File Action Commands */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onNewFile}
          className={`flex items-center gap-1.5 px-2.5 h-7 rounded transition font-medium ${
            isLight ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-slate-800 text-slate-200'
          }`}
          title="New Document (Ctrl+N)"
        >
          <FilePlus className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          {showLabels && <span>New</span>}
        </button>

        <button
          onClick={onOpenFile}
          className={`flex items-center gap-1.5 px-2.5 h-7 rounded transition font-medium ${
            isLight ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-slate-800 text-slate-200'
          }`}
          title="Open MD File from Windows (Ctrl+O)"
        >
          <FolderOpen className="w-4 h-4 text-amber-500" />
          {showLabels && <span>Open</span>}
        </button>

        {!isHomeView && (
          <>
            <button
              onClick={onSave}
              className={`flex items-center gap-1.5 px-2.5 h-7 rounded transition font-medium ${
                isDirty
                  ? 'bg-sky-700 hover:bg-sky-600 text-white shadow-xs'
                  : isLight
                  ? 'hover:bg-slate-100 text-slate-700'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
              title={
                hasHandle
                  ? 'Save directly to Windows Disk (Ctrl+S)'
                  : 'Save File (Ctrl+S)'
              }
            >
              <Save className="w-4 h-4" />
              <span>Save</span>
              {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
            </button>

            <button
              onClick={onSaveAs}
              className={`flex items-center gap-1.5 px-2.5 h-7 rounded transition font-medium ${
                isLight ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-slate-800 text-slate-200'
              }`}
              title="Save as another file in Windows (Ctrl+Shift+S)"
            >
              <FileDown className="w-4 h-4 text-emerald-500" />
              {showLabels && <span>Save As</span>}
            </button>
          </>
        )}
      </div>

      {!isHomeView && (
        <>
          <div className={`h-4 w-px hidden sm:block ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`} />

          {/* View Modes (Preview vs Raw vs Split) */}
          <div className={`flex items-center p-0.5 rounded-lg border ${
            isLight ? 'bg-slate-100 border-slate-300/80' : 'bg-slate-950 border-slate-800'
          }`}>
            <button
              onClick={() => onChangeViewMode('preview')}
              className={`flex items-center gap-1.5 px-2.5 h-6 rounded-md transition text-xs ${
                viewMode === 'preview'
                  ? 'bg-sky-700 text-white font-semibold shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Preview Mode: Formatted markdown"
            >
              <Eye className="w-4 h-4" />
              <span>Preview</span>
            </button>

            <button
              onClick={() => onChangeViewMode('raw')}
              className={`flex items-center gap-1.5 px-2.5 h-6 rounded-md transition text-xs ${
                viewMode === 'raw'
                  ? 'bg-sky-700 text-white font-semibold shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Raw Mode: Monospaced code editor"
            >
              <Code className="w-4 h-4" />
              <span>Raw</span>
            </button>

            <button
              onClick={() => onChangeViewMode('split')}
              className={`flex items-center gap-1.5 px-2.5 h-6 rounded-md transition text-xs ${
                viewMode === 'split'
                  ? 'bg-sky-700 text-white font-semibold shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Split Mode: Side-by-side Raw Editor and Live Preview"
            >
              <Columns2 className="w-4 h-4" />
              {showLabels && <span>Split</span>}
            </button>
          </div>

          {/* Sync Scroll Toggle (prominently displayed in Split Mode) */}
          {viewMode === 'split' && onToggleSyncScroll && (
            <button
              onClick={onToggleSyncScroll}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                syncScroll
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 font-semibold'
                  : isLight
                  ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
              title={`Synchronized Scrolling: ${syncScroll ? 'Enabled (Editor & Preview scroll together)' : 'Disabled'}`}
            >
              {syncScroll ? (
                <Link2 className="w-4 h-4 text-sky-400" />
              ) : (
                <Unlink2 className="w-4 h-4 text-slate-400" />
              )}
              <span>Sync Scroll: {syncScroll ? 'On' : 'Off'}</span>
            </button>
          )}

          {/* Formatting tools for Raw / Edit mode */}
          {showFormatInline ? (
            <div className="flex items-center gap-0.5">
              <div className={`h-4 w-px mx-1 ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`} />
              {formatTools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={tool.run}
                  className={formatButtonClass(tool.extra)}
                  title={tool.label}
                  aria-label={tool.label}
                >
                  {tool.icon}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center">
              <div className={`h-4 w-px mx-1 ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`} />
              <button
                ref={formatMenuButtonRef}
                onClick={() => (formatMenuOpen ? setFormatMenuOpen(false) : openFormatMenu())}
                className={`h-7 w-7 inline-flex items-center justify-center rounded transition ${
                  isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
                }`}
                title="Formatting tools"
                aria-label="Formatting tools"
                aria-haspopup="menu"
                aria-expanded={formatMenuOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {formatMenuOpen && (
                <div
                  ref={formatMenuRef}
                  role="menu"
                  aria-label="Formatting tools"
                  style={{ top: formatMenuPos.top, left: formatMenuPos.left }}
                  className={`fixed z-[70] w-60 rounded-xl border p-2 shadow-2xl animate-in fade-in ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  <div className="grid grid-cols-6 gap-1">
                    {formatTools.map((tool) => (
                      <button
                        key={tool.key}
                        role="menuitem"
                        onClick={() => {
                          tool.run();
                          setFormatMenuOpen(false);
                        }}
                        className={formatButtonClass(tool.extra)}
                        title={tool.label}
                        aria-label={tool.label}
                      >
                        {tool.icon}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Right controls: Word Wrap, Font Zoom, Shortcuts Help, Export */}
          <div className="flex items-center gap-1.5">
            {onToggleWordWrap && (
              <button
                onClick={onToggleWordWrap}
                className={`h-7 w-7 inline-flex items-center justify-center rounded transition ${
                  wordWrap
                    ? 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/60 font-semibold'
                    : isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title={`Toggle Word Wrap (${wordWrap ? 'On' : 'Off'})`}
              >
                <WrapText className="w-4 h-4" />
              </button>
            )}

            {/* Font Zoom Controls */}
            {onZoomOut && (
              <button
                onClick={onZoomOut}
                className={`h-7 w-7 inline-flex items-center justify-center rounded transition flex items-center justify-center ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
                title="Decrease font zoom (A-)" aria-label="Decrease font zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            )}

            {onZoomIn && (
              <button
                onClick={onZoomIn}
                className={`h-7 w-7 inline-flex items-center justify-center rounded transition flex items-center justify-center ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
                title="Increase font zoom (A+)" aria-label="Increase font zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            )}

            {/* Keyboard Shortcuts Help Button */}
            <button
              onClick={onOpenShortcuts}
              className={`flex items-center gap-1 px-2.5 h-7 rounded border transition font-medium ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-300 text-slate-800'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title="Keyboard Shortcuts Reference (Ctrl+S, Ctrl+O, Ctrl+N, Ctrl+K)"
            >
              <Keyboard className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              {showLabels && <span className="text-2xs">Shortcuts</span>}
            </button>

            {/* Export Button with original neutral styling and purple icon */}
            <button
              type="button"
              onClick={onOpenExportModal}
              className={`flex items-center gap-1.5 px-2.5 h-7 rounded transition font-medium text-xs ${
                isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
              }`}
              title="Export Document (Download Markdown, HTML, PDF, or copy to clipboard)"
            >
              <Share2 className="w-4 h-4 text-purple-500" />
              {showLabels && <span>Export</span>}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
