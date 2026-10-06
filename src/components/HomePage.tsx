import React, { useState, useMemo } from 'react';
import {
  FolderOpen,
  FilePlus,
  Search,
  Star,
  Trash2,
  FileText,
  Sparkles,
  Copy,
  Check,
  CornerDownRight,
  History,
} from 'lucide-react';
import { MarkdownFileRecord } from '../types';
import { formatFileSize, formatTimestamp } from '../services/markdown';
import { searchMarkdownFiles } from '../services/search';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { AppLogo } from './AppLogo';

interface HomePageProps {
  recentFiles: MarkdownFileRecord[];
  theme?: 'dark' | 'light';
  onOpenFileById: (fileId: string, targetLine?: number) => void;
  onOpenLocalFile: () => void;
  onNewFile: () => void;
  onOpenSampleLibrary: () => void;
  onTogglePin: (fileId: string) => void;
  onDeleteRecord: (fileId: string) => void;
  onClearHistory: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  recentFiles,
  theme = 'dark',
  onOpenFileById,
  onOpenLocalFile,
  onNewFile,
  onOpenSampleLibrary,
  onTogglePin,
  onDeleteRecord,
  onClearHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);
  const isLight = theme === 'light';

  // Full-text search with context snippets
  // Debounced. A full-text scan of the library costs ~11ms per keystroke on a
  // 120-file / 2.2MB corpus, which is most of a frame budget spent before React
  // has even rendered. The input stays instant; the results catch up.
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  // One definition of "the user is searching". These call sites previously mixed
  // truthiness with trim(), so a single space - truthy but blank - blanked the
  // results, the pinned section and the history table at once while the header
  // still claimed to be searching for it.
  const hasQuery = debouncedSearchQuery.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!hasQuery) return [];
    return searchMarkdownFiles(recentFiles, debouncedSearchQuery);
  }, [recentFiles, debouncedSearchQuery, hasQuery]);

  // Pinned items
  const pinnedFiles = useMemo(() => {
    return recentFiles.filter((f) => f.isPinned);
  }, [recentFiles]);

  const handleCopyPath = (fileId: string, path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedPathId(fileId);
    setTimeout(() => {
      setCopiedPathId(null);
    }, 2000);
  };

  return (
    <div className={`h-full overflow-y-auto p-6 md:p-10 select-none transition-colors duration-150 ${
      isLight
        ? 'bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200/50 text-slate-800'
        : 'bg-gradient-to-b from-slate-900/60 to-slate-950 text-slate-100'
    }`}>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* App Hero Header */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-2.5 rounded-2xl border shadow-lg ${
              isLight
                ? 'bg-gradient-to-br from-sky-100 to-indigo-100 border-sky-300 shadow-sky-200/50'
                : 'bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border-sky-500/30 shadow-sky-950/40'
            }`}>
              <AppLogo size={58} className="w-14 h-14" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-2xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Velox Markdown Studio
                </h1>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  isLight
                    ? 'bg-sky-100 text-sky-700 border-sky-300'
                    : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                }`}>
                  Windows Edition
                </span>
              </div>
              <p className={`text-sm mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                The Fluent Markdown Workbench for Windows • Permanent File History & Full-Text Search
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={onOpenLocalFile}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-600 text-white font-medium text-xs shadow-md shadow-sky-900/30 transition hover:scale-[1.02]"
              title="Open any .md file directly from Windows File Explorer (Ctrl+O)"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Open Windows MD File</span>
            </button>

            <button
              onClick={onNewFile}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs border transition ${
                isLight
                  ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
              }`}
              title="Create new markdown document (Ctrl+N)"
            >
              <FilePlus className="w-4 h-4 text-emerald-500" />
              <span>New Document</span>
            </button>

            <button
              onClick={onOpenSampleLibrary}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-medium text-xs border transition ${
                isLight
                  ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Explore sample markdown files"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Sample Library</span>
            </button>
          </div>
        </div>



        {/* Dedicated Full-Text Keyword Search Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              <Search className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Full-Text Content Search</span>
            </label>
            {hasQuery && (
              <span className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Found {searchResults.length} file{searchResults.length === 1 ? '' : 's'} matching "
                {debouncedSearchQuery.trim()}"
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across all indexed Markdown files (type keywords like 'consensus', 'guide', 'Windows', 'API', etc.)..."
              className={`w-full border rounded-2xl pl-11 pr-24 py-3.5 text-sm transition shadow-inner ${
                isLight
                  ? 'bg-white border-slate-300 focus:border-sky-500 text-slate-900 placeholder-slate-400'
                  : 'bg-slate-900/90 border-slate-700/80 focus:border-sky-500 text-slate-100 placeholder-slate-500'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute right-3.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs transition ${
                  isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                Clear
              </button>
            )}
          </div>

          {/* Search Results with Context Snippets */}
          {hasQuery && (
            <div className="space-y-4 pt-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--velox-muted)]">
                <FileText className="w-3.5 h-3.5 text-sky-500" />
                <span>Search Results with Context ({searchResults.length})</span>
              </div>

              {searchResults.length === 0 ? (
                <div className={`p-8 rounded-2xl border text-center ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}>
                  <p className={`text-sm font-medium ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                    No files found containing "{searchQuery}"
                  </p>
                  <p className="text-xs text-[var(--velox-muted)] mt-1">
                    Try searching for other keywords, or open new Markdown files to index their contents.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {searchResults.map(({ file, matchesCount, snippets }) => (
                    <div
                      key={file.id}
                      onClick={() => onOpenFileById(file.id)}
                      className={`group p-4.5 rounded-2xl border shadow-md cursor-pointer transition space-y-3 ${
                        isLight
                          ? 'bg-white border-slate-200 hover:border-sky-500 shadow-slate-200/50'
                          : 'bg-slate-900/90 border-slate-800 hover:border-sky-500/50 hover:shadow-sky-950/20'
                      }`}
                    >
                      {/* File Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <FileText className="w-4.5 h-4.5 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className={`text-sm font-semibold transition truncate ${
                                isLight ? 'text-slate-900 group-hover:text-sky-600' : 'text-white group-hover:text-sky-300'
                              }`}>
                                {file.name}
                              </h4>
                              <span className={`text-[10px] px-2 py-0.2 rounded-full font-mono border ${
                                isLight
                                  ? 'bg-sky-50 text-sky-700 border-sky-300'
                                  : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                              }`}>
                                {matchesCount} match{matchesCount === 1 ? '' : 'es'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--velox-muted)] font-mono truncate max-w-xl">
                              {file.path}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFileById(file.id);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium transition shrink-0"
                        >
                          Open Document
                        </button>
                      </div>

                      {/* Context Snippets with Line Jump */}
                      <div className={`space-y-2 p-3 rounded-xl border ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800/80'
                      }`}>
                        {snippets.map((snip, idx) => (
                          <div
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenFileById(file.id, snip.lineNumber);
                            }}
                            className={`flex items-start gap-2.5 text-xs font-mono leading-relaxed p-1 rounded transition hover:bg-sky-500/10 ${
                              isLight ? 'text-slate-700' : 'text-slate-300'
                            }`}
                            title={`Jump to line ${snip.lineNumber}`}
                          >
                            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-0.5 select-none shrink-0 pt-0.5">
                              <CornerDownRight className="w-3 h-3" />
                              Line {snip.lineNumber}:
                            </span>
                            <div className="flex-1 break-words">
                              <span className="text-[var(--velox-muted)]">{snip.prefix}</span>
                              <mark className="bg-amber-400 text-slate-950 px-1 py-0.5 rounded font-semibold mx-0.5">
                                {snip.match}
                              </mark>
                              <span className="text-[var(--velox-muted)]">{snip.suffix}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* File Metadata footer */}
                      <div className="flex items-center justify-between text-[11px] text-[var(--velox-muted)] pt-1">
                        <span>{file.wordCount} words • {formatFileSize(file.size)}</span>
                        <span>Opened {formatTimestamp(file.lastOpened)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Access (Pinned Documents) */}
        {!hasQuery && pinnedFiles.length > 0 && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>Quick Access • Pinned Documents</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pinnedFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={() => onOpenFileById(file.id)}
                  className={`group relative rounded-2xl border p-4.5 transition-all duration-200 cursor-pointer shadow-md hover:translate-y-[-2px] ${
                    isLight
                      ? 'bg-white border-slate-200 hover:border-sky-500 shadow-slate-200/50'
                      : 'bg-slate-900/90 border-slate-800 hover:border-sky-500/50 hover:shadow-sky-950/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                      <h4 className={`text-sm font-semibold truncate ${
                        isLight ? 'text-slate-900 group-hover:text-sky-600' : 'text-slate-200 group-hover:text-sky-300'
                      }`}>
                        {file.name}
                      </h4>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(file.id);
                      }}
                      className="text-amber-500 hover:text-slate-400 p-1 rounded"
                      title="Unpin"
                    >
                      <Star className="w-4 h-4 fill-amber-500" />
                    </button>
                  </div>

                  <p className={`text-xs line-clamp-2 mt-2 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    {file.content.replace(/^#+\s+/gm, '').substring(0, 140)}...
                  </p>

                  <div className={`flex items-center justify-between mt-4 pt-3 border-t text-[11px] text-[var(--velox-muted)] ${
                    isLight ? 'border-slate-100' : 'border-slate-800'
                  }`}>
                    <span className="font-mono truncate max-w-[150px]">{file.path}</span>
                    <span>{formatTimestamp(file.lastOpened)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently Opened Files History Section */}
        {!hasQuery && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h2 className={`text-sm font-semibold tracking-wide uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  File History • Recently Opened ({recentFiles.length} files)
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClearHistory}
                  className={`text-xs transition flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                    isLight ? 'text-slate-600 hover:text-rose-600 hover:bg-slate-200' : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800/80'
                  }`}
                  title="Clear all stored file history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              </div>
            </div>

            {recentFiles.length === 0 ? (
              <div className={`rounded-2xl border border-dashed p-12 text-center ${
                isLight ? 'bg-white border-slate-300' : 'bg-slate-900/30 border-slate-800'
              }`}>
                <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className={`text-sm font-medium ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                  File History is Empty
                </p>
                <p className="text-xs text-[var(--velox-muted)] mt-1 max-w-sm mx-auto">
                  Open a Markdown file from your Windows PC or choose from the sample library to begin tracking history.
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    onClick={onOpenLocalFile}
                    className="px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium"
                  >
                    Open Windows File
                  </button>
                  <button
                    onClick={onOpenSampleLibrary}
                    className={`px-4 py-2 rounded-xl text-xs font-medium border ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    Load Sample Files
                  </button>
                </div>
              </div>
            ) : (
              <div className={`rounded-2xl border overflow-hidden shadow-lg ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={`border-b select-none ${
                      isLight ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-slate-900/90 text-slate-400 border-slate-800'
                    }`}>
                      <tr>
                        <th className="py-3 px-4 font-semibold">Document</th>
                        <th className="py-3 px-3 font-semibold">Windows File Path</th>
                        <th className="py-3 px-3 font-semibold hidden md:table-cell">Size & Metrics</th>
                        <th className="py-3 px-3 font-semibold hidden sm:table-cell">Last Opened</th>
                        <th className="py-3 px-4 font-semibold text-right">Quick Access</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800/60'}`}>
                      {recentFiles.map((file) => (
                        <tr
                          key={file.id}
                          onClick={() => onOpenFileById(file.id)}
                          className={`cursor-pointer transition group ${
                            isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'
                          }`}
                        >
                          {/* Name & Pin */}
                          <td className={`py-3.5 px-4 font-medium ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                            <div className="flex items-center gap-2.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTogglePin(file.id);
                                }}
                                className="text-slate-400 hover:text-amber-500 p-0.5 rounded transition"
                                title={file.isPinned ? 'Unpin' : 'Pin to Quick Access'}
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    file.isPinned ? 'text-amber-500 fill-amber-500' : ''
                                  }`}
                                />
                              </button>
                              <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                              <div className="truncate max-w-[180px] sm:max-w-xs">
                                <span className={`transition ${isLight ? 'group-hover:text-sky-600' : 'group-hover:text-sky-300'}`}>
                                  {file.name}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Full Windows Path & Copy */}
                          <td className="py-3.5 px-3 font-mono text-[11px]">
                            <div className="flex items-center gap-2 group/path max-w-sm">
                              <span className={`truncate ${isLight ? 'text-slate-600 group-hover:text-slate-900' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                {file.path}
                              </span>
                              <button
                                onClick={(e) => handleCopyPath(file.id, file.path, e)}
                                className="opacity-40 group-hover/path:opacity-100 hover:text-sky-600 p-1 rounded transition"
                                title="Copy full Windows file path"
                              >
                                {copiedPathId === file.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Size & Metrics */}
                          <td className="py-3.5 px-3 text-[11px] text-[var(--velox-muted)] hidden md:table-cell">
                            <div>{file.wordCount} words</div>
                            <div className="text-[10px]">{formatFileSize(file.size)}</div>
                          </td>

                          {/* Last Opened */}
                          <td className="py-3.5 px-3 text-[11px] text-[var(--velox-muted)] hidden sm:table-cell">
                            {formatTimestamp(file.lastOpened)}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => onOpenFileById(file.id)}
                                className="px-3 py-1 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-[11px] font-medium transition"
                                title="Open in viewer"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => onDeleteRecord(file.id)}
                                className={`p-1.5 rounded transition ${
                                  isLight ? 'text-slate-400 hover:text-rose-600 hover:bg-slate-100' : 'text-[var(--velox-muted)] hover:text-rose-400 hover:bg-slate-800'
                                }`}
                                title="Remove from history"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
