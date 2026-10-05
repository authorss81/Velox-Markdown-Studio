import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Search, X, ArrowUp, ArrowDown, Replace, Check } from 'lucide-react';

export interface RawEditorHandle {
  insertText: (prefix: string, suffix?: string, defaultText?: string) => void;
  focus: () => void;
  scrollToLine: (lineNumber: number) => void;
  scrollToPercentage: (percentage: number) => void;
}

interface RawEditorProps {
  content: string;
  onChange: (value: string) => void;
  fontSize?: number;
  wordWrap?: boolean;
  theme?: 'dark' | 'light';
  targetLine?: number | null;
  onCursorChange?: (line: number, col: number) => void;
  onScrollPercentage?: (percentage: number) => void;
}

export const RawEditor = forwardRef<RawEditorHandle, RawEditorProps>(({
  content,
  onChange,
  fontSize = 14,
  wordWrap = true,
  theme = 'dark',
  targetLine,
  onCursorChange,
  onScrollPercentage,
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Search & Replace state
  const [showSearch, setShowSearch] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ start: number; end: number }[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Split lines
  const lines = React.useMemo(() => {
    return content.split('\n');
  }, [content]);

  // Sync scrolling between line numbers gutter and textarea
  const handleScroll = () => {
    if (textareaRef.current) {
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
      if (onScrollPercentage) {
        const maxScroll = textareaRef.current.scrollHeight - textareaRef.current.clientHeight;
        const pct = maxScroll > 0 ? textareaRef.current.scrollTop / maxScroll : 0;
        onScrollPercentage(pct);
      }
    }
  };

  // Track cursor position
  const updateCursorPosition = () => {
    if (!textareaRef.current || !onCursorChange) return;
    const pos = textareaRef.current.selectionStart;
    const textBefore = content.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    onCursorChange(line, col);
  };

  // Jump to specific line
  const scrollToLine = useCallback((lineNumber: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const linesArr = content.split('\n');
    let charIndex = 0;
    for (let i = 0; i < Math.min(lineNumber - 1, linesArr.length); i++) {
      charIndex += linesArr[i].length + 1;
    }

    const lineLength = linesArr[Math.min(lineNumber - 1, linesArr.length - 1)]?.length || 0;
    textarea.focus();
    textarea.setSelectionRange(charIndex, charIndex + lineLength);

    // Approximate line height ~24px
    const lineHeight = 24;
    textarea.scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textarea.scrollTop;
    }
    updateCursorPosition();
  }, [content]);

  // Handle external targetLine jump
  useEffect(() => {
    if (targetLine && targetLine > 0) {
      setTimeout(() => {
        scrollToLine(targetLine);
      }, 100);
    }
  }, [targetLine, scrollToLine]);

  // Handle keyboard shortcuts (Tab, Ctrl+F, Ctrl+H, Ctrl+B, Ctrl+I)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Insert 2 spaces
      const newText = content.substring(0, start) + '  ' + content.substring(end);
      onChange(newText);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        updateCursorPosition();
      }, 0);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setShowSearch(true);
      setShowReplace(false);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      setShowSearch(true);
      setShowReplace(true);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      insertFormatting('**', '**', 'bold text');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertFormatting('*', '*', 'italic text');
    }
  };

  const insertFormatting = (prefix: string, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end) || defaultText;

    const replacement = `${prefix}${selected}${suffix}`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);
    onChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length
      );
      updateCursorPosition();
    }, 0);
  };

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    insertText: insertFormatting,
    focus: () => {
      textareaRef.current?.focus();
    },
    scrollToLine,
    scrollToPercentage: (pct: number) => {
      if (!textareaRef.current) return;
      const maxScroll = textareaRef.current.scrollHeight - textareaRef.current.clientHeight;
      if (maxScroll > 0) {
        textareaRef.current.scrollTop = pct * maxScroll;
      }
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    },
  }));

  // Perform search in file
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const results: { start: number; end: number }[] = [];
    const query = searchQuery.toLowerCase();
    const text = content.toLowerCase();
    let idx = text.indexOf(query);
    while (idx !== -1) {
      results.push({ start: idx, end: idx + query.length });
      idx = text.indexOf(query, idx + query.length);
    }
    setSearchResults(results);
    setCurrentMatchIndex(0);
  }, [searchQuery, content]);

  const goToNextMatch = () => {
    if (searchResults.length === 0 || !textareaRef.current) return;
    const nextIdx = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIdx);
    const match = searchResults[nextIdx];
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(match.start, match.end);
  };

  const goToPrevMatch = () => {
    if (searchResults.length === 0 || !textareaRef.current) return;
    const prevIdx = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prevIdx);
    const match = searchResults[prevIdx];
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(match.start, match.end);
  };

  // Replace single occurrence
  const handleReplaceCurrent = () => {
    if (searchResults.length === 0 || !textareaRef.current) return;
    const match = searchResults[currentMatchIndex];
    const newContent =
      content.substring(0, match.start) + replaceQuery + content.substring(match.end);
    onChange(newContent);
  };

  // Replace all occurrences
  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const newContent = content.replaceAll(searchQuery, replaceQuery);
    onChange(newContent);
  };

  const isLight = theme === 'light';

  return (
    <div className={`relative h-full flex overflow-hidden font-mono select-text transition-colors duration-150 ${
      isLight ? 'bg-white text-slate-900' : 'bg-[#0d1117] text-slate-100'
    }`}>
      {/* Search & Replace Floating Overlay */}
      {showSearch && (
        <div className={`absolute top-3 right-5 z-30 shadow-2xl rounded-xl p-3 flex flex-col gap-2 animate-in fade-in text-xs border ${
          isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
        }`}>
          {/* Find Row */}
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find in document..."
              className={`rounded px-2.5 py-1 text-xs outline-none border focus:border-sky-500 w-48 ${
                isLight ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
              }`}
              autoFocus
            />
            <span className="text-[11px] text-slate-400 font-sans min-w-[55px] text-center">
              {searchResults.length > 0 ? `${currentMatchIndex + 1}/${searchResults.length}` : '0 results'}
            </span>
            <button
              onClick={goToPrevMatch}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Previous match"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={goToNextMatch}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Next match"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowReplace(!showReplace)}
              className={`p-1 rounded transition ${showReplace ? 'text-sky-500 font-bold' : isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}
              title="Toggle Replace"
            >
              <Replace className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowSearch(false)}
              className={`p-1 rounded transition ${isLight ? 'text-slate-400 hover:text-slate-800' : 'text-slate-400 hover:text-white'}`}
              title="Close find"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Replace Row */}
          {showReplace && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
              <span className="w-3.5 text-center text-slate-400">↳</span>
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Replace with..."
                className={`rounded px-2.5 py-1 text-xs outline-none border focus:border-sky-500 w-48 ${
                  isLight ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                }`}
              />
              <button
                onClick={handleReplaceCurrent}
                disabled={searchResults.length === 0}
                className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-[11px]"
              >
                Replace
              </button>
              <button
                onClick={handleReplaceAll}
                disabled={searchResults.length === 0}
                className={`px-2 py-1 rounded font-medium text-[11px] border ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
              >
                Replace All
              </button>
            </div>
          )}
        </div>
      )}

      {/* Line Numbers Gutter */}
      <div
        ref={lineNumbersRef}
        className={`w-12 py-4 select-none text-right pr-3 border-r overflow-hidden text-xs leading-relaxed shrink-0 transition-colors ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-[#090d16] border-slate-800/80 text-slate-600'
        }`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {lines.map((_, i) => (
          <div key={i} className="h-6">
            {i + 1}
          </div>
        ))}
      </div>

      {/* Monospaced Textarea Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyUp={updateCursorPosition}
        onClick={updateCursorPosition}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="Type Markdown content here..."
        className={`flex-1 h-full py-4 px-4 bg-transparent outline-none resize-none leading-relaxed transition-colors ${
          isLight
            ? 'text-slate-900 selection:bg-sky-500/25 selection:text-slate-950 placeholder-slate-400'
            : 'text-slate-100 selection:bg-sky-500/40 selection:text-white placeholder-slate-600'
        } ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}`}
        style={{
          fontSize: `${fontSize}px`,
          fontFamily: '"Cascadia Code", Consolas, "Fira Code", monospace',
          lineHeight: '1.5rem',
          tabSize: 2,
        }}
      />
    </div>
  );
});

RawEditor.displayName = 'RawEditor';
