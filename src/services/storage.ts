import { get, set, del } from 'idb-keyval';
import { SAMPLE_FILES } from '../data/samples';
import { AppSettings, MarkdownFileRecord, FileHistoryItem } from '../types';

const STORAGE_KEYS = {
  RECENT_FILES: 'velox_recent_files_v2',
  FILE_HISTORY: 'velox_file_history_v2',
  SETTINGS: 'velox_settings_v1',
  FILE_HANDLE_PREFIX: 'velox_handle_',
  // Distinguishes "never initialised" from "the user cleared everything".
  // Without this, an empty array was indistinguishable from a fresh install, so
  // Clear History (and deleting the last sample) silently re-seeded the samples
  // on the very next read.
  INITIALIZED: 'velox_initialized_v1',
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: 'blue',
  fontSize: 16,
  wordWrap: true,
  lineNumbers: true,
  syncScroll: true,
  showOutline: false,
  defaultViewMode: 'preview',
  autoSave: true,
};

/** Build the seed records for the bundled sample documents. */
function buildSampleRecords(): MarkdownFileRecord[] {
  const now = Date.now();
  return SAMPLE_FILES.map((sample, idx) => ({
    ...sample,
    lastOpened: now - idx * 1800 * 1000,
    lastModified: now - idx * 3600 * 1000,
    hasFileSystemHandle: false,
  }));
}

export async function getRecentFiles(): Promise<MarkdownFileRecord[]> {
  // A read must never throw because a *write* failed. If storage is
  // unavailable the app degrades to an empty library and surfaces the problem on
  // the next save, rather than the whole Home view failing to populate.
  let readable = true;

  try {
    const initialised = await get<boolean>(STORAGE_KEYS.INITIALIZED);
    if (initialised === true) {
      // Fine: the library exists and may legitimately be empty.
      readable = true;
    }
  } catch {
    readable = false;
  }

  try {
    const records = await get<MarkdownFileRecord[]>(STORAGE_KEYS.RECENT_FILES);
    // An empty array is a legitimate state (the user cleared their library) and
    // must be honoured as-is. Previously `records.length > 0` meant "cleared"
    // was indistinguishable from "fresh install" and the samples came back.
    if (Array.isArray(records)) {
      return records;
    }
  } catch (err) {
    console.warn('Failed to load recent files from IDB, using localStorage fallback', err);
    readable = false;
    const local = localStorage.getItem(STORAGE_KEYS.RECENT_FILES);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Only seed a genuine first run, and only when we could actually read the
  // store. If the read failed we do not know whether this is a first run, so we
  // must not write.
  if (!readable) return [];

  let alreadyInitialised = false;
  try {
    alreadyInitialised = (await get<boolean>(STORAGE_KEYS.INITIALIZED)) === true;
  } catch {
    return [];
  }
  if (alreadyInitialised) return [];

  const initialFiles = buildSampleRecords();
  try {
    await saveAllRecentFiles(initialFiles);
  } catch (err) {
    // Still hand back the samples so the app is usable, even though they could
    // not be persisted.
    console.warn('Could not persist the starter documents', err);
  }
  return initialFiles;
}

export async function saveAllRecentFiles(files: MarkdownFileRecord[]): Promise<void> {
  const errors: unknown[] = [];

  try {
    await set(STORAGE_KEYS.RECENT_FILES, files);
  } catch (err) {
    errors.push(err);
    console.warn('IndexedDB set failed, falling back to localStorage', err);
  }

  try {
    // Mirror is metadata-only. Document bodies can be megabytes in aggregate and
    // localStorage caps out around 5MB, so a QuotaExceededError here used to
    // abort the whole write while the UI still reported a successful save.
    localStorage.setItem(
      STORAGE_KEYS.RECENT_FILES,
      JSON.stringify(
        files.map((f) => ({
          id: f.id,
          name: f.name,
          path: f.path,
          size: f.size,
          lastOpened: f.lastOpened,
          lastModified: f.lastModified,
          wordCount: f.wordCount,
          readingTimeMinutes: f.readingTimeMinutes,
          isPinned: f.isPinned,
          tags: f.tags,
          hasFileSystemHandle: f.hasFileSystemHandle,
        }))
      )
    );
  } catch (err) {
    errors.push(err);
    console.warn('localStorage mirror failed (non-fatal)', err);
  }

  // A first write must establish the sentinel even if the IDB write above threw.
  try {
    await set(STORAGE_KEYS.INITIALIZED, true);
  } catch (err) {
    errors.push(err);
  }

  // Sync to File History paths
  await syncFileHistory(files);

  if (errors.length > 0) {
    throw new Error(`Could not persist document library (${errors.length} backend error(s))`);
  }
}

export async function getFileHistory(): Promise<FileHistoryItem[]> {
  try {
    const history = await get<FileHistoryItem[]>(STORAGE_KEYS.FILE_HISTORY);
    if (history && history.length > 0) {
      return history;
    }
  } catch (err) {
    console.warn('Error fetching file history', err);
  }

  // Derive from recent files
  const files = await getRecentFiles();
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    size: f.size,
    lastOpened: f.lastOpened,
    wordCount: f.wordCount,
    isPinned: f.isPinned,
  }));
}

async function syncFileHistory(files: MarkdownFileRecord[]): Promise<void> {
  const history: FileHistoryItem[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    size: f.size,
    lastOpened: f.lastOpened,
    wordCount: f.wordCount,
    isPinned: f.isPinned,
  }));

  try {
    await set(STORAGE_KEYS.FILE_HISTORY, history);
  } catch (e) {
    console.warn('Error saving file history', e);
  }
}

export async function saveFileRecordImpl(
  file: MarkdownFileRecord,
  fileHandle?: FileSystemFileHandle
): Promise<void> {
  const updatedRecord: MarkdownFileRecord = {
    ...file,
    lastOpened: Date.now(),
    hasFileSystemHandle: !!fileHandle || file.hasFileSystemHandle,
  };

  const current = await getRecentFiles();
  // `id` is the only identity. Matching on `path` was actively harmful: the app
  // fabricated every path as C:\Users\Windows\Documents\<name>, so opening
  // `a\notes.md` and later `b\notes.md` collided and the second save silently
  // overwrote the first document's content and metadata.
  const existingIdx = current.findIndex((f) => f.id === file.id);

  let updatedList: MarkdownFileRecord[];
  if (existingIdx >= 0) {
    updatedList = [...current];
    const existing = updatedList[existingIdx];
    // A merge must never change identity, otherwise any tab holding the old id
    // can never resolve its record again and silently becomes unopenable.
    updatedList[existingIdx] = {
      ...existing,
      ...updatedRecord,
      id: existing.id,
      // `isPinned` is owned by the existing record. Every caller's default is
      // `false`, so taking it from the incoming record silently unpinned the
      // document on any ordinary save. togglePin is the only thing allowed to
      // change it.
      isPinned: existing.isPinned,
      tags: updatedRecord.tags?.length ? updatedRecord.tags : (existing.tags ?? []),
    };
  } else {
    updatedList = [updatedRecord, ...current];
  }

  // Sort by lastOpened desc
  updatedList.sort((a, b) => b.lastOpened - a.lastOpened);

  await saveAllRecentFiles(updatedList);

  if (fileHandle) {
    try {
      await set(`${STORAGE_KEYS.FILE_HANDLE_PREFIX}${updatedRecord.id}`, fileHandle);
    } catch (e) {
      console.warn('Could not store FileSystemFileHandle in IDB', e);
    }
  }
}

export async function getFileHandle(fileId: string): Promise<FileSystemFileHandle | undefined> {
  try {
    const handle = await get<FileSystemFileHandle>(`${STORAGE_KEYS.FILE_HANDLE_PREFIX}${fileId}`);
    return handle;
  } catch (e) {
    console.warn('Could not retrieve FileSystemFileHandle', e);
    return undefined;
  }
}

export async function deleteFileRecordImpl(fileId: string): Promise<void> {
  const current = await getRecentFiles();
  const filtered = current.filter((f) => f.id !== fileId);
  await saveAllRecentFiles(filtered);
  try {
    await del(`${STORAGE_KEYS.FILE_HANDLE_PREFIX}${fileId}`);
  } catch (e) {
    console.warn('Could not delete handle', e);
  }
}

export async function clearFileHistoryImpl(): Promise<void> {
  const errors: unknown[] = [];

  try {
    await set(STORAGE_KEYS.RECENT_FILES, []);
  } catch (e) {
    errors.push(e);
  }
  try {
    await set(STORAGE_KEYS.FILE_HISTORY, []);
  } catch (e) {
    errors.push(e);
  }
  try {
    localStorage.removeItem(STORAGE_KEYS.RECENT_FILES);
  } catch (e) {
    errors.push(e);
  }
  // Keep the sentinel set so the samples are not re-seeded on the next read.
  try {
    await set(STORAGE_KEYS.INITIALIZED, true);
  } catch (e) {
    errors.push(e);
  }

  if (errors.length > 0) {
    // Previously these two `set` calls were unguarded, so an unavailable
    // IndexedDB made Clear History a silent no-op: the promise rejected, the
    // caller's UI update never ran, and the records stayed put.
    throw new Error('Could not clear history: document storage is unavailable');
  }
}

export async function togglePinImpl(fileId: string): Promise<boolean> {
  const current = await getRecentFiles();
  let newStatus = false;
  const updated = current.map((f) => {
    if (f.id === fileId) {
      newStatus = !f.isPinned;
      return { ...f, isPinned: newStatus };
    }
    return f;
  });
  await saveAllRecentFiles(updated);
  return newStatus;
}

/**
 * Every library mutation is a read-modify-write over one shared record. Running
 * two concurrently (drop three files onto the window while saving one) let both
 * read the same snapshot, and the second write discarded the first one's
 * insertion — files silently vanished from history despite a success toast.
 * Chaining them makes each mutation observe the previous one's result.
 */
let writeChain: Promise<unknown> = Promise.resolve();

function serialise<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  // Keep the chain alive even when a caller rejects.
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export function saveFileRecord(
  file: MarkdownFileRecord,
  fileHandle?: FileSystemFileHandle
): Promise<void> {
  return serialise(() => saveFileRecordImpl(file, fileHandle));
}

export function deleteFileRecord(fileId: string): Promise<void> {
  return serialise(() => deleteFileRecordImpl(fileId));
}

export function clearFileHistory(): Promise<void> {
  return serialise(() => clearFileHistoryImpl());
}

export function togglePin(fileId: string): Promise<boolean> {
  return serialise(() => togglePinImpl(fileId));
}

export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Error reading settings', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.warn('Error saving settings', e);
  }
}
