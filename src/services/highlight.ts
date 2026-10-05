import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';

/**
 * highlight.js, loaded as the core plus an explicit language list.
 *
 * The default entry point (`highlight.js`) registers 194 grammars, which is why
 * the production bundle was 1.3 MB with highlight.js as the single largest
 * dependency. Registering only the languages a Markdown document realistically
 * contains cuts that dramatically while covering everything the bundled samples
 * and ordinary technical writing use.
 *
 * Grammars are dynamically imported on first use, so they land in their own
 * chunks and the initial bundle stays small.
 *
 * To add a language: import it here and add it to the array below. Nothing else
 * needs to change - markdown.ts asks this module rather than highlight.js.
 */
type LanguageLoader = () => Promise<{ default?: LanguageFn } | LanguageFn>;

const LANGUAGES: ReadonlyArray<readonly [string, LanguageLoader]> = [
  ['javascript', () => import('highlight.js/lib/languages/javascript')],
  ['typescript', () => import('highlight.js/lib/languages/typescript')],
  ['python', () => import('highlight.js/lib/languages/python')],
  ['bash', () => import('highlight.js/lib/languages/bash')],
  ['shell', () => import('highlight.js/lib/languages/shell')],
  ['powershell', () => import('highlight.js/lib/languages/powershell')],
  ['json', () => import('highlight.js/lib/languages/json')],
  ['yaml', () => import('highlight.js/lib/languages/yaml')],
  ['xml', () => import('highlight.js/lib/languages/xml')],
  ['html', () => import('highlight.js/lib/languages/xml')],
  ['css', () => import('highlight.js/lib/languages/css')],
  ['scss', () => import('highlight.js/lib/languages/scss')],
  ['sql', () => import('highlight.js/lib/languages/sql')],
  ['go', () => import('highlight.js/lib/languages/go')],
  ['rust', () => import('highlight.js/lib/languages/rust')],
  ['java', () => import('highlight.js/lib/languages/java')],
  ['csharp', () => import('highlight.js/lib/languages/csharp')],
  ['cpp', () => import('highlight.js/lib/languages/cpp')],
  ['php', () => import('highlight.js/lib/languages/php')],
  ['ruby', () => import('highlight.js/lib/languages/ruby')],
  ['swift', () => import('highlight.js/lib/languages/swift')],
  ['kotlin', () => import('highlight.js/lib/languages/kotlin')],
  ['diff', () => import('highlight.js/lib/languages/diff')],
  ['dockerfile', () => import('highlight.js/lib/languages/dockerfile')],
  ['ini', () => import('highlight.js/lib/languages/ini')],
  ['toml', () => import('highlight.js/lib/languages/ini')],
  ['markdown', () => import('highlight.js/lib/languages/markdown')],
];

/**
 * A language name is only usable if it looks like one *and* is registered.
 * Both halves matter: `hljs.getLanguage` looks the name up in a plain object, so
 * an inherited key such as "constructor" resolves truthy without being a real
 * grammar.
 */
const SAFE_LANG = /^[a-z0-9+#._-]{1,32}$/i;

/** Names the fence may use, mapped to the grammar we will actually apply. */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  zsh: 'bash',
  console: 'shell',
  pwsh: 'powershell',
  ps1: 'powershell',
  yml: 'yaml',
  html: 'xml',
  svg: 'xml',
  xhtml: 'xml',
  scss: 'scss',
  'c++': 'cpp',
  cxx: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  docker: 'dockerfile',
  md: 'markdown',
  patch: 'diff',
  txt: 'plaintext',
  text: 'plaintext',
  plain: 'plaintext',
};

let ready: Promise<void> | null = null;

/**
 * Grammar modules are loaded on demand and cached, so opening a document does
 * not wait for 27 dynamic imports and typing does not re-trigger them.
 */
export function ensureLanguages(): Promise<void> {
  if (ready) return ready;

  ready = Promise.all(
    LANGUAGES.map(async ([name, load]) => {
      try {
        const mod = await load();
        const grammar = typeof mod === 'function' ? mod : mod.default;
        if (typeof grammar === 'function' && !registered.has(name)) {
          hljs.registerLanguage(name, grammar);
          registered.add(name);
        }
      } catch (err) {
        // A missing grammar must never break rendering; the block simply falls
        // back to escaped plain text.
        console.warn(`Could not load the "${name}" highlighter`, err);
      }
    })
  ).then(() => undefined);

  return ready;
}

/**
 * Names actually registered on the hljs instance.
 *
 * `hljs.getLanguage()` looks a name up in a plain object, so an inherited key
 * such as "constructor", "toString" or "__proto__" resolves truthy without being
 * a real grammar. Membership of this set is the only reliable check.
 */
const registered = new Set<string>();

/** True when this fence's info string names a grammar we can actually apply. */
export function isHighlightable(lang: string | undefined): boolean {
  if (!lang) return false;
  const requested = lang.trim().split(/\s+/)[0];
  if (!requested || !SAFE_LANG.test(requested)) return false;
  const resolved = ALIASES[requested.toLowerCase()] ?? requested.toLowerCase();
  return resolved !== 'plaintext' && registered.has(resolved);
}

/**
 * Highlight a fenced block.
 *
 * Never calls highlightAuto: that runs every registered grammar against the
 * snippet, which on the keystroke path meant ~190 grammar executions per
 * unlabelled fence, per character. Unlabelled blocks are returned escaped, which
 * is both correct and O(n).
 */
export function highlightCode(text: string, lang: string | undefined): string {
  const requested = (lang ?? '').trim().split(/\s+/)[0];
  if (!isHighlightable(requested)) return escapeHtml(text);

  const resolved = ALIASES[requested.toLowerCase()] ?? requested.toLowerCase();
  try {
    return hljs.highlight(text, { language: resolved, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(text);
  }
}

/** The label shown on the code block header. */
export function displayLanguage(lang: string | undefined): string {
  const requested = (lang ?? '').trim().split(/\s+/)[0];
  if (!requested) return 'plaintext';
  return ALIASES[requested.toLowerCase()] ?? requested.toLowerCase();
}

/** Grammar name for the `<code class="hljs …">` hook, or '' when unhighlighted. */
export function grammarClass(lang: string | undefined): string {
  const requested = (lang ?? '').trim().split(/\s+/)[0];
  if (!isHighlightable(requested)) return '';
  return ALIASES[requested.toLowerCase()] ?? requested.toLowerCase();
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const languageCount = LANGUAGES.length;
