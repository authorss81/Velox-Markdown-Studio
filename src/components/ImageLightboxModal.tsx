import React from 'react';
import { X, ZoomIn, ZoomOut, Copy, Check } from 'lucide-react';
import { useModalFocus } from '../hooks/useModalFocus';

interface ImageLightboxModalProps {
  imageSrc: string | null;
  imageAlt: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  imageSrc,
  imageAlt,
  onClose,
}) => {
  const [scale, setScale] = React.useState(1);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setScale(1);
  }, [imageSrc]);

  // The lightbox is driven by imageSrc rather than isOpen, so it is open
  // whenever a source is set.
  const dialogRef = useModalFocus<HTMLDivElement>(imageSrc !== null, onClose);

  if (!imageSrc) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(imageSrc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in select-none"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={imageAlt ? `Image viewer: ${imageAlt}` : 'Image viewer'}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-5xl max-h-[90vh] flex flex-col items-center justify-center bg-slate-900/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Top Control Bar */}
        <div className="w-full px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <span className="truncate max-w-md font-medium text-slate-200">
            {imageAlt || 'Markdown Image Viewer'}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setScale((s) => Math.min(s + 0.25, 3))}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="Zoom in" aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-2xs font-mono text-slate-400 min-w-[40px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="Zoom out" aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-700/60 mx-1" />

            <button
              onClick={handleCopyUrl}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 flex items-center gap-1"
              title="Copy image link" aria-label="Copy image link"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              title="Close viewer" aria-label="Close viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Display */}
        <div className="overflow-auto max-h-[78vh] p-4 flex items-center justify-center">
          <img
            src={imageSrc}
            alt={imageAlt}
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
            className="max-w-full max-h-[70vh] object-contain rounded-lg transition-transform duration-150"
          />
        </div>

        {imageAlt && (
          <div className="w-full py-2 px-4 bg-slate-950/80 border-t border-slate-800 text-center text-xs text-slate-400 italic">
            {imageAlt}
          </div>
        )}
      </div>
    </div>
  );
};
