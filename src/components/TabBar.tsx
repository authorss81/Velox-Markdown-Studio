import React from 'react';
import { FileTab } from '../types';
import { Home, Plus, X, FileText } from 'lucide-react';

interface TabBarProps {
  tabs: FileTab[];
  activeTabId: string | null;
  theme?: 'dark' | 'light';
  onSelectTab: (fileId: string | null) => void;
  onCloseTab: (fileId: string) => void;
  onNewTab: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  theme = 'dark',
  onSelectTab,
  onCloseTab,
  onNewTab,
}) => {
  const isLight = theme === 'light';

  return (
    <div
      role="tablist"
      aria-label="Open documents"
      onKeyDown={(e) => {
        // Roving focus across tabs; arrows also select, matching click.
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const items = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')
        );
        const at = items.indexOf(document.activeElement as HTMLElement);
        if (at === -1) return;
        e.preventDefault();
        const next = items[(at + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
        next?.focus();
        next?.click();
      }}
      className={`h-[42px] border-b flex items-center px-4 gap-1.5 overflow-x-auto select-none no-scrollbar transition-colors duration-150 ${
        isLight ? 'bg-slate-200/90 border-slate-300' : 'bg-slate-950 border-slate-800'
      }`}>
      {/* Home tab */}
      <button
        role="tab"
        aria-selected={activeTabId === null}
        aria-label="Home workbench"
        onClick={() => onSelectTab(null)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs sm:text-sm font-semibold transition-all shrink-0 ${
          activeTabId === null
            ? isLight
              ? 'bg-white text-sky-700 border-t-2 border-sky-600 shadow-xs'
              : 'bg-slate-900 text-sky-400 border-t-2 border-sky-500 shadow-xs'
            : isLight
            ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/70'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
        }`}
        title="Home Workbench & Permanent Memory"
      >
        <Home className="w-4 h-4" />
        <span>Home</span>
      </button>

      {/* Document tabs */}
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.fileId;
        return (
          <div
            key={tab.fileId}
            role="tab"
            aria-selected={isActive}
            aria-label={`${tab.name}${tab.isDirty ? ', unsaved changes' : ''}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelectTab(tab.fileId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTab(tab.fileId);
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                onCloseTab(tab.fileId);
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                onCloseTab(tab.fileId);
              }
            }}
            className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs sm:text-sm font-medium cursor-pointer transition-all border-r max-w-[260px] shrink-0 ${
              isLight ? 'border-slate-300' : 'border-slate-800'
            } ${
              isActive
                ? isLight
                  ? 'bg-white text-slate-900 font-semibold border-t-2 border-sky-600 shadow-xs'
                  : 'bg-slate-900 text-slate-100 font-semibold border-t-2 border-sky-500 shadow-xs'
                : isLight
                ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <FileText className={`w-4 h-4 flex-shrink-0 ${
              isActive
                ? isLight ? 'text-sky-600' : 'text-sky-400'
                : 'text-[var(--velox-muted)]'
            }`} />
            
            <span className="truncate">{tab.name}</span>

            {/* Unsaved indicator dot */}
            {tab.isDirty && (
              <span
                className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0"
                title="Unsaved changes"
              />
            )}

            {/* Always visible and easily clickable Close Cross Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onCloseTab(tab.fileId);
              }}
              className={`w-6 h-6 flex items-center justify-center rounded-md transition shrink-0 ml-1 ${
                isLight
                  ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                  : 'hover:bg-slate-700 text-slate-400 hover:text-white'
              }`}
              title="Close tab (Ctrl+W)"
              aria-label={`Close ${tab.name}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Add New Tab */}
      <button
        onClick={onNewTab}
        className={`p-2 rounded-lg transition ml-1 shrink-0 ${
          isLight
            ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-300/80'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        }`}
        title="New Document (Ctrl+N)"
        aria-label="New document"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
