import { Marked } from 'marked';
import hljs from 'highlight.js';

const markedInstance = new Marked({
  gfm: true,
  breaks: true,
});

// Custom renderer to format responsive images, code blocks with copy buttons, and clean blockquotes
markedInstance.use({
  renderer: {
    image({ href, title, text }) {
      const titleAttr = title ? `title="${title}"` : '';
      const altAttr = text ? `alt="${text}"` : 'alt="Markdown Image"';
      return `
        <figure class="my-5 flex flex-col items-center">
          <div class="relative group max-w-full overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/50 shadow-lg cursor-zoom-in transition-all duration-200 hover:border-sky-500/50">
            <img src="${href}" ${altAttr} ${titleAttr} class="max-w-full h-auto object-contain max-h-[500px] transition-transform duration-300 group-hover:scale-[1.01]" data-zoomable="true" loading="lazy" />
            <div class="absolute inset-0 bg-sky-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span class="bg-slate-950/80 text-sky-300 text-xs px-2.5 py-1 rounded-full border border-sky-500/30 flex items-center gap-1 shadow-md">
                🔍 Click to zoom
              </span>
            </div>
          </div>
          ${text ? `<figcaption class="text-xs text-slate-400 mt-2 italic text-center">${text}</figcaption>` : ''}
        </figure>
      `;
    },
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : '';
      let highlightedCode = '';
      try {
        if (language) {
          highlightedCode = hljs.highlight(text, { language }).value;
        } else {
          highlightedCode = hljs.highlightAuto(text).value;
        }
      } catch {
        highlightedCode = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }

      const displayLang = language || 'plaintext';
      const encodedCode = encodeURIComponent(text);

      return `
        <div class="relative group my-4 rounded-xl overflow-hidden border border-slate-800 bg-[#0d1117] shadow-xl text-left">
          <div class="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 select-none">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500/70 inline-block"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500/70 inline-block"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/70 inline-block"></span>
              <span class="ml-2 text-xs font-mono font-medium text-slate-400 uppercase tracking-wider">${displayLang}</span>
            </div>
            <button
              class="copy-code-btn text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
              data-code="${encodedCode}"
              title="Copy snippet"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <pre class="p-4 overflow-x-auto font-mono text-sm leading-relaxed text-slate-200 m-0"><code class="hljs ${language}">${highlightedCode}</code></pre>
        </div>
      `;
    },
    blockquote(token: any) {
      const rawText = token.text || '';
      // Parse inner content so bold (**text**), italics (*text*), and code render accurately
      const parsedContent = markedInstance.parse(rawText);
      return `<blockquote class="border-l-4 border-sky-600 bg-sky-950/20 px-4 py-2.5 my-3 rounded-r-lg text-slate-300 italic [&>p]:m-0">${parsedContent}</blockquote>`;
    },
  },
});

export function parseMarkdown(markdown: string): string {
  try {
    return markedInstance.parse(markdown) as string;
  } catch (err) {
    console.error('Markdown parse error:', err);
    return `<div class="text-rose-400 p-4">Error rendering markdown: ${String(err)}</div>`;
  }
}

export function calculateWordCount(text: string): number {
  if (!text) return 0;
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function calculateReadingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTimestamp(ms: number): string {
  if (!ms) return 'Unknown';
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60 * 1000) return 'Just now';
  if (diff < 3600 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 3600 * 1000) return `${Math.floor(diff / (3600 * 1000))}h ago`;
  if (diff < 7 * 24 * 3600 * 1000) return `${Math.floor(diff / (24 * 3600 * 1000))}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
