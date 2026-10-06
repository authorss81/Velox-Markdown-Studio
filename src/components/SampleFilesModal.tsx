import React from 'react';
import { X, Sparkles, FileText, ArrowRight } from 'lucide-react';
import { SAMPLE_FILES } from '../data/samples';
import { useModalFocus } from '../hooks/useModalFocus';

interface SampleFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSample: (sampleId: string) => void;
}

export const SampleFilesModal: React.FC<SampleFilesModalProps> = ({
  isOpen,
  onClose,
  onSelectSample,
}) => {
  const dialogRef = useModalFocus<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

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
        aria-label="Sample Markdown library"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Sample Markdown Library</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Explore pre-configured Markdown documents featuring syntax highlighting, responsive images, and formatting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3.5">
          {SAMPLE_FILES.map((sample) => (
            <div
              key={sample.id}
              onClick={() => {
                onSelectSample(sample.id);
                onClose();
              }}
              className="group p-4 rounded-2xl border border-slate-800 bg-slate-950/40 hover:bg-slate-800/60 hover:border-sky-500/40 cursor-pointer transition flex items-start justify-between gap-4"
            >
              <div className="space-y-1.5 overflow-hidden">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                  <h4 className="text-sm font-semibold text-slate-200 group-hover:text-sky-300 transition truncate">
                    {sample.name}
                  </h4>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {sample.content.replace(/^#+\s+/gm, '').substring(0, 120)}...
                </p>
                <div className="flex items-center gap-2 pt-1 text-2xs text-[var(--velox-muted)]">
                  <span>{sample.wordCount} words</span>
                  <span>•</span>
                  <span>{sample.readingTimeMinutes} min read</span>
                  {sample.tags.map((t) => (
                    <span key={t} className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-2xs">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <button className="px-3 py-1.5 rounded-lg bg-slate-800 group-hover:bg-sky-700 group-hover:text-white text-slate-300 text-xs font-medium transition flex items-center gap-1.5 shrink-0 self-center">
                <span>Load</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
