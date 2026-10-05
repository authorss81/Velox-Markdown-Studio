import { get, set, del } from 'idb-keyval';
import { SAMPLE_FILES } from '../data/samples';
import { AppSettings, MarkdownFileRecord, FileHistoryItem } from '../types';

const STORAGE_KEYS = {
  RECENT_FILES: 'velox_recent_files_v2',
  FILE_HISTORY: 'velox_file_history_v2',
  SETTINGS: 'velox_settings_v1',
  FILE_HANDLE_PREFIX: 'velox_handle_',
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: 'blue',
  fontSize: 14,
  wordWrap: true,
  lineNumbers: true,
  syncScroll: true,
  defaultViewMode: 'preview',
  autoSave: false,
};

export async function getRecentFiles(): Promise<MarkdownFileRecord[]> {
  try {
    const records = await get<MarkdownFileRecord[]>(STORAGE_KEYS.RECENT_FILES);
    if (records && records.length > 0) {
      return records;
    }
  } catch (err) {
    console.warn('Failed to load recent files from IDB, using localStorage fallback', err);
    const local = localStorage.getItem(STORAGE_KEYS.RECENT_FILES);
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Initialize with initial samples
  const now = Date.now();
  const initialFiles: MarkdownFileRecord[] = SAMPLE_FILES.map((sample, idx) => ({
    ...sample,
    lastOpened: now - idx * 1800 * 1000,
    lastModified: now - idx * 3600 * 1000,
    hasFileSystemHandle: false,
  }));

  await saveAllRecentFiles(initialFiles);
  return initialFiles;
}

export async function saveAllRecentFiles(files: MarkdownFileRecord[]): Promise<void> {
  try {
    await set(STORAGE_KEYS.RECENT_FILES, files);
  } catch (err) {
    console.warn('IndexedDB set failed, falling back to localStorage', err);
  }
  try {
    localStorage.setItem(STORAGE_KEYS.RECENT_FILES, JSON.stringify(files));
  } catch (err) {
    console.warn('localStorage set failed', err);
  }

  // Sync to File History paths
  await syncFileHistory(files);
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

export async function saveFileRecord(
  file: MarkdownFileRecord,
  fileHandle?: FileSystemFileHandle
): Promise<void> {
  const current = await getRecentFiles();
  const existingIdx = current.findIndex(
    (f) => f.id === file.id || (f.path && file.path && f.path === file.path)
  );

  const updatedRecord: MarkdownFileRecord = {
    ...file,
    lastOpened: Date.now(),
    hasFileSystemHandle: !!fileHandle || file.hasFileSystemHandle,
  };

  let updatedList: MarkdownFileRecord[];
  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = { ...updatedList[existingIdx], ...updatedRecord };
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

export async function deleteFileRecord(fileId: string): Promise<void> {
  const current = await getRecentFiles();
  const filtered = current.filter((f) => f.id !== fileId);
  await saveAllRecentFiles(filtered);
  try {
    await del(`${STORAGE_KEYS.FILE_HANDLE_PREFIX}${fileId}`);
  } catch (e) {
    console.warn('Could not delete handle', e);
  }
}

export async function clearFileHistory(): Promise<void> {
  await set(STORAGE_KEYS.RECENT_FILES, []);
  await set(STORAGE_KEYS.FILE_HISTORY, []);
  try {
    localStorage.removeItem(STORAGE_KEYS.RECENT_FILES);
  } catch (e) {
    console.warn(e);
  }
}

export async function togglePin(fileId: string): Promise<boolean> {
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
