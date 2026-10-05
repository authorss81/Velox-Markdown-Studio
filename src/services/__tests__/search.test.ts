import { describe, it, expect } from 'vitest';
import { searchMarkdownFiles, filterFilesByQuery, libraryContains } from '../search';
import type { MarkdownFileRecord } from '../../types';

function makeFile(id: string, name: string, content: string, over: Partial<MarkdownFileRecord> = {}): MarkdownFileRecord {
  return {
    id,
    name,
    path: `C:\\docs\\${name}`,
    content,
    size: content.length,
    lastOpened: 1000,
    lastModified: 1000,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    readingTimeMinutes: 1,
    isPinned: false,
    tags: ['Test'],
    ...over,
  };
}

const LIBRARY: MarkdownFileRecord[] = [
  makeFile('a', 'alpha.md', '# Alpha\n\nThe quick brown fox jumps.\n\nSecond line about foxes.'),
  makeFile('b', 'beta.md', '# Beta\n\nNothing to see here.\n\nCompletely unrelated.'),
  makeFile('c', 'gamma.md', '# Gamma\n\nFOX fox Fox.\n\nAnother fox line.'),
];

describe('searchMarkdownFiles', () => {
  it('finds matches case-insensitively', () => {
    const results = searchMarkdownFiles(LIBRARY, 'fox');
    expect(results.map((r) => r.file.id).sort()).toEqual(['a', 'c']);
  });

  it('counts every occurrence, not just snippets', () => {
    const results = searchMarkdownFiles(LIBRARY, 'fox');
    const alpha = results.find((r) => r.file.id === 'a');
    // "The quick brown fox jumps." and "Second line about foxes." - the query is
    // a substring, so "foxes" counts too.
    expect(alpha?.matchesCount).toBe(2);
    const gamma = results.find((r) => r.file.id === 'c');
    // "FOX fox Fox." is three, plus one in "Another fox line."
    expect(gamma?.matchesCount).toBe(4);
  });

  it('returns at most four snippets per file', () => {
    const many = makeFile('m', 'many.md', Array.from({ length: 40 }, () => 'needle').join('\n'));
    const results = searchMarkdownFiles([many], 'needle');
    expect(results[0]?.snippets.length).toBe(4);
    expect(results[0]?.matchesCount).toBe(40);
  });

  it('reports the line number of each snippet', () => {
    const results = searchMarkdownFiles(LIBRARY, 'unrelated');
    expect(results[0]?.snippets[0]?.lineNumber).toBe(5);
  });

  it('returns the document casing, not the lowercased match', () => {
    const results = searchMarkdownFiles(LIBRARY, 'FOX');
    const gamma = results.find((r) => r.file.id === 'c');
    // Source line is "FOX fox Fox." so the first match must be "FOX".
    expect(gamma?.snippets[0]?.match).toBe('FOX');
  });

  it('synthesises a snippet when only the file name matches', () => {
    // The name and path must match while the body must not, otherwise a real
    // content snippet is found and no synthetic one is needed.
    const named = makeFile('n', 'quarterly-report.md', 'Totally unrelated prose.');
    const results = searchMarkdownFiles([named], 'quarterly');
    expect(results).toHaveLength(1);
    expect(results[0]?.snippets[0]?.suffix).toMatch(/file title/i);
    expect(results[0]?.matchesCount).toBeGreaterThanOrEqual(1);
  });

  it('prefers a real content snippet when the name also matches', () => {
    // gamma.md's body starts with "# Gamma", so there is a genuine hit.
    const results = searchMarkdownFiles(LIBRARY, 'gamma');
    expect(results[0]?.snippets[0]?.suffix).not.toMatch(/file title/i);
  });

  it('returns nothing for an empty query', () => {
    expect(searchMarkdownFiles(LIBRARY, '')).toEqual([]);
    expect(searchMarkdownFiles(LIBRARY, '   ')).toEqual([]);
  });

  it('sorts by match count, then recency', () => {
    const results = searchMarkdownFiles(LIBRARY, 'o');
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1]!;
      const cur = results[i]!;
      expect(prev.matchesCount).toBeGreaterThanOrEqual(cur.matchesCount);
    }
  });

  it('terminates on a pathological query rather than hanging', () => {
    // A safety valve exists so a huge document with a very common term cannot
    // lock the renderer.
    const huge = makeFile('h', 'huge.md', 'a'.repeat(200_000));
    const started = Date.now();
    const results = searchMarkdownFiles([huge], 'a');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(results).toHaveLength(1);
  });

  it('handles an empty library', () => {
    expect(searchMarkdownFiles([], 'anything')).toEqual([]);
  });

  it('handles empty content without throwing', () => {
    const empty = makeFile('e', 'empty.md', '');
    expect(() => searchMarkdownFiles([empty], 'x')).not.toThrow();
  });
});

describe('filterFilesByQuery', () => {
  it('matches on name, path and content', () => {
    expect(filterFilesByQuery(LIBRARY, 'alpha').map((f) => f.id)).toEqual(['a']);
    expect(filterFilesByQuery(LIBRARY, 'beta').map((f) => f.id)).toEqual(['b']);
    expect(filterFilesByQuery(LIBRARY, 'unrelated').map((f) => f.id)).toEqual(['b']);
  });

  it('honours the limit', () => {
    expect(filterFilesByQuery(LIBRARY, 'o', 2)).toHaveLength(2);
  });

  it('returns the head of the library for an empty query', () => {
    expect(filterFilesByQuery(LIBRARY, '', 2).map((f) => f.id)).toEqual(['a', 'b']);
  });
});

describe('index reuse', () => {
  it('produces identical results when called repeatedly on the same array', () => {
    // The index is cached against the array's identity, so repeat calls must be
    // indistinguishable from fresh ones.
    const first = searchMarkdownFiles(LIBRARY, 'fox');
    const second = searchMarkdownFiles(LIBRARY, 'fox');
    const third = searchMarkdownFiles(LIBRARY, 'fox');
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('rebuilds when a different library is supplied', () => {
    const other = [makeFile('z', 'zeta.md', 'only fox content here')];
    expect(searchMarkdownFiles(LIBRARY, 'fox')).toHaveLength(2);
    expect(searchMarkdownFiles(other, 'fox')).toHaveLength(1);
  });

  it('does not leak results across libraries sharing file ids', () => {
    const v1 = [makeFile('same', 'a.md', 'alpha content')];
    const v2 = [makeFile('same', 'b.md', 'beta content')];
    expect(searchMarkdownFiles(v1, 'alpha')).toHaveLength(1);
    expect(searchMarkdownFiles(v2, 'alpha')).toHaveLength(0);
    expect(searchMarkdownFiles(v2, 'beta')).toHaveLength(1);
  });
});

describe('libraryContains', () => {
  it('detects content, name and path matches', () => {
    expect(libraryContains(LIBRARY, 'unrelated')).toBe(true);
    expect(libraryContains(LIBRARY, 'gamma')).toBe(true);
    expect(libraryContains(LIBRARY, 'docs')).toBe(true);
    expect(libraryContains(LIBRARY, 'nonexistent-term')).toBe(false);
  });

  it('is true for an empty query', () => {
    expect(libraryContains(LIBRARY, '')).toBe(true);
  });
});
