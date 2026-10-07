import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { FileText } from 'lucide-react';
import { parseMarkdownWithOutline } from '../services/markdown';
import { ensureLanguages } from '../services/highlight';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { OutlinePanel } from './OutlinePanel';

export interface MarkdownPreviewHandle {
  scrollToPercentage: (percentage: number) => void;
}

interface MarkdownPreviewProps {
  content: string;
  theme?: 'dark' | 'light';
  fontSize?: number;
  /** Compact padding for split mode so both text columns share a top edge. */
  compact?: boolean;
  /** Whether the outline sidebar (MD11) is visible. Off by default. */
  showOutline?: boolean;
  onCloseOutline?: () => void;
  onImageClick?: (src: string, alt: string) => void;
  onContentChange?: (updatedContent: string) => void;
  onScrollPercentage?: (percentage: number) => void;
}

export const MarkdownPreview = forwardRef<MarkdownPreviewHandle, MarkdownPreviewProps>(({
  content,
  theme = 'dark',
  fontSize = 16,
  compact = false,
  showOutline = false,
  onCloseOutline,
  onImageClick,
  onContentChange,
  onScrollPercentage,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | null>(null);
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | null>(null);

  // highlight.js grammars are dynamically imported so they land in their own
  // chunks instead of bloating the bundle. That makes them arrive a moment after
  // the first render, so the initial parse necessarily produces plain text. The
  // epoch re-runs the parse once they land; without it the preview would keep
  // showing unhighlighted code until the user happened to edit the document.
  const [grammarEpoch, setGrammarEpoch] = React.useState(0);
  useEffect(() => {
    let alive = true;
    void ensureLanguages().then(() => {
      if (alive) setGrammarEpoch((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Parse on a debounce, not on every keystroke.
  //
  // The memo below used to depend directly on `content`, so its cache hit rate was
  // zero: every character re-ran marked, re-ran the highlighter, and replaced the
  // entire preview DOM subtree (which also resets scroll). On a long document that
  // is 100-300ms per keystroke. The editor stays instant; only the render lags by
  // a fraction of a second.
  const debouncedContent = useDebouncedValue(content, 180);

  const { html: htmlContent, outline } = React.useMemo(
    () => parseMarkdownWithOutline(debouncedContent),
    [debouncedContent, grammarEpoch]
  );

  // Highlight the outline row for the section in view. Scoped to this preview
  // container: heading ids like "introduction" must never match app chrome, so
  // the observer and every lookup stay inside containerRef.
  useEffect(() => {
    if (!showOutline) {
      setActiveHeadingId(null);
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const headings = Array.from(
      container.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')
    );
    if (headings.length === 0) {
      setActiveHeadingId(null);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveHeadingId(entry.target.id);
        }
      },
      { root: container, rootMargin: '-8% 0px -85% 0px', threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [htmlContent, showOutline]);

  const jumpToHeading = React.useCallback((id: string) => {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (!el) return;
    setActiveHeadingId(id);
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, []);

  // Expose imperative scrollToPercentage
  useImperativeHandle(ref, () => ({
    scrollToPercentage: (pct: number) => {
      const container = containerRef.current;
      if (!container) return;
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (maxScroll > 0) {
        container.scrollTop = pct * maxScroll;
      }
    },
  }));

  // Handle scroll event on container to notify sync scroll
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || !onScrollPercentage) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const pct = maxScroll > 0 ? container.scrollTop / maxScroll : 0;
    onScrollPercentage(pct);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Attach click listeners for copy-code buttons, images, and interactive checkboxes
    const handleContainerClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // 1. Handle interactive checklist click
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
        const checkbox = target as HTMLInputElement;
        // Only drive checkboxes this renderer produced. A stray raw-HTML input
        // has no data-task and no source line, so toggling it would rewrite the
        // wrong line.
        if (!checkbox.hasAttribute('data-task')) return;
        // The rewrite below drives the visual state; letting the input flip
        // natively first would desync it whenever there is no onContentChange.
        e.preventDefault();
        if (onContentChange) {
          const allCheckboxes = Array.from(container.querySelectorAll('input[data-task]'));
          const checkboxIndex = allCheckboxes.indexOf(checkbox);

          if (checkboxIndex !== -1) {
            // Rewrite only outside fenced code blocks. A "- [ ]" line inside a
            // fence has no checkbox, so counting it would shift every later
            // index and corrupt the fence on toggle.
            const lines = content.split('\n');
            let inFence = false;
            let seen = -1;
            const out = lines.map((line) => {
              if (/^\s*(```|~~~)/.test(line)) {
                inFence = !inFence;
                return line;
              }
              if (inFence) return line;
              return line.replace(
                /^(\s*(?:[-*+]|\d+[.)])\s*\[)([ xX])(\])/,
                (match, prefix, state, suffix) => {
                  seen++;
                  return seen === checkboxIndex
                    ? `${prefix}${state === ' ' ? 'x' : ' '}${suffix}`
                    : match;
                }
              );
            });

            onContentChange(out.join('\n'));
          }
        }
        return;
      }

      // 2. Handle copy code snippet button
      const copyBtn = target.closest('.copy-code-btn') as HTMLElement | null;
      if (copyBtn) {
        e.preventDefault();
        const code = decodeURIComponent(copyBtn.getAttribute('data-code') || '');
        if (code) {
          navigator.clipboard.writeText(code).then(() => {
            // Attribute-driven feedback, not textContent mutation: React owns
            // this subtree and clobbers direct DOM writes on the next render.
            copyBtn.setAttribute('data-copied', 'true');
            const pending = copyTimer.current;
            if (pending !== null) window.clearTimeout(pending);
            copyTimer.current = window.setTimeout(() => {
              copyBtn.removeAttribute('data-copied');
            }, 1800);
          });
        }
        return;
      }

      // 3. Handle image click for lightbox
      const img = target.closest('img') as HTMLImageElement | null;
      if (img && onImageClick) {
        e.preventDefault();
        onImageClick(img.src, img.alt || '');
      }
    };

    container.addEventListener('click', handleContainerClick);

    // Broken-image state without inline handlers (CSP blocks those). Error
    // events do not bubble, so this listens in the capture phase.
    const handleImageError = (e: Event) => {
      const img = e.target as HTMLElement;
      if (img.tagName !== 'IMG') return;
      img.closest('figure')?.classList.add('md-img-broken');
    };
    container.addEventListener('error', handleImageError, true);

    return () => {
      container.removeEventListener('click', handleContainerClick);
      container.removeEventListener('error', handleImageError, true);
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
        copyTimer.current = null;
      }
    };
  }, [htmlContent, content, onImageClick, onContentChange]);

  if (!content.trim()) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-8 select-none ${
        theme === 'light' ? 'text-slate-500' : 'text-slate-400'
      }`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
          theme === 'light' ? 'bg-slate-100 border border-slate-200 text-sky-600' : 'bg-slate-900 border border-slate-800 text-sky-400'
        }`}>
          <FileText className="w-5 h-5" aria-hidden="true" />
        </div>
        <p className={`text-sm font-medium ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
          Empty Document
        </p>
        <p className="text-xs mt-1 text-[var(--velox-muted)]">
          Switch to Raw view or Split view to start writing Markdown.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        // Drives --preview-fs, which .markdown-body multiplies into its base size.
        // An inline font-size here would only affect inheriting descendants, which
        // is why zoom used to leave headings, code and tables untouched.
        style={{ '--preview-fs': `${fontSize}px` } as React.CSSProperties}
        className={`markdown-body ${compact ? 'px-4 py-4' : 'p-6 md:p-10'} max-w-4xl mx-auto h-full flex-1 min-w-0 overflow-y-auto selection:bg-sky-500/30 ${
          theme === 'light' ? 'selection:text-slate-900' : 'selection:text-white'
        }`}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
      {showOutline && (
        <OutlinePanel
          outline={outline}
          activeId={activeHeadingId}
          theme={theme}
          onJump={jumpToHeading}
          onClose={onCloseOutline ?? (() => {})}
        />
      )}
    </div>
  );
});

MarkdownPreview.displayName = 'MarkdownPreview';
