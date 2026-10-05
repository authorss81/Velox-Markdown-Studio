import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { parseMarkdown } from '../services/markdown';

export interface MarkdownPreviewHandle {
  scrollToPercentage: (percentage: number) => void;
}

interface MarkdownPreviewProps {
  content: string;
  theme?: 'dark' | 'light';
  fontSize?: number;
  onImageClick?: (src: string, alt: string) => void;
  onContentChange?: (updatedContent: string) => void;
  onScrollPercentage?: (percentage: number) => void;
}

export const MarkdownPreview = forwardRef<MarkdownPreviewHandle, MarkdownPreviewProps>(({
  content,
  theme = 'dark',
  fontSize = 16,
  onImageClick,
  onContentChange,
  onScrollPercentage,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const htmlContent = React.useMemo(() => parseMarkdown(content), [content]);

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
        if (onContentChange) {
          const allCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
          const checkboxIndex = allCheckboxes.indexOf(checkbox);

          if (checkboxIndex !== -1) {
            const regex = /^(\s*[-*+]\s*\[)([ xX])(\])/gm;
            let matchCount = 0;
            const updated = content.replace(regex, (match, prefix, state, suffix) => {
              if (matchCount === checkboxIndex) {
                matchCount++;
                const newState = state === ' ' ? 'x' : ' ';
                return `${prefix}${newState}${suffix}`;
              }
              matchCount++;
              return match;
            });

            onContentChange(updated);
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
            const span = copyBtn.querySelector('span');
            if (span) {
              const original = span.textContent;
              span.textContent = 'Copied!';
              copyBtn.classList.add('text-emerald-400');
              setTimeout(() => {
                span.textContent = original;
                copyBtn.classList.remove('text-emerald-400');
              }, 1800);
            }
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
    return () => {
      container.removeEventListener('click', handleContainerClick);
    };
  }, [htmlContent, content, onImageClick, onContentChange]);

  if (!content.trim()) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-8 select-none ${
        theme === 'light' ? 'text-slate-400' : 'text-slate-500'
      }`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
          theme === 'light' ? 'bg-slate-100 border border-slate-200 text-sky-600' : 'bg-slate-900 border border-slate-800 text-sky-400'
        }`}>
          📝
        </div>
        <p className={`text-sm font-medium ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
          Empty Document
        </p>
        <p className={`text-xs mt-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-500'}`}>
          Switch to Raw view or Split view to start writing Markdown.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ fontSize: `${fontSize}px` }}
      className={`markdown-body p-6 md:p-10 max-w-4xl mx-auto h-full overflow-y-auto selection:bg-sky-500/30 ${
        theme === 'light' ? 'selection:text-slate-900' : 'selection:text-white'
      }`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
});

MarkdownPreview.displayName = 'MarkdownPreview';
