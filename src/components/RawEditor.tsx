import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Search, X, ArrowUp, ArrowDown, Replace } from 'lucide-react';

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
  onTargetLineHandled?: () => void;
  onCursorChange?: (line: number, col: number) => void;
  onScrollPercentage?: (percentage: number) => void;
}

export const RawEditor = forwardRef<RawEditorHandle, RawEditorProps>(({
  content,
  onChange,
  fontSize = 16,
  wordWrap = true,
  theme = 'dark',
  targetLine,
  onTargetLineHandled,
  onCursorChange,
  onScrollPercentage,
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  // Mirrors the latest content so callbacks that must not re-fire on every
  // keystroke can read it without taking `content` as a dependency.
  const contentRef = useRef(content);
  contentRef.current = content;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;

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

  // Virtualized gutter. Every row is exactly 24px (h-6), so only the visible
  // window plus overscan needs DOM nodes; spacers preserve the total height so
  // scroll geometry is unaffected. Below the threshold the full list renders as
  // before - virtualization only pays off on long documents.
  const GUTTER_ROW_PX = 24;
  const GUTTER_OVERSCAN = 150;
  const GUTTER_WINDOW_THRESHOLD = 500;
  const [gutterRange, setGutterRange] = useState<{ start: number; end: number } | null>(null);

  const updateGutterRange = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || lines.length <= GUTTER_WINDOW_THRESHOLD) {
      setGutterRange((prev) => (prev === null ? prev : null));
      return;
    }
    const start = Math.max(0, Math.floor(ta.scrollTop / GUTTER_ROW_PX) - GUTTER_OVERSCAN);
    const end = Math.min(
      lines.length,
      Math.ceil((ta.scrollTop + ta.clientHeight) / GUTTER_ROW_PX) + GUTTER_OVERSCAN
    );
    setGutterRange((prev) => (prev && prev.start === start && prev.end === end ? prev : { start, end }));
  }, [lines.length]);

  useEffect(() => {
    updateGutterRange();
  }, [updateGutterRange]);

  // Sync scrolling between line numbers gutter and textarea
  const handleScroll = () => {
    if (textareaRef.current) {
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
      updateGutterRange();
      if (onScrollPercentage) {
        const maxScroll = textareaRef.current.scrollHeight - textareaRef.current.clientHeight;
        const pct = maxScroll > 0 ? textareaRef.current.scrollTop / maxScroll : 0;
        onScrollPercentage(pct);
      }
    }
  };

  // Track cursor position
  const updateCursorPosition = () => {
    const textarea = textareaRef.current;
    const notify = onCursorChangeRef.current;
    if (!textarea || !notify) return;
    const pos = textarea.selectionStart;
    const textBefore = contentRef.current.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    notify(line, col);
  };

  // Jump to specific line.
  //
  // Deliberately has NO dependency on `content`. It used to depend on it, which
  // gave it a new identity on every keystroke; the targetLine effect below then
  // re-fired ~100ms after every character typed, re-selecting the target line
  // and stealing focus back into the textarea. One search-result click made the
  // editor permanently overwrite that line with whatever was typed next.
  const scrollToLine = useCallback((lineNumber: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const linesArr = contentRef.current.split('\n');
    const index = Math.min(Math.max(lineNumber - 1, 0), Math.max(linesArr.length - 1, 0));
    let charIndex = 0;
    for (let i = 0; i < index; i++) {
      charIndex += linesArr[i].length + 1;
    }

    const lineLength = linesArr[index]?.length || 0;
    textarea.focus();
    textarea.setSelectionRange(charIndex, charIndex + lineLength);

    // Derive the scroll offset from the gutter rather than assuming a line
    // height. With word wrap on (the default) N logical lines occupy far more
    // than N * 24px, so the old estimate scrolled somewhere unrelated and the
    // selection landed off-screen. Every row carries data-line so the lookup
    // survives gutter virtualization; spacers preserve total height, so the
    // estimate fallback is exact for the same reason.
    const gutterRow = lineNumbersRef.current?.querySelector(
      `[data-line="${lineNumber}"]`
    ) as HTMLElement | undefined;
    const top = gutterRow ? gutterRow.offsetTop : (lineNumber - 1) * GUTTER_ROW_PX;
    textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textarea.scrollTop;
    }
    updateCursorPosition();
  }, []);

  // Handle external targetLine jump. Consumes the request exactly once, so the
  // parent must clear targetLine via onTargetLineHandled.
  useEffect(() => {
    if (!targetLine || targetLine <= 0) return;
    const id = window.setTimeout(() => {
      scrollToLine(targetLine);
    }, 100);
    onTargetLineHandled?.();
    return () => window.clearTimeout(id);
  }, [targetLine, scrollToLine, onTargetLineHandled]);

  // Handle keyboard shortcuts (Tab, Shift+Tab, Esc, Ctrl+F, Ctrl+H, Ctrl+B, Ctrl+I)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Tab inserts indentation, so keyboard users can never Tab out of the editor
    // by pressing Tab. Escape is the documented exit hatch: it drops focus back
    // to the page, where Tab works normally again.
    if (e.key === 'Escape') {
      textarea.blur();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const TAB = '  ';

      if (e.shiftKey) {
        // Dedent: remove up to 2 leading spaces from every selected line, or
        // from the current line when nothing is selected.
        const selStartLine = contentRef.current.lastIndexOf('\n', start - 1) + 1;
        const selEndLine = contentRef.current.indexOf('\n', end);
        const blockEnd = selEndLine === -1 ? contentRef.current.length : selEndLine;
        const block = contentRef.current.substring(selStartLine, blockEnd);
        const dedented = block
          .split('\n')
          .map((line) => (line.startsWith(TAB) ? line.slice(2) : line.startsWith(' ') ? line.slice(1) : line))
          .join('\n');
        const removed = block.length - dedented.length;
        const newText = contentRef.current.substring(0, selStartLine) + dedented + contentRef.current.substring(blockEnd);
        onChange(newText);
        setTimeout(() => {
          // Clamp the restored selection by how much leading whitespace vanished.
          const deltaStart = Math.min(2, start - selStartLine);
          textarea.selectionStart = Math.max(selStartLine, start - deltaStart);
          textarea.selectionEnd = Math.max(selStartLine, end - removed);
          updateCursorPosition();
        }, 0);
        return;
      }

      // Indent: a multi-line selection indents as a block, a caret inserts two
      // spaces. Previously Tab inserted blindly with no dedent and no way out.
      if (start !== end && contentRef.current.substring(start, end).includes('\n')) {
        const selStartLine = contentRef.current.lastIndexOf('\n', start - 1) + 1;
        const selEndLine = contentRef.current.indexOf('\n', end);
        const blockEnd = selEndLine === -1 ? contentRef.current.length : selEndLine;
        const block = contentRef.current.substring(selStartLine, blockEnd);
        const lines = block.split('\n').length;
        const indented = block
          .split('\n')
          .map((line) => TAB + line)
          .join('\n');
        const newText = contentRef.current.substring(0, selStartLine) + indented + contentRef.current.substring(blockEnd);
        onChange(newText);
        setTimeout(() => {
          textarea.selectionStart = start + TAB.length;
          textarea.selectionEnd = end + TAB.length * lines;
          updateCursorPosition();
        }, 0);
        return;
      }

      const newText = contentRef.current.substring(0, start) + TAB + contentRef.current.substring(end);
      onChange(newText);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + TAB.length;
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
              className={`rounded px-2.5 py-1 text-xs border focus:border-sky-500 w-48 ${
                isLight ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
              }`}
              autoFocus
            />
            <span className="text-2xs text-slate-400 font-sans min-w-[55px] text-center">
              {searchResults.length > 0 ? `${currentMatchIndex + 1}/${searchResults.length}` : '0 results'}
            </span>
            <button
              onClick={goToPrevMatch}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Previous match" aria-label="Previous match"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={goToNextMatch}
              className={`p-1 rounded transition ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-slate-800 text-slate-300'}`}
              title="Next match" aria-label="Next match"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowReplace(!showReplace)}
              className={`p-1 rounded transition ${showReplace ? 'text-sky-500 font-bold' : isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}
              title="Toggle Replace" aria-label="Toggle replace"
            >
              <Replace className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowSearch(false)}
              className={`p-1 rounded transition ${isLight ? 'text-slate-400 hover:text-slate-800' : 'text-slate-400 hover:text-white'}`}
              title="Close find" aria-label="Close find"
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
                className={`rounded px-2.5 py-1 text-xs border focus:border-sky-500 w-48 ${
                  isLight ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                }`}
              />
              <button
                onClick={handleReplaceCurrent}
                disabled={searchResults.length === 0}
                className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white font-medium text-2xs"
              >
                Replace
              </button>
              <button
                onClick={handleReplaceAll}
                disabled={searchResults.length === 0}
                className={`px-2 py-1 rounded font-medium text-2xs border ${
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
        className={`min-w-12 py-4 select-none text-right pr-3 border-r overflow-hidden text-xs leading-relaxed shrink-0 tabular-nums transition-colors ${
          // Line numbers were 2.56:1 (dark) and 2.34:1 (light) - the one element
          // stared at continuously while navigating, and illegible. The dark
          // gutter also used a third unrelated near-black (#090d16) next to the
          // editor's #0d1117 with a 1px border between them; it now matches.
          isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-[#0d1117] border-slate-800/80 text-slate-400'
        }`}
        style={{ fontSize: `${fontSize}px` }}
      >
          {gutterRange ? (
            <>
              {gutterRange.start > 0 && (
                <div style={{ height: gutterRange.start * GUTTER_ROW_PX }} aria-hidden="true" />
              )}
              {lines.slice(gutterRange.start, gutterRange.end).map((_, k) => {
                const i = gutterRange.start + k;
                return (
                  <div key={i} data-line={i + 1} className="h-6 velox-gutter-row">
                    {i + 1}
                  </div>
                );
              })}
              {gutterRange.end < lines.length && (
                <div
                  style={{ height: (lines.length - gutterRange.end) * GUTTER_ROW_PX }}
                  aria-hidden="true"
                />
              )}
            </>
          ) : (
            lines.map((_, i) => (
              <div key={i} data-line={i + 1} className="h-6 velox-gutter-row">
                {i + 1}
              </div>
            ))
          )}
      </div>

      {/* Monospaced Textarea Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyUp={updateCursorPosition}
        onClick={updateCursorPosition}
        onSelect={updateCursorPosition}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="Type Markdown content here..."
        className={`flex-1 h-full py-4 px-4 bg-transparent resize-none leading-relaxed transition-colors ${
          isLight
            ? 'text-slate-900 selection:bg-sky-500/25 selection:text-slate-950 placeholder-slate-500'
            : 'text-slate-100 selection:bg-sky-500/40 selection:text-white placeholder-slate-400'
        } ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}`}
        style={{
          fontSize: `${fontSize}px`,
          // The single --font-mono stack from @theme: the textarea, the preview
          // code and font-mono utilities previously resolved to three different
          // faces on Windows.
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.5rem',
          tabSize: 2,
        }}
      />
    </div>
  );
});

RawEditor.displayName = 'RawEditor';
