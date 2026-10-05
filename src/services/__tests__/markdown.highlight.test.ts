import { describe, it, expect, beforeAll } from 'vitest';
import { parseMarkdown } from '../markdown';
import { ensureLanguages, highlightCode, displayLanguage, grammarClass, escapeHtml } from '../highlight';

/**
 * highlight.js is loaded as the core with grammars imported on demand, so the
 * first parse of a session necessarily renders plain text and the preview
 * re-parses once they land (see the grammarEpoch effect in MarkdownPreview).
 * These tests cover both halves of that behaviour.
 */
describe('highlight.js lazy grammar loading', () => {
  beforeAll(async () => {
    await ensureLanguages();
  });

  it('applies the grammar once loaded', () => {
    const html = parseMarkdown('```js\nfunction f(){ return 1; }\n```');
    expect(html).toMatch(/<code[^>]*class="hljs javascript"/);
    expect(html).toMatch(/hljs-(keyword|title|built_in)/);
  });

  it('shows the canonical language on the block header', () => {
    const html = parseMarkdown('```js\nconst a = 1;\n```');
    expect(html).toMatch(/tracking-wider">javascript</);
  });

  it.each([
    ['py', 'python'],
    ['ts', 'typescript'],
    ['sh', 'bash'],
    ['yml', 'yaml'],
    ['html', 'xml'],
    ['svg', 'xml'],
    ['c++', 'cpp'],
    ['c#', 'csharp'],
    ['dockerfile', 'dockerfile'],
    ['md', 'markdown'],
  ])('resolves the alias %s to %s', (alias, canonical) => {
    expect(displayLanguage(alias)).toBe(canonical);
    expect(grammarClass(alias)).toBe(canonical);
  });

  it('leaves an unlabelled fence as escaped plain text', () => {
    const html = parseMarkdown('```\njust text <b>\n```');
    expect(html).toMatch(/<code[^>]*class="hljs">/);
    expect(html).toContain('&lt;b&gt;');
    expect(displayLanguage(undefined)).toBe('plaintext');
    expect(grammarClass(undefined)).toBe('');
  });

  it('does not treat an inherited object key as a language', () => {
    // hljs.getLanguage looks names up in a plain object, so "constructor"
    // resolved truthy without being a real grammar.
    expect(grammarClass('constructor')).toBe('');
    expect(grammarClass('__proto__')).toBe('');
    expect(grammarClass('toString')).toBe('');
  });

  it('maps plaintext aliases to no grammar', () => {
    for (const name of ['txt', 'text', 'plain']) {
      expect(grammarClass(name)).toBe('');
      expect(displayLanguage(name)).toBe('plaintext');
    }
  });

  it('escapes rather than throws on an unknown language', () => {
    expect(highlightCode('const a = 1;', 'definitely-not-a-language')).toBe(
      escapeHtml('const a = 1;')
    );
  });

  it('never calls highlightAuto', async () => {
    // highlightAuto runs every registered grammar against the snippet. Assert on
    // the call expression rather than the word, so the explanatory comment that
    // mentions it does not trip the check and the regression cannot come back
    // through a refactor.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'services', 'highlight.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/hljs\s*\.\s*highlightAuto\s*\(/);
  });

  it('imports the core build, not the 194-grammar default entry point', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'services', 'highlight.ts'),
      'utf8'
    );
    expect(src).toMatch(/highlight\.js\/lib\/core/);

    // The bare specifier is only acceptable for a type-only import, which is
    // erased at compile time and costs nothing at runtime.
    const bare = src.split('\n').filter((l) => /from\s*['"]highlight\.js['"]/.test(l));
    expect(bare.length).toBeGreaterThan(0);
    for (const line of bare) {
      expect(line, `value import from the full entry point: ${line}`).toMatch(/import\s+type/);
    }
  });

  it('imports the core build, not the 194-grammar default entry point', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'services', 'highlight.ts'),
      'utf8'
    );
    expect(src).toMatch(/highlight\.js\/lib\/core/);
  });
});

describe('escapeHtml', () => {
  it('escapes every character that can break out of markup', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('handles nullish and non-string input', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });

  it('escapes ampersands before the entities it introduces', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});
