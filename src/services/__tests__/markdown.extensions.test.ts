import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseMarkdownWithOutline } from '../markdown';

/**
 * marked ships no footnotes, no definition lists and no heading anchors, so
 * these are local extensions. Each is fenced against hostile input because the
 * labels and slugs end up inside id and href attributes.
 */
describe('footnotes', () => {
  it('renders a reference linked to its definition with a back-reference', () => {
    const html = parseMarkdown('A claim[^1] stands.\n\n[^1]: The supporting note.');
    expect(html).toContain('<sup class="footnote-ref" id="fnref-1"><a href="#fn-1">1</a></sup>');
    expect(html).toContain('<section class="footnotes" aria-label="Footnotes">');
    expect(html).toContain('<li id="fn-1">');
    expect(html).toContain('<a href="#fnref-1" aria-label="Back to content">');
    expect(html).toContain('The supporting note.');
  });

  it('numbers by first reference, not definition order', () => {
    const html = parseMarkdown('First[^b] then[^a].\n\n[^a]: Alpha.\n\n[^b]: Beta.');
    expect(html.indexOf('>1</a>')).toBeLessThan(html.indexOf('>2</a>'));
    expect(html).toContain('Beta.');
    expect(html).toContain('Alpha.');
    // Beta is reference 1 even though its definition comes second.
    expect(html).toMatch(/<li id="fn-1">Beta\./);
    expect(html).toContain('fnref-1');
  });

  it('leaves a reference without a definition as literal text', () => {
    const html = parseMarkdown('A dangling[^nope] ref.');
    expect(html).not.toContain('footnote-ref');
    expect(html).toContain('[^nope]');
  });

  it('rejects a hostile label instead of injecting attributes', () => {
    const html = parseMarkdown('X[^a"b] y.\n\n[^a"b]: evil');
    expect(html).not.toContain('fnref-');
    expect(html).not.toContain('<section class="footnotes"');
  });

  it('parses markdown inside definitions', () => {
    const html = parseMarkdown('R[^1].\n\n[^1]: A **bold** claim.');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('supports multi-line definitions', () => {
    const html = parseMarkdown('R[^1].\n\n[^1]: First line.\nsecond line.');
    expect(html).toContain('First line.');
    expect(html).toContain('second line.');
  });
});

describe('definition lists', () => {
  it('renders a term with its definitions', () => {
    const html = parseMarkdown('Term\n: First meaning\n: Second meaning');
    expect(html).toContain('<dl><dt>Term</dt><dd>First meaning</dd><dd>Second meaning</dd></dl>');
  });

  it('parses inline markdown in terms and definitions', () => {
    const html = parseMarkdown('**Term**\n: a `code` meaning');
    expect(html).toContain('<dt><strong>Term</strong></dt>');
    expect(html).toContain('<dd>a <code>code</code> meaning</dd>');
  });

  it('refuses lines that belong to other constructs', () => {
    expect(parseMarkdown('# Not a term\n: not a definition')).not.toContain('<dl>');
    expect(parseMarkdown('- item\n: not a definition')).not.toContain('<dl>');
    expect(parseMarkdown('> quote\n: not a definition')).not.toContain('<dl>');
    expect(parseMarkdown('```\ncode\n```\n: not a definition')).not.toContain('<dl>');
  });
});

describe('heading anchors', () => {
  it('gives every heading a stable identifier', () => {
    const html = parseMarkdown('# Hello World');
    expect(html).toContain('<h1 id="hello-world">');
  });

  it('deduplicates repeated headings', () => {
    const html = parseMarkdown('# Same\n\n# Same');
    expect(html).toContain('id="same"');
    expect(html).toContain('id="same-1"');
  });

  it('produces identifiers safe for id and href attributes', () => {
    const html = parseMarkdown('# Hello, "World" & <friends>!');
    const ids = [...html.matchAll(/id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).toMatch(/^[\w-]+$/);
    }
  });
});

describe('document outline', () => {
  it('returns one row per heading with the exact rendered anchor', () => {
    const { html, outline } = parseMarkdownWithOutline('# Intro\n\nSome text.\n\n## Details\n\n### Deep\n');
    expect(outline).toEqual([
      { depth: 1, text: 'Intro', id: 'intro' },
      { depth: 2, text: 'Details', id: 'details' },
      { depth: 3, text: 'Deep', id: 'deep' },
    ]);
    // Every row must match an anchor actually present in the HTML, so a click
    // can never scroll to nowhere.
    for (const row of outline) {
      expect(html).toContain(`id="${row.id}"`);
    }
  });

  it('keeps duplicate headings distinct in both the outline and the HTML', () => {
    const { html, outline } = parseMarkdownWithOutline('# Same\n\n# Same\n');
    expect(outline.map((r) => r.id)).toEqual(['same', 'same-1']);
    expect(html).toContain('id="same"');
    expect(html).toContain('id="same-1"');
  });

  it('strips markup from labels so the panel never receives raw HTML', () => {
    const { outline } = parseMarkdownWithOutline('## A **bold** `code` ![pic](https://example.com/x.png) end');
    expect(outline).toHaveLength(1);
    // "Click to zoom" and "Image unavailable" are renderer chrome and must not
    // leak; the caption ("pic") is the image's real description and stays.
    expect(outline[0]?.text).toBe('A bold code pic end');
    expect(outline[0]?.text).not.toContain('<');
  });

  it('labels an empty heading instead of emitting a blank row', () => {
    const { outline } = parseMarkdownWithOutline('#\n');
    expect(outline).toHaveLength(1);
    expect(outline[0]?.text).toBe('(empty heading)');
    expect(outline[0]?.id).toBe('section');
  });

  it('stays in sync when a heading contains a footnote reference', () => {
    const { html, outline } = parseMarkdownWithOutline('## Title[^a]\n\nBody[^a].\n\n[^a]: Note.');
    expect(outline).toHaveLength(1);
    expect(html).toContain(`id="${outline[0]?.id}"`);
    // The reference number is navigation chrome, not heading text.
    expect(outline[0]?.text).toBe('Title');
  });

  it('returns an empty outline for a document without headings', () => {
    expect(parseMarkdownWithOutline('Just a paragraph.\n').outline).toEqual([]);
  });

  it('leaves the html identical to the plain parse', () => {
    const src = '# A\n\nText with **bold**.\n';
    expect(parseMarkdownWithOutline(src).html).toBe(parseMarkdown(src));
  });
});
