import React, { useState } from 'react';
import { X, FileDown, Code, Copy, Check, Printer, FileText } from 'lucide-react';
import { downloadTextFile, generateStandaloneHtml } from '../services/export';
import { parseMarkdown } from '../services/markdown';
import { useModalFocus } from '../hooks/useModalFocus';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  markdownContent: string;
  theme?: 'dark' | 'light';
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  fileName,
  markdownContent,
  theme = 'dark',
}) => {
  const [activeTab, setActiveTab] = useState<'markdown' | 'html'>('markdown');
  const [copiedType, setCopiedType] = useState<'md' | 'html' | null>(null);
  const isLight = theme === 'light';

  // Gated on isOpen. This memo sat above `if (!isOpen) return null`, so it ran on
  // every keystroke for a dialog nobody could see - a second full parse of the
  // document plus a complete standalone-HTML string build, doubling the preview's
  // cost for nothing. The guard has to live inside the memo rather than as an
  // early return, because hooks must not be called conditionally.
  const htmlContent = React.useMemo(() => {
    if (!isOpen) return '';
    return generateStandaloneHtml(fileName, parseMarkdown(markdownContent));
  }, [isOpen, fileName, markdownContent]);

  const dialogRef = useModalFocus<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(markdownContent).then(() => {
      setCopiedType('md');
      setTimeout(() => setCopiedType(null), 2000);
    });
  };

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(htmlContent).then(() => {
      setCopiedType('html');
      setTimeout(() => setCopiedType(null), 2000);
    });
  };

  const handleDownloadMarkdown = () => {
    const name = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    downloadTextFile(name, markdownContent, 'text/markdown');
  };

  const handleDownloadHtml = () => {
    const cleanTitle = fileName.replace(/\.md$/i, '');
    downloadTextFile(`${cleanTitle}.html`, htmlContent, 'text/html');
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in select-none"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Export document"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors duration-150 ${
          isLight
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isLight
                ? 'bg-purple-100 border-purple-300 text-purple-700'
                : 'bg-purple-500/20 border-purple-500/30 text-purple-400'
            }`}>
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                <span>Export Document</span>
                <span className={`text-2xs px-2 py-0.5 rounded-full font-mono border ${
                  isLight
                    ? 'bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {fileName}
                </span>
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Download as a file or copy directly to your clipboard
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Action Cards */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Option 1: Markdown */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div>
              <div className="flex items-center gap-2 font-semibold text-xs text-sky-600 dark:text-sky-400">
                <FileText className="w-4 h-4" />
                <span>Markdown (.md)</span>
              </div>
              <p className="text-2xs text-[var(--velox-muted)] mt-1">Raw GFM source file</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadMarkdown}
                className="flex-1 py-1.5 px-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-medium text-xs text-center transition shadow-xs"
              >
                Download
              </button>
              <button
                onClick={handleCopyMarkdown}
                className={`p-1.5 rounded-lg border transition ${
                  isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
                title="Copy Markdown to clipboard" aria-label="Copy Markdown to clipboard"
              >
                {copiedType === 'md' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Option 2: Standalone HTML */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div>
              <div className="flex items-center gap-2 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                <Code className="w-4 h-4" />
                <span>Web HTML (.html)</span>
              </div>
              <p className="text-2xs text-[var(--velox-muted)] mt-1">Self-contained styled page</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadHtml}
                className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs text-center transition shadow-xs"
              >
                Download
              </button>
              <button
                onClick={handleCopyHtml}
                className={`p-1.5 rounded-lg border transition ${
                  isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
                title="Copy HTML to clipboard" aria-label="Copy HTML to clipboard"
              >
                {copiedType === 'html' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Option 3: Print / PDF */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div>
              <div className="flex items-center gap-2 font-semibold text-xs text-amber-600 dark:text-amber-400">
                <Printer className="w-4 h-4" />
                <span>Print to PDF</span>
              </div>
              <p className="text-2xs text-[var(--velox-muted)] mt-1">Browser PDF print dialog</p>
            </div>
            <button
              onClick={() => {
                onClose();
                setTimeout(() => window.print(), 100);
              }}
              className="w-full py-1.5 px-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs text-center transition shadow-xs"
            >
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Preview Code View Tabs */}
        <div className="px-5 border-t flex items-center justify-between pt-3">
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setActiveTab('markdown')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                activeTab === 'markdown'
                  ? 'bg-sky-700 text-white'
                  : isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              Markdown Preview
            </button>
            <button
              onClick={() => setActiveTab('html')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                activeTab === 'html'
                  ? 'bg-sky-700 text-white'
                  : isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              HTML Code Preview
            </button>
          </div>
          <button
            onClick={activeTab === 'markdown' ? handleCopyMarkdown : handleCopyHtml}
            className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 hover:underline"
          >
            {copiedType ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500">Copied to clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy all {activeTab === 'markdown' ? 'Markdown' : 'HTML'}</span>
              </>
            )}
          </button>
        </div>

        {/* Content Preview Box */}
        <div className="p-5 pt-2 flex-1 overflow-hidden">
          <textarea
            readOnly
            value={activeTab === 'markdown' ? markdownContent : htmlContent}
            className={`w-full h-44 p-3 rounded-xl border font-mono text-xs resize-none leading-relaxed select-text ${
              isLight
                ? 'bg-slate-50 border-slate-300 text-slate-800'
                : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}
          />
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between text-xs ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/80 border-slate-800 text-[var(--velox-muted)]'
        }`}>
          <span>Exports include all document formatting, tables, and images.</span>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
              isLight
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
