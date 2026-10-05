import { getBridge, type BridgeDocument } from '../types/ipc';

/**
 * One file-open/save implementation for both environments.
 *
 * Previously all file access was written against the browser File System Access
 * API. That API is unavailable on the `file://` origin Electron loads, so the
 * packaged app always fell through to a read-only `<input type=file>` and could
 * never write back to the file the user opened. This adapter prefers the
 * Electron bridge when it exists and falls back to the browser API otherwise, so
 * `npm run dev` in a browser still works.
 */

export type FsKind = 'electron' | 'web' | 'read-only';

export interface DocumentFile {
  /**
   * Absolute path when the platform discloses one (Electron). Empty string in the
   * browser: the File System Access API deliberately does not reveal the path,
   * and inventing one is what caused documents to overwrite each other.
   */
  path: string;
  name: string;
  content: string;
  size: number;
  lastModified: number;
  /** Browser only; Electron writes through the path instead. */
  handle?: FileSystemFileHandle;
}

export interface FsAccess {
  readonly kind: FsKind;
  /** True when this environment can write back over an opened file's path. */
  readonly canSaveInPlace: boolean;
  openDocument(): Promise<DocumentFile | null>;
  openDroppedPath(filePath: string): Promise<DocumentFile>;
  saveInPlace(filePath: string, content: string): Promise<void>;
  saveDocumentAs(content: string, suggestedName: string): Promise<DocumentFile | null>;
  readDocument(filePath: string): Promise<string | null>;
}

/** True when a rejection is the user dismissing a native dialog, not a fault. */
export function isDialogCancellation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string; message?: string };
  return e.name === 'AbortError' || e.code === 'ERR_CANCELED' || /abort|cancel/i.test(e.message ?? '');
}

function toDocumentFile(doc: BridgeDocument): DocumentFile {
  return {
    path: doc.path,
    name: doc.name,
    content: doc.content,
    size: doc.size,
    lastModified: doc.lastModified,
  };
}

const MARKDOWN_TYPES = [
  { description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'] } },
];

function electronAccess(): FsAccess {
  const bridge = getBridge()!;
  return {
    kind: 'electron',
    canSaveInPlace: true,
    async openDocument() {
      // Null means the user dismissed the native dialog, not a failure.
      const doc = await bridge.fs.open();
      return doc ? toDocumentFile(doc) : null;
    },
    async openDroppedPath(filePath) {
      return toDocumentFile(await bridge.fs.openPath(filePath));
    },
    async saveInPlace(filePath, content) {
      await bridge.fs.save(filePath, content);
    },
    async saveDocumentAs(content, suggestedName) {
      const doc = await bridge.fs.saveAs(content, suggestedName);
      return doc ? toDocumentFile(doc) : null;
    },
    async readDocument(filePath) {
      return bridge.fs.read(filePath);
    },
  };
}

function webAccess(): FsAccess {
  const usePicker = typeof window.showOpenFilePicker === 'function';
  const useSavePicker = typeof window.showSaveFilePicker === 'function';

  return {
    kind: 'web',
    canSaveInPlace: usePicker,
    async openDocument() {
      if (usePicker) {
        const [handle] = await window.showOpenFilePicker!({
          multiple: false,
          types: MARKDOWN_TYPES,
        });
        const file = await handle.getFile();
        return {
          // No path is available in the browser. Leave it empty rather than
          // fabricating C:\Users\Windows\Documents\<name>, which used to be used
          // as a database key and made same-named documents collide.
          path: '',
          name: file.name,
          content: await file.text(),
          size: file.size,
          lastModified: file.lastModified,
          handle,
        };
      }

      // Last resort: a plain file input. Read-only, and the app says so.
      return new Promise<DocumentFile | null>((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.markdown,.mdown,.mkd,.txt';
        input.style.display = 'none';
        input.onchange = async () => {
          const file = input.files?.[0];
          document.body.removeChild(input);
          if (!file) {
            resolve(null);
            return;
          }
          try {
            resolve({
              path: '',
              name: file.name,
              content: await file.text(),
              size: file.size,
              lastModified: file.lastModified,
            });
          } catch (err) {
            reject(err);
          }
        };
        // A cancelled picker fires no event in some browsers; resolve on blur.
        input.oncancel = () => {
          if (document.body.contains(input)) document.body.removeChild(input);
          resolve(null);
        };
        document.body.appendChild(input);
        input.click();
      });
    },
    async openDroppedPath() {
      throw new Error('Drag-and-drop paths are only available in the desktop app');
    },
    async saveInPlace() {
      throw new Error('In-place saving requires the desktop app or a browser with the File System Access API');
    },
    async saveDocumentAs(content, suggestedName) {
      if (useSavePicker) {
        const handle = await window.showSaveFilePicker!({
          suggestedName,
          types: MARKDOWN_TYPES,
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        const file = await handle.getFile();
        return {
          path: '',
          name: file.name,
          content,
          size: file.size,
          lastModified: file.lastModified,
          handle,
        };
      }

      // No picker: hand the file to the browser's download flow. This cannot
      // update the original file, and callers must not claim that it did.
      const { downloadTextFile } = await import('./export');
      const name = suggestedName.toLowerCase().endsWith('.md') ? suggestedName : `${suggestedName}.md`;
      downloadTextFile(name, content, 'text/markdown');
      return null;
    },
    async readDocument() {
      // A browser handle must be re-read through the handle itself; the cached
      // library copy is the honest fallback.
      return null;
    },
  };
}

function readOnlyAccess(reason: string): FsAccess {
  const fail = async (): Promise<never> => {
    throw new Error(reason);
  };
  return {
    kind: 'read-only',
    canSaveInPlace: false,
    openDocument: fail,
    openDroppedPath: fail,
    saveInPlace: fail,
    saveDocumentAs: fail,
    readDocument: async () => null,
  };
}

let cached: FsAccess | null = null;

/** Detect once and reuse. The environment cannot change mid-session. */
export function getFsAccess(): FsAccess {
  if (cached) return cached;

  if (typeof window === 'undefined') {
    cached = readOnlyAccess('No filesystem available');
  } else if (getBridge()) {
    cached = electronAccess();
  } else if (typeof window.showOpenFilePicker === 'function') {
    cached = webAccess();
  } else {
    cached = webAccess(); // still supports the <input type=file> read path
  }

  return cached;
}

/** Human-readable capability summary, for the UI and for diagnostics. */
export function describeFsAccess(fs: FsAccess = getFsAccess()): string {
  switch (fs.kind) {
    case 'electron':
      return 'Desktop: native file dialogs, saves directly to disk';
    case 'web':
      return fs.canSaveInPlace
        ? 'Browser: File System Access API available'
        : 'Browser: read-only, saving downloads a copy';
    default:
      return 'No filesystem access';
  }
}
