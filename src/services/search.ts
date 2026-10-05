import { MarkdownFileRecord, FileSearchResult, SearchContextSnippet } from '../types';

/**
 * Searches the content and metadata of all indexed markdown files
 * and extracts matching context snippets with line numbers and surrounding text.
 */
export function searchMarkdownFiles(
  files: MarkdownFileRecord[],
  keyword: string
): FileSearchResult[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return [];

  const results: FileSearchResult[] = [];

  for (const file of files) {
    const lines = file.content.split('\n');
    const matchedSnippets: SearchContextSnippet[] = [];
    let totalMatches = 0;

    // Check for match in file name or path
    const nameMatches = file.name.toLowerCase().includes(query);
    const pathMatches = file.path.toLowerCase().includes(query);

    // Search through each line in the file content
    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      let pos = lowerLine.indexOf(query);

      while (pos !== -1) {
        totalMatches++;

        // Only save up to 4 high-quality snippets per file for preview
        if (matchedSnippets.length < 4) {
          const matchStart = pos;
          const matchEnd = pos + query.length;

          // Extract surrounding text with boundary ellipsis
          const prefixStart = Math.max(0, matchStart - 45);
          const prefix = (prefixStart > 0 ? '...' : '') + line.substring(prefixStart, matchStart);

          const matchedWord = line.substring(matchStart, matchEnd);

          const suffixEnd = Math.min(line.length, matchEnd + 55);
          const suffix = line.substring(matchEnd, suffixEnd) + (suffixEnd < line.length ? '...' : '');

          matchedSnippets.push({
            lineNumber: index + 1,
            prefix,
            match: matchedWord,
            suffix,
            fullLine: line.trim(),
          });
        }

        pos = lowerLine.indexOf(query, pos + query.length);
      }
    });

    if (totalMatches > 0 || nameMatches || pathMatches) {
      // If matches were only in title/path and not content lines, create a summary snippet
      if (matchedSnippets.length === 0) {
        const previewLine = lines.find((l) => l.trim().length > 0) || file.name;
        matchedSnippets.push({
          lineNumber: 1,
          prefix: '',
          match: file.name,
          suffix: ' (matched in file title)',
          fullLine: previewLine,
        });
        totalMatches = Math.max(1, totalMatches);
      }

      results.push({
        file,
        matchesCount: totalMatches,
        snippets: matchedSnippets,
      });
    }
  }

  // Sort by number of matches and then recent activity
  results.sort((a, b) => {
    if (b.matchesCount !== a.matchesCount) {
      return b.matchesCount - a.matchesCount;
    }
    return b.file.lastOpened - a.file.lastOpened;
  });

  return results;
}
