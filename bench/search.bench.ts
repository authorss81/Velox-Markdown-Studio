/**
 * Measures the per-keystroke cost of the search path against a realistic library.
 * Run with: npx vite-node bench/search.bench.ts   (or via the script below)
 */
import { performance } from 'node:perf_hooks';
import { searchMarkdownFiles, filterFilesByQuery } from '../src/services/search';
import type { MarkdownFileRecord } from '../src/types';

function makeFile(i: number, words: number): MarkdownFileRecord {
  const body = Array.from(
    { length: words },
    (_, w) => `line ${w} of document ${i} discussing ${['alpha', 'beta', 'gamma', 'delta'][w % 4]} topics`
  ).join('\n');
  return {
    id: `doc-${i}`,
    name: `notes-${i}.md`,
    path: `C:\\Users\\USER\\Documents\\notes\\notes-${i}.md`,
    content: `# Notes ${i}\n\n${body}`,
    size: body.length,
    lastOpened: Date.now() - i * 1000,
    lastModified: Date.now(),
    wordCount: words,
    readingTimeMinutes: 2,
    isPinned: false,
    tags: ['Notes'],
  };
}

const CORPUS = Array.from({ length: 120 }, (_, i) => makeFile(i, 400));
const totalBytes = CORPUS.reduce((n, f) => n + f.content.length, 0);

function time(label: string, iterations: number, fn: (i: number) => void): void {
  // Warm up so the first-call index build is not counted as per-keystroke cost.
  for (let i = 0; i < 5; i++) fn(i);

  const started = performance.now();
  for (let i = 0; i < iterations; i++) fn(i);
  const elapsed = performance.now() - started;
  const per = elapsed / iterations;
  console.log(
    `${label.padEnd(42)} ${per.toFixed(3)} ms/op   (${iterations} ops in ${elapsed.toFixed(0)} ms)`
  );
}

console.log(`\ncorpus: ${CORPUS.length} files, ${(totalBytes / 1024).toFixed(0)} KB of markdown`);
console.log(`average document: ${(totalBytes / CORPUS.length / 1024).toFixed(1)} KB\n`);

/**
 * The pre-optimisation implementation, kept verbatim as a baseline so the
 * improvement is measured rather than asserted.
 */
function searchMarkdownFilesLegacy(
  files: MarkdownFileRecord[],
  keyword: string
): { id: string; matchesCount: number }[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return [];
  const results: { id: string; matchesCount: number }[] = [];

  for (const file of files) {
    const lines = file.content.split('\n');
    let totalMatches = 0;
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      let pos = lowerLine.indexOf(query);
      while (pos !== -1) {
        totalMatches++;
        pos = lowerLine.indexOf(query, pos + query.length);
      }
    }
    const nameMatches = file.name.toLowerCase().includes(query);
    const pathMatches = file.path.toLowerCase().includes(query);
    if (totalMatches > 0 || nameMatches || pathMatches) {
      results.push({ id: file.id, matchesCount: totalMatches });
    }
  }
  return results;
}

const QUERIES = ['a', 'al', 'alp', 'alph', 'alpha', 'topics', 'delta', 'zzz'];

console.log('--- baseline: the previous implementation ---');
time('legacy searchMarkdownFiles', 20, (i) => {
  searchMarkdownFilesLegacy(CORPUS, QUERIES[i % QUERIES.length]!);
});
time('legacy palette filter (toLowerCase)', 20, (i) => {
  CORPUS.filter(
    (f) => f.name.toLowerCase().includes('a') || f.content.toLowerCase().includes('a')
  ).slice(0, 5);
});

console.log('\n--- current ---');
time('searchMarkdownFiles (8 keystrokes)', 40, (i) => {
  searchMarkdownFiles(CORPUS, QUERIES[i % QUERIES.length]!);
});

time('filterFilesByQuery (palette)', 200, (i) => {
  filterFilesByQuery(CORPUS, QUERIES[i % QUERIES.length]!, 5);
});

// Simulates a typing burst against one unchanged library, which is the real
// interactive pattern: the index should be built once, then reused.
const started = performance.now();
for (let i = 0; i < 100; i++) searchMarkdownFiles(CORPUS, 'a');
console.log(`\n100 keystrokes over an unchanged library: ${(performance.now() - started).toFixed(1)} ms total`);

// And the cost of the library actually changing, which forces a rebuild.
let library = CORPUS;
const rebuild = performance.now();
for (let i = 0; i < 10; i++) {
  library = [...CORPUS.slice(1), makeFile(999 + i, 400)];
  searchMarkdownFiles(library, 'alpha');
}
console.log(`10 searches with a changed library (rebuild): ${(performance.now() - rebuild).toFixed(1)} ms total`);
console.log('');
