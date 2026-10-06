import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { highlightCode, displayLanguage, grammarClass, escapeHtml, ensureLanguages } from './highlight';

/**
 * Only allow image sources we are willing to load. Anything else (notably
 * `javascript:` and `vbscript:`) resolves to an empty src rather than being
 * handed to the browser.
 */
const SAFE_IMAGE_SRC = /^(?:https?:\/\/|data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);base64,|blob:|file:)/i;

const markedInstance = new Marked({
  gfm: true,
  breaks: true,
});

// Custom renderer to format responsive images, code blocks with copy buttons, and clean blockquotes
markedInstance.use({
  renderer: {
    image({ href, title, text }) {
      // `href`, `title` and `text` are attacker-controlled (they come from the
      // document being previewed). They must be escaped before being spliced
      // into attribute position, and href must be scheme-checked.
      const safeHref = SAFE_IMAGE_SRC.test(href) ? escapeHtml(href) : '';
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      const altAttr = text ? `alt="${escapeHtml(text)}"` : 'alt="Markdown Image"';
      const caption = text
        ? `<figcaption class="text-xs text-slate-400 mt-2 italic text-center">${escapeHtml(text)}</figcaption>`
        : '';

      if (!safeHref) {
        return `<div class="my-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Blocked image reference &mdash; unsupported or unsafe URL scheme.
        </div>`;
      }

      return `
        <figure class="my-5 flex flex-col items-center">
          <div class="relative group max-w-full overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/50 shadow-lg cursor-zoom-in transition-all duration-200 hover:border-sky-500/50">
            <img src="${safeHref}" ${altAttr}${titleAttr} class="max-w-full h-auto object-contain max-h-[500px] transition-transform duration-300 group-hover:scale-[1.01]" data-zoomable="true" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
            <div class="absolute inset-0 bg-sky-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span class="bg-slate-950/80 text-sky-300 text-xs px-2.5 py-1 rounded-full border border-sky-500/30 flex items-center gap-1 shadow-md">
                🔍 Click to zoom
              </span>
            </div>
          </div>
          ${caption}
        </figure>
      `;
    },
    code({ text, lang }) {
      // `lang` comes from the fence info string. The highlighter module
      // validates it against a conservative charset and a registered grammar, so
      // it can never be used to break out of the class attribute below.
      // Unlabelled blocks are escaped rather than run through highlightAuto,
      // which used to execute every registered grammar on every keystroke.
      const highlightedCode = highlightCode(text, lang);
      const grammar = grammarClass(lang);
      const displayLang = escapeHtml(displayLanguage(lang));
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
          <pre class="overflow-x-auto font-mono text-sm leading-relaxed text-slate-200 m-0"><code class="hljs ${grammar}">${highlightedCode}</code></pre>
        </div>
      `;
    },
    blockquote({ tokens }) {
      // Parse the already-tokenised children. The previous implementation read
      // `token.text`, which marked no longer provides, so every blockquote
      // rendered empty; it also re-entered the parser on unbounded input.
      let inner = '';
      try {
        inner = this.parser.parse(tokens ?? []);
      } catch {
        inner = '';
      }
      return `<blockquote class="border-l-4 border-sky-600 bg-sky-950/20 px-4 py-2.5 my-3 rounded-r-lg text-slate-300 italic [&>p]:m-0">${inner}</blockquote>`;
    },
  },
});

/**
 * `marked` deliberately does not sanitize its output, and we inject that output
 * with `dangerouslySetInnerHTML`. Every document therefore has to be treated as
 * untrusted input: this is the boundary that stops a hostile .md file from
 * executing script inside the app (and from riding along into exported HTML).
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'del', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'span', 'div', 'button', 'input', 'sup', 'sub',
    'svg', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'g',
    'defs', 'linearGradient', 'radialGradient', 'stop',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id', 'name', 'start', 'type',
    'checked', 'disabled', 'width', 'height', 'align', 'colspan', 'rowspan',
    'target', 'rel', 'loading', 'decoding', 'referrerpolicy',
    'data-zoomable', 'data-code', 'data-task',
    'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r',
    'rx', 'ry', 'points', 'gradientUnits', 'gradientTransform', 'stop-color',
    'stop-opacity', 'transform', 'aria-hidden', 'aria-label', 'role',
  ],
  // NOTE: deliberately no USE_PROFILES. Setting it makes DOMPurify discard the
  // ALLOWED_TAGS/ALLOWED_ATTR above and substitute the profile defaults, which
  // silently strips data-code/data-zoomable and breaks the copy button and the
  // image lightbox. The explicit lists below are the source of truth.
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'form', 'base', 'meta', 'link', 'noscript', 'template', 'math', 'svgforeignobject'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onanimationstart', 'onanimationend', 'ontoggle', 'onchange', 'onsubmit', 'formaction', 'srcdoc', 'ping', 'http-equiv'],
  ALLOW_DATA_ATTR: false,
};

// Task-list checkboxes are inert because marked emits `disabled=""`. We want
// them clickable, so the hook below re-enables them. Every other attribute on an
// <input> is stripped, so this cannot be used to smuggle event handlers.
const ALLOWED_TASK_ATTR = ['type', 'checked', 'data-task'];

/**
 * Force safe link behaviour. marked already strips `javascript:` destinations,
 * but a previewed link must never be able to navigate the app window itself
 * (Electron) nor hand the opener to a new tab.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
  if (node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox') {
    for (const attr of Array.from(node.attributes)) {
      if (!ALLOWED_TASK_ATTR.includes(attr.name)) node.removeAttribute(attr.name);
    }
    node.removeAttribute('disabled');
  }
});

export function parseMarkdown(markdown: string): string {
  try {
    // Kick off (once) the on-demand grammar loads. Not awaited: the first render
    // must not block on ~27 dynamic imports, and any fence whose grammar has not
    // arrived yet simply renders as escaped plain text for a frame.
    void ensureLanguages();
    const rendered = markedInstance.parse(markdown) as string;
    return DOMPurify.sanitize(rendered, PURIFY_CONFIG);
  } catch (err) {
    console.error('Markdown parse error:', err);
    return '<div class="text-rose-400 p-4">Error rendering markdown.</div>';
  }
}

export function calculateWordCount(text: string): number {
  if (!text) return 0;
  // O(1) space: the previous `text.match(/\S+/g)` allocated an array of every
  // token in the document, which is ~100MB+ on a large file and ran on every
  // keystroke via the status bar.
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isSpace = code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11;
    if (isSpace) {
      if (inWord) {
        count++;
        inWord = false;
      }
    } else {
      inWord = true;
    }
  }
  return inWord ? count + 1 : count;
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
