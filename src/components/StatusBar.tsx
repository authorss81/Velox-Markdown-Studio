import React from 'react';
import { FileTab } from '../types';
import { HardDrive, Check, AlertCircle, FileText } from 'lucide-react';
import { calculateWordCount, calculateReadingTime } from '../services/markdown';

interface StatusBarProps {
  activeTab: FileTab | null;
  cursorLine: number;
  cursorCol: number;
  theme?: 'dark' | 'light';
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  cursorLine,
  cursorCol,
  theme = 'dark',
}) => {
  const content = activeTab?.content || '';
  const wordCount = React.useMemo(() => calculateWordCount(content), [content]);
  const charCount = content.length;
  const readTime = React.useMemo(() => calculateReadingTime(wordCount), [wordCount]);
  const isLight = theme === 'light';

  return (
    <footer className={`h-8 border-t px-3.5 flex items-center justify-between text-xs select-none z-40 transition-colors duration-150 ${
      isLight ? 'bg-white border-slate-200 text-slate-700 shadow-2xs' : 'bg-slate-900 border-slate-800 text-slate-400'
    }`}>
      {/* Left side: Status & File Info */}
      <div className="flex items-center gap-3 truncate">
        {activeTab ? (
          <>
            <div className="flex items-center gap-1.5 font-medium">
              {activeTab.isDirty ? (
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                  <span>Unsaved changes</span>
                </span>
              ) : activeTab.fileHandle ? (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Synced with Windows Disk</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-semibold">
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved in Permanent Memory</span>
                </span>
              )}
            </div>

            <div className={`h-3.5 w-px hidden sm:block ${isLight ? 'bg-slate-300' : 'bg-slate-700/80'}`} />

            <div className={`truncate max-w-[320px] hidden md:block font-mono text-[11px] ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {activeTab.path || activeTab.name}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 font-medium">
            <FileText className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span className={isLight ? 'text-slate-700' : 'text-slate-300'}>
              Velox Markdown Studio • Ready
            </span>
          </div>
        )}
      </div>

      {/* Right side: Editor metrics & Windows environment info */}
      <div className="flex items-center gap-3 flex-shrink-0 font-mono text-xs">
        {activeTab && (
          <>
            <span className="hidden sm:inline font-medium">
              Ln {cursorLine}, Col {cursorCol}
            </span>
            <span className={`h-3.5 w-px hidden sm:block ${isLight ? 'bg-slate-300' : 'bg-slate-700/80'}`} />
            <span className="font-medium">{wordCount} words ({charCount} chars)</span>
            <span className={`h-3.5 w-px hidden lg:block ${isLight ? 'bg-slate-300' : 'bg-slate-700/80'}`} />
            <span className="hidden lg:inline">{readTime} min read</span>
          </>
        )}
        <span className={`h-3.5 w-px ${isLight ? 'bg-slate-300' : 'bg-slate-700/80'}`} />
        <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>UTF-8</span>
        <span className={`h-3.5 w-px ${isLight ? 'bg-slate-300' : 'bg-slate-700/80'}`} />
        <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>CRLF</span>
        <span className={`h-3.5 w-px hidden sm:block ${isLight ? 'bg-slate-300' : 'bg-slate-700/80'}`} />
        <span className="text-sky-600 dark:text-sky-400 font-sans font-semibold hidden sm:inline">Markdown (GFM)</span>
      </div>
    </footer>
  );
};
