import { MarkdownFileRecord, FileSearchResult, SearchContextSnippet } from '../types';

/**
 * One lowercase, line-split projection of a document, reused across keystrokes.
 *
 * The previous implementation called `content.split('\n')` and `toLowerCase()`
 * for every file on every keystroke. Across a library of documents that is
 * O(total bytes) of allocation per character typed, which is what made the
 * search box feel like it was dragging the whole app down with it.
 */
interface FileIndex {
  lower: string;
  /** Pre-split lines, kept alongside `lower` so snippets need no re-splitting. */
  lines: string[];
  nameLower: string;
  pathLower: string;
  firstNonEmpty: string;
}

/**
 * Keyed on the identity of the files array. App holds the library in state, so a
 * new array means the library genuinely changed; the same array means the index
 * is still valid and is reused for free.
 */
const indexCache = new WeakMap<MarkdownFileRecord[], Map<string, FileIndex>>();

function getIndex(files: MarkdownFileRecord[]): Map<string, FileIndex> {
  const cached = indexCache.get(files);
  if (cached) return cached;

  const built = new Map<string, FileIndex>();
  for (const file of files) {
    const lines = file.content.split('\n');
    built.set(file.id, {
      lower: file.content.toLowerCase(),
      lines,
      nameLower: file.name.toLowerCase(),
      pathLower: (file.path ?? '').toLowerCase(),
      firstNonEmpty: lines.find((l) => l.trim().length > 0) ?? file.name,
    });
  }

  indexCache.set(files, built);
  return built;
}

/** Maximum snippets kept per file; enough to preview, bounded so it cannot blow up. */
const MAX_SNIPPETS = 4;
/** Safety valve: a query matching a million times still terminates promptly. */
const MAX_MATCHES_SCANNED = 20000;

function buildSnippets(entry: FileIndex, query: string): {
  snippets: SearchContextSnippet[];
  total: number;
} {
  const snippets: SearchContextSnippet[] = [];
  let total = 0;

  for (let index = 0; index < entry.lines.length; index++) {
    const line = entry.lines[index];
    const lowerLine = line.toLowerCase();
    let pos = lowerLine.indexOf(query);

    while (pos !== -1) {
      total++;
      if (total > MAX_MATCHES_SCANNED) return { snippets, total };

      if (snippets.length < MAX_SNIPPETS) {
        const matchStart = pos;
        const matchEnd = pos + query.length;
        const prefixStart = Math.max(0, matchStart - 45);
        const suffixEnd = Math.min(line.length, matchEnd + 55);

        snippets.push({
          lineNumber: index + 1,
          prefix: (prefixStart > 0 ? '...' : '') + line.substring(prefixStart, matchStart),
          // Case-insensitive search must return the document's own casing.
          match: line.substring(matchStart, matchEnd),
          suffix: line.substring(matchEnd, suffixEnd) + (suffixEnd < line.length ? '...' : ''),
          fullLine: line.trim(),
        });
      }

      pos = lowerLine.indexOf(query, pos + query.length);
    }
  }

  return { snippets, total };
}

/**
 * Searches the content and metadata of all indexed markdown files and extracts
 * matching context snippets with line numbers and surrounding text.
 *
 * The signature is unchanged, so callers need no edits; the index behind it is
 * built once per library change instead of once per keystroke.
 */
export function searchMarkdownFiles(
  files: MarkdownFileRecord[],
  keyword: string
): FileSearchResult[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return [];

  const index = getIndex(files);
  const results: FileSearchResult[] = [];

  for (const file of files) {
    const entry = index.get(file.id);
    if (!entry) continue;

    const { snippets, total } = buildSnippets(entry, query);
    const nameMatches = entry.nameLower.includes(query);
    const pathMatches = entry.pathLower.includes(query);

    if (total > 0 || nameMatches || pathMatches) {
      // A hit on the title alone still deserves a result, with a synthetic
      // snippet so the UI has something to render.
      const finalSnippets =
        snippets.length > 0
          ? snippets
          : [
              {
                lineNumber: 1,
                prefix: '',
                match: file.name,
                suffix: ' (matched in file title)',
                fullLine: entry.firstNonEmpty,
              },
            ];

      results.push({
        file,
        matchesCount: Math.max(1, total),
        snippets: finalSnippets,
      });
    }
  }

  results.sort((a, b) => {
    if (b.matchesCount !== a.matchesCount) return b.matchesCount - a.matchesCount;
    return b.file.lastOpened - a.file.lastOpened;
  });

  return results;
}

/**
 * Cheap "does this library contain the string at all" check, for filtering large
 * lists (the command palette lists every document on every keystroke).
 */
export function libraryContains(files: MarkdownFileRecord[], keyword: string): boolean {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;
  const index = getIndex(files);
  for (const file of files) {
    const entry = index.get(file.id);
    if (!entry) continue;
    if (
      entry.nameLower.includes(query) ||
      entry.pathLower.includes(query) ||
      entry.lower.includes(query)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Files whose name, path or content contains `query`, capped at `limit`.
 *
 * The command palette used to filter with `f.content.toLowerCase()` inline,
 * which allocates a lowercase copy of every document on every keystroke. This
 * reuses the cached projection instead, so a keystroke is a substring scan over
 * text that is already in the right case.
 */
export function filterFilesByQuery(
  files: MarkdownFileRecord[],
  keyword: string,
  limit = 5
): MarkdownFileRecord[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return files.slice(0, limit);

  const index = getIndex(files);
  const matched: MarkdownFileRecord[] = [];

  for (const file of files) {
    const entry = index.get(file.id);
    if (!entry) continue;
    if (
      entry.nameLower.includes(query) ||
      entry.pathLower.includes(query) ||
      entry.lower.includes(query)
    ) {
      matched.push(file);
      if (matched.length >= limit) break;
    }
  }

  return matched;
}
