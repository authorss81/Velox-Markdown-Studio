import React from 'react';
import { AppLogo } from './AppLogo';
import { Search, Minus, Square, X, Sun, Moon } from 'lucide-react';
import { FileTab } from '../types';

interface TitleBarProps {
  activeTab: FileTab | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenSearch: () => void;
  onNewFile: () => void;
  onOpenFile: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  activeTab,
  theme,
  onToggleTheme,
  onOpenSearch,
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const isLight = theme === 'light';

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  return (
    <header className={`h-[42px] select-none backdrop-blur-md border-b flex items-center justify-between px-3.5 z-50 text-xs sm:text-sm transition-colors duration-150 ${
      isLight
        ? 'bg-white/95 border-slate-200 text-slate-800 shadow-2xs'
        : 'bg-slate-900/95 border-slate-800 text-slate-300'
    }`}>
      {/* Left: App Branding & File Title */}
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex items-center gap-2 font-semibold tracking-wide flex-shrink-0">
          <AppLogo size={22} className="w-5.5 h-5.5" />
          <span className={`text-sm font-bold hidden sm:inline ${isLight ? 'text-slate-900' : 'text-white'}`}>
            VeloxMD
          </span>
        </div>

        <div className={`h-4.5 w-px hidden sm:block ${isLight ? 'bg-slate-300' : 'bg-slate-700/80'}`} />

        {/* Current File indicator */}
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={`truncate max-w-[200px] md:max-w-[360px] font-semibold text-xs sm:text-sm ${
            isLight ? 'text-slate-900' : 'text-slate-200'
          }`}>
            {activeTab ? activeTab.name : 'Home — Workbench'}
          </span>
          {activeTab && activeTab.isDirty && (
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse flex-shrink-0" title="Unsaved changes (*)" />
          )}
          {activeTab?.path && (
            <span className={`text-xs truncate hidden lg:inline max-w-[240px] font-mono ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              ({activeTab.path})
            </span>
          )}
        </div>
      </div>

      {/* Middle: Windows Search / Command Palette Bar */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          onClick={onOpenSearch}
          className={`w-full h-7.5 px-3 rounded-lg border flex items-center justify-between transition-colors shadow-2xs text-xs sm:text-sm ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
              : 'bg-slate-800/90 hover:bg-slate-700/80 border-slate-700/80 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 text-slate-400" />
            <span className="truncate">Search MD files, contents or commands...</span>
          </div>
          <kbd className={`text-[11px] px-2 py-0.5 rounded font-mono font-medium border ${
            isLight
              ? 'bg-white text-slate-700 border-slate-300'
              : 'bg-slate-900 text-slate-400 border-slate-700'
          }`}>
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right: Theme Toggle & Windows Caption Controls */}
      <div className="flex items-center gap-2">
        {/* Mobile Search button */}
        <button
          onClick={onOpenSearch}
          className={`md:hidden p-2 rounded-lg transition ${
            isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Search (Ctrl+K)"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Clear Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
            isLight
              ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-300'
          }`}
          title={isLight ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
        >
          {isLight ? (
            <Sun className="w-4 h-4 text-amber-600 fill-amber-500" />
          ) : (
            <Moon className="w-4 h-4 text-sky-400 fill-sky-400" />
          )}
          <span className="hidden sm:inline text-xs">{isLight ? 'Light' : 'Dark'}</span>
        </button>

        {/* Windows 11 Standard Caption Buttons */}
        <div className="flex items-center ml-1">
          <button
            onClick={() => {
              window.blur();
            }}
            className={`w-10 h-10 flex items-center justify-center transition ${
              isLight ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
            title="Minimize"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className={`w-10 h-10 flex items-center justify-center transition ${
              isLight ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
            title={isFullscreen ? 'Restore' : 'Maximize'}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (activeTab) {
                window.close();
              }
            }}
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600 transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
