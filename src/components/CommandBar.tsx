import React from 'react';
import {
  FilePlus,
  FolderOpen,
  Save,
  FileDown,
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
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,

  WrapText,
  ZoomIn,
  ZoomOut,
  Keyboard,
  Link2,
  Unlink2,
} from 'lucide-react';
import { ViewMode } from '../types';

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

  return (
    <div className={`h-10 border-b px-3 flex items-center justify-between gap-2 overflow-x-auto text-xs no-scrollbar select-none transition-colors duration-150 ${
      isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-300'
    }`}>
      {/* File Action Commands */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onNewFile}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition font-medium ${
            isLight ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-slate-800 text-slate-200'
          }`}
          title="New Document (Ctrl+N)"
        >
          <FilePlus className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          onClick={onOpenFile}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition font-medium ${
            isLight ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-slate-800 text-slate-200'
          }`}
          title="Open MD File from Windows (Ctrl+O)"
        >
          <FolderOpen className="w-4 h-4 text-amber-500" />
          <span className="hidden sm:inline">Open</span>
        </button>

        {!isHomeView && (
          <>
            <button
              onClick={onSave}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition font-medium ${
                isDirty
                  ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs'
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
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition font-medium ${
                isLight ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-slate-800 text-slate-200'
              }`}
              title="Save as another file in Windows (Ctrl+Shift+S)"
            >
              <FileDown className="w-4 h-4 text-emerald-500" />
              <span className="hidden md:inline">Save As</span>
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
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition text-xs ${
                viewMode === 'preview'
                  ? 'bg-sky-600 text-white font-semibold shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Preview Mode: Formatted markdown"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>

            <button
              onClick={() => onChangeViewMode('raw')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition text-xs ${
                viewMode === 'raw'
                  ? 'bg-sky-600 text-white font-semibold shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Raw Mode: Monospaced code editor"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Raw</span>
            </button>

            <button
              onClick={() => onChangeViewMode('split')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition text-xs ${
                viewMode === 'split'
                  ? 'bg-sky-600 text-white font-semibold shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Split Mode: Side-by-side Raw Editor and Live Preview"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Split</span>
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
                <Link2 className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <Unlink2 className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>Sync Scroll: {syncScroll ? 'On' : 'Off'}</span>
            </button>
          )}

          {/* Formatting tools for Raw / Edit mode */}
          <div className="hidden xl:flex items-center gap-0.5">
            <div className={`h-4 w-px mx-1 ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`} />
            <button
              onClick={() => onInsertMarkdown('**', '**', 'bold text')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-800 font-bold' : 'hover:bg-slate-800 text-slate-200 font-bold'}`}
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('*', '*', 'italic text')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-800 italic' : 'hover:bg-slate-800 text-slate-200 italic'}`}
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('~~', '~~', 'strikethrough')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('# ', '', 'Heading 1')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Heading 1"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('## ', '', 'Heading 2')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Heading 2"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('> ', '', 'Quote text')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Blockquote"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('`', '`', 'code')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Inline Code"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('- [ ] ', '', 'Task item')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Task Checklist"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('- ', '', 'Bullet item')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Bulleted List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Insert Table"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('![Image description](', ')', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Insert Responsive Image"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onInsertMarkdown('[', '](https://example.com)', 'Link title')}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Insert Link"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right controls: Word Wrap, Font Zoom, Shortcuts Help, Export */}
          <div className="flex items-center gap-1.5">
            {onToggleWordWrap && (
              <button
                onClick={onToggleWordWrap}
                className={`p-1.5 rounded transition ${
                  wordWrap
                    ? 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/60 font-semibold'
                    : isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title={`Toggle Word Wrap (${wordWrap ? 'On' : 'Off'})`}
              >
                <WrapText className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Font Zoom Controls */}
            {onZoomOut && (
              <button
                onClick={onZoomOut}
                className={`p-1.5 rounded transition flex items-center justify-center ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
                title="Decrease font zoom (A-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            )}

            {onZoomIn && (
              <button
                onClick={onZoomIn}
                className={`p-1.5 rounded transition flex items-center justify-center ${isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
                title="Increase font zoom (A+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            )}

            {/* Keyboard Shortcuts Help Button */}
            <button
              onClick={onOpenShortcuts}
              className={`flex items-center gap-1 px-2.5 py-1 rounded border transition font-medium ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-300 text-slate-800'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title="Keyboard Shortcuts Reference (Ctrl+S, Ctrl+O, Ctrl+N, Ctrl+K)"
            >
              <Keyboard className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span className="hidden md:inline text-[11px]">Shortcuts</span>
            </button>

            {/* Export Button with original neutral styling and purple icon */}
            <button
              type="button"
              onClick={onOpenExportModal}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition font-medium text-xs ${
                isLight ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
              }`}
              title="Export Document (Download Markdown, HTML, PDF, or copy to clipboard)"
            >
              <FileDown className="w-3.5 h-3.5 text-purple-500" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
