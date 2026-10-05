export type ViewMode = 'preview' | 'raw' | 'split';

export interface FileHistoryItem {
  id: string;
  name: string;
  path: string;
  size: number;
  lastOpened: number; // Unix timestamp in ms
  wordCount: number;
  isPinned?: boolean;
}

export interface MarkdownFileRecord {
  id: string;
  name: string;
  path: string;
  content: string;
  size: number;
  lastOpened: number; // Unix timestamp ms
  lastModified: number; // Unix timestamp ms
  wordCount: number;
  readingTimeMinutes: number;
  isPinned: boolean;
  tags: string[];
  hasFileSystemHandle?: boolean;
}

export interface SearchContextSnippet {
  lineNumber: number;
  prefix: string;
  match: string;
  suffix: string;
  fullLine: string;
}

export interface FileSearchResult {
  file: MarkdownFileRecord;
  matchesCount: number;
  snippets: SearchContextSnippet[];
}

export interface FileTab {
  fileId: string;
  name: string;
  path?: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  viewMode: ViewMode;
  cursorLine: number;
  cursorCol: number;
  fileHandle?: FileSystemFileHandle;
}

export type AccentColor = 'blue' | 'cyan' | 'purple' | 'emerald' | 'amber';

export interface AppSettings {
  theme: 'dark' | 'light';
  accentColor: AccentColor;
  fontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  syncScroll: boolean;
  defaultViewMode: ViewMode;
  autoSave: boolean;
}
