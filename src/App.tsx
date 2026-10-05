/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { TitleBar } from './components/TitleBar';
import { TabBar } from './components/TabBar';
import { CommandBar } from './components/CommandBar';
import { StatusBar } from './components/StatusBar';
import { HomePage } from './components/HomePage';
import { MarkdownPreview, MarkdownPreviewHandle } from './components/MarkdownPreview';
import { RawEditor, RawEditorHandle } from './components/RawEditor';
import { ImageLightboxModal } from './components/ImageLightboxModal';
import { CommandPalette } from './components/CommandPalette';
import { SampleFilesModal } from './components/SampleFilesModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ExportModal } from './components/ExportModal';
import {
  getRecentFiles,
  saveFileRecord,
  deleteFileRecord,
  clearFileHistory,
  togglePin,
  getFileHandle,
  getAppSettings,
  saveAppSettings,
} from './services/storage';
import {
  calculateWordCount,
  calculateReadingTime,
} from './services/markdown';
import { getFsAccess, isDialogCancellation, type DocumentFile } from './services/fsAccess';
import { getBridge, isElectronRuntime } from './types/ipc';
import { SAMPLE_FILES } from './data/samples';
import { FileTab, MarkdownFileRecord, ViewMode, AppSettings } from './types';
import { UploadCloud } from 'lucide-react';

/** Turn an unknown rejection into something worth showing a user. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return 'unknown error';
}

export default function App() {
  // Settings & Theme (Light / Dark)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fontSize, setFontSize] = useState(16);
  const [wordWrap, setWordWrap] = useState(true);
  const [syncScroll, setSyncScroll] = useState(true);

  // State: Permanent Memory Recent Files
  const [recentFiles, setRecentFiles] = useState<MarkdownFileRecord[]>([]);

  // State: Open tabs & active tab
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  // RawEditor calls this once it has consumed a jump request. Without it
  // targetLine stayed set forever, so the jump effect re-fired on every
  // keystroke and re-selected (and then overwrote) the target line.
  const clearTargetLine = useCallback(() => setTargetLine(null), []);

  // Editor and Preview refs for synchronized scrolling
  const editorRef = useRef<RawEditorHandle>(null);
  const previewRef = useRef<MarkdownPreviewHandle>(null);
  const isScrollingLock = useRef<'editor' | 'preview' | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Modals
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSampleLibrary, setShowSampleLibrary] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  // Feedback notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Persist view preferences the user actually changes.
  //
  // saveAppSettings had exactly one caller (the theme toggle), so fontSize,
  // wordWrap and syncScroll were read on mount but never written. Zoom,
  // word-wrap and sync-scroll therefore reset to defaults on every launch even
  // though the schema, the UI and the loading code all implied they persisted.
  //
  // Declared before every consumer: it is referenced in dependency arrays, so
  // defining it later would be a temporal-dead-zone error at render time.
  const persistViewPrefs = useCallback((patch: Partial<AppSettings>) => {
    try {
      saveAppSettings({ ...getAppSettings(), ...patch });
    } catch (err) {
      console.warn('Could not persist settings', err);
    }
  }, []);

  // Synchronized scrolling handlers
  const handleEditorScrollPercentage = useCallback((pct: number) => {
    if (!syncScroll) return;
    if (isScrollingLock.current === 'preview') return;
    isScrollingLock.current = 'editor';
    previewRef.current?.scrollToPercentage(pct);
    setTimeout(() => {
      if (isScrollingLock.current === 'editor') {
        isScrollingLock.current = null;
      }
    }, 45);
  }, [syncScroll]);

  const handlePreviewScrollPercentage = useCallback((pct: number) => {
    if (!syncScroll) return;
    if (isScrollingLock.current === 'editor') return;
    isScrollingLock.current = 'preview';
    editorRef.current?.scrollToPercentage(pct);
    setTimeout(() => {
      if (isScrollingLock.current === 'preview') {
        isScrollingLock.current = null;
      }
    }, 45);
  }, [syncScroll]);

  // Initialize theme and load settings on mount
  useEffect(() => {
    const settings = getAppSettings();
    const currentTheme = settings.theme || 'dark';
    setTheme(currentTheme);
    setFontSize(settings.fontSize || 16);
    setWordWrap(settings.wordWrap !== false);
    setSyncScroll(settings.syncScroll !== false);

    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(currentTheme);
    document.body.className =
      currentTheme === 'light'
        ? 'bg-slate-50 text-slate-900 select-none overflow-hidden antialiased'
        : 'bg-slate-950 text-slate-100 select-none overflow-hidden antialiased';
  }, []);

  // Toggle Light / Dark theme with full body class synchronisation.
  //
  // The DOM mutation, localStorage write and toast used to live inside the
  // setState updater. Updater functions must be pure: React may invoke them more
  // than once per commit, which duplicates toasts and interleaves theme writes.
  const handleToggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';

    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(next);
    document.body.className =
      next === 'light'
        ? 'bg-slate-50 text-slate-900 select-none overflow-hidden antialiased'
        : 'bg-slate-950 text-slate-100 select-none overflow-hidden antialiased';

    persistViewPrefs({ theme: next });
    showToast(`Switched to ${next === 'light' ? 'Light' : 'Dark'} theme`);
    setTheme(next);
  }, [theme, persistViewPrefs, showToast]);

  // Keep the native caption buttons legible against the current theme. Windows
  // draws them over our header, and their symbol colour is fixed when the window
  // is created, so without this a light theme leaves dark-on-dark symbols.
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    void bridge.window.setTitleBarOverlay(
      theme === 'light'
        ? { color: '#ffffff', symbolColor: '#0f172a', height: 42 }
        : { color: '#0f172a', symbolColor: '#cbd5e1', height: 42 }
    );
  }, [theme]);

  // Load permanent memory recent files on mount
  useEffect(() => {
    getRecentFiles().then((files) => {
      setRecentFiles(files);
      if (files.length > 0 && tabs.length === 0) {
        const welcome = files.find((f) => f.id === 'sample-welcome') || files[0];
        const newTab: FileTab = {
          fileId: welcome.id,
          name: welcome.name,
          path: welcome.path,
          content: welcome.content,
          originalContent: welcome.content,
          isDirty: false,
          viewMode: 'preview',
          cursorLine: 1,
          cursorCol: 1,
        };
        setTabs([newTab]);
        setActiveTabId(welcome.id);
      }
    });
  }, []);

  // Active Tab helper
  const activeTab = tabs.find((t) => t.fileId === activeTabId) || null;

  // Open file by ID from permanent memory, optionally jumping to a specific line
  const handleOpenFileById = useCallback(async (fileId: string, lineToJump?: number) => {
    const existing = tabs.find((t) => t.fileId === fileId);

    if (existing) {
      setActiveTabId(fileId);
      if (lineToJump && lineToJump > 0) {
        if (existing.viewMode === 'preview') {
          setTabs((prev) =>
            prev.map((t) => (t.fileId === fileId ? { ...t, viewMode: 'split' } : t))
          );
        }
        setTargetLine(lineToJump);
      }
      return;
    }

    const record = recentFiles.find((f) => f.id === fileId);
    if (!record) {
      showToast('That document is no longer in your library');
      return;
    }

    const fs = getFsAccess();
    const handle = await getFileHandle(fileId);
    let contentToLoad = record.content;
    let actualName = record.name;

    // Prefer the live file over the cached copy so external edits are picked up.
    if (fs.kind === 'electron' && record.path) {
      try {
        contentToLoad = (await fs.readDocument(record.path)) ?? record.content;
      } catch (err) {
        // Deleted or moved on disk: fall back to the library copy rather than
        // refusing to open, but say so.
        console.warn('Could not re-read from disk, using the library copy', err);
        showToast(`"${record.name}" could not be re-read from disk — showing the saved copy`);
      }
    } else if (handle) {
      try {
        const file = await handle.getFile();
        contentToLoad = await file.text();
        actualName = file.name;
      } catch (err) {
        console.warn('Could not read file handle directly, using cached content', err);
      }
    }

    const preferredMode = lineToJump ? 'split' : 'preview';

    const newTab: FileTab = {
      fileId: record.id,
      name: actualName,
      path: record.path,
      content: contentToLoad,
      originalContent: contentToLoad,
      isDirty: false,
      viewMode: preferredMode,
      cursorLine: lineToJump || 1,
      cursorCol: 1,
      fileHandle: handle,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(record.id);

    if (lineToJump && lineToJump > 0) {
      setTargetLine(lineToJump);
    }

    const updatedRecord: MarkdownFileRecord = {
      ...record,
      content: contentToLoad,
      lastOpened: Date.now(),
    };
    await saveFileRecord(updatedRecord, handle);
    setRecentFiles(await getRecentFiles());
  }, [tabs, recentFiles]);

  // Register an opened document in the library and open a tab for it.
  const adoptDocument = useCallback(
    async (doc: DocumentFile, tag: string, toastPrefix: string) => {
      // Reuse the record for a path we have seen before, so opening the same
      // file twice focuses the existing tab instead of creating a duplicate that
      // then fights over the same file.
      const existing = doc.path ? recentFiles.find((r) => r.path === doc.path) : undefined;
      const fileId = existing?.id ?? `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const wordCount = calculateWordCount(doc.content);

      const record: MarkdownFileRecord = {
        id: fileId,
        name: doc.name,
        // A real absolute path in Electron, empty in the browser. Never invented.
        path: doc.path,
        content: doc.content,
        size: doc.size,
        lastOpened: Date.now(),
        lastModified: doc.lastModified || Date.now(),
        wordCount,
        readingTimeMinutes: calculateReadingTime(wordCount),
        isPinned: existing?.isPinned ?? false,
        tags: existing?.tags ?? [tag],
        hasFileSystemHandle: !!doc.handle,
      };

      await saveFileRecord(record, doc.handle);
      setRecentFiles(await getRecentFiles());

      const alreadyOpen = tabs.find((t) => t.fileId === fileId);
      if (alreadyOpen) {
        setActiveTabId(fileId);
        showToast(`"${doc.name}" is already open`);
        return;
      }

      const newTab: FileTab = {
        fileId,
        name: doc.name,
        path: doc.path || undefined,
        content: doc.content,
        originalContent: doc.content,
        isDirty: false,
        viewMode: 'preview',
        cursorLine: 1,
        cursorCol: 1,
        fileHandle: doc.handle,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(fileId);
      showToast(`${toastPrefix} "${doc.name}"`);
    },
    [recentFiles, tabs, showToast]
  );

  // Open a file from disk.
  //
  // This used to be written entirely against the browser File System Access API.
  // Electron loads the app from a file:// origin where that API does not exist,
  // so the packaged app always fell through to a read-only <input type=file> and
  // could never write back to the file the user opened. It now goes through the
  // capability-detected adapter: native dialogs in Electron, the browser API in
  // a browser tab.
  const handleOpenLocalFile = useCallback(async () => {
    const fs = getFsAccess();
    try {
      const doc = await fs.openDocument();
      if (!doc) return; // user cancelled
      await adoptDocument(doc, 'Windows File', 'Opened');
    } catch (err) {
      if (isDialogCancellation(err)) return;
      console.error('Open failed', err);
      showToast(`Could not open file: ${errorMessage(err)}`);
    }
  }, [adoptDocument, showToast]);
  // Create a new empty markdown document
  const handleNewFile = useCallback(() => {
    const fileId = `new-${Date.now()}`;
    // Unique per document. Deriving this from the open-tab count reused the same
    // name (and therefore the same record key) after closing a tab.
    const name = `Untitled-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.md`;
    const initialContent = `# ${name.replace('.md', '')}\n\nStart typing your Markdown here...\n`;

    const newTab: FileTab = {
      fileId,
      name,
      // No path until the document is actually saved somewhere.
      content: initialContent,
      originalContent: '',
      isDirty: true,
      viewMode: 'split',
      cursorLine: 3,
      cursorCol: 1,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(fileId);
    showToast(`Created new document: ${name}`);
  }, [tabs.length, showToast]);

  // Update active tab content
  const handleContentChange = useCallback((newContent: string) => {
    if (!activeTabId) return;

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.fileId === activeTabId) {
          return {
            ...tab,
            content: newContent,
            isDirty: newContent !== tab.originalContent,
          };
        }
        return tab;
      })
    );
  }, [activeTabId]);

  // Debounced autosave.
  //
  // AppSettings.autoSave was declared and defaulted but read by nothing, so
  // there was no crash recovery at all: a crash or accidental quit lost every
  // keystroke since the last explicit save. This mirrors the in-progress buffer
  // into the document library so reopening the tab restores the work. It is
  // deliberately a *mirror* — the tab stays dirty, so the user is still told
  // there are unsaved changes and the dirty-close guard still applies. Nothing
  // is written to disk without an explicit Ctrl+S.
  const autosaveEnabled = useMemo(() => getAppSettings().autoSave !== false, []);
  const autosaveTimer = useRef<number | null>(null);
  const latestTabsRef = useRef<FileTab[]>(tabs);
  latestTabsRef.current = tabs;

  useEffect(() => {
    if (!autosaveEnabled) return;

    const dirty = latestTabsRef.current.filter((t) => t.isDirty);
    if (dirty.length === 0) return;

    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      void (async () => {
        for (const tab of latestTabsRef.current.filter((t) => t.isDirty)) {
          const wordCount = calculateWordCount(tab.content);
          const record: MarkdownFileRecord = {
            id: tab.fileId,
            name: tab.name,
            path: tab.path ?? '',
            content: tab.content,
            size: new Blob([tab.content]).size,
            lastOpened: Date.now(),
            lastModified: Date.now(),
            wordCount,
            readingTimeMinutes: calculateReadingTime(wordCount),
            isPinned: recentFiles.find((r) => r.id === tab.fileId)?.isPinned ?? false,
            tags: recentFiles.find((r) => r.id === tab.fileId)?.tags ?? ['Autosaved'],
            hasFileSystemHandle: !!tab.fileHandle,
          };
          try {
            await saveFileRecord(record, tab.fileHandle);
          } catch (err) {
            console.warn('Autosave failed', err);
          }
        }
      })();
    }, 1500);

    return () => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [tabs, autosaveEnabled, recentFiles]);

  // Verify File System permissions before saving (browser path only)
  const verifyPermission = async (fileHandle: FileSystemFileHandle, readWrite: boolean) => {
    const handle = fileHandle as FileSystemFileHandle & {
      queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
      requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
    };
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    try {
      if ((await handle.queryPermission?.(options)) === 'granted') return true;
      if ((await handle.requestPermission?.(options)) === 'granted') return true;
    } catch {
      // Permission API unsupported or rejected; fall through.
    }
    return false;
  };

  // Persist the active tab into the document library.
  const persistToLibrary = useCallback(
    async (tab: FileTab, tags: string[]) => {
      const wordCount = calculateWordCount(tab.content);
      const existing = recentFiles.find((r) => r.id === tab.fileId);
      const record: MarkdownFileRecord = {
        id: tab.fileId,
        name: tab.name,
        // Never fabricate a location. Empty means "this document has never been
        // written to disk", which is true and can be displayed honestly.
        path: tab.path ?? '',
        content: tab.content,
        size: new Blob([tab.content]).size,
        lastOpened: Date.now(),
        lastModified: Date.now(),
        wordCount,
        readingTimeMinutes: calculateReadingTime(wordCount),
        isPinned: existing?.isPinned ?? false,
        tags: existing?.tags ?? tags,
        hasFileSystemHandle: !!tab.fileHandle,
      };
      await saveFileRecord(record, tab.fileHandle);
      setRecentFiles(await getRecentFiles());
    },
    [recentFiles]
  );

  const markTabSaved = useCallback((fileId: string, content: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.fileId === fileId ? { ...t, originalContent: content, isDirty: false } : t))
    );
  }, []);

  // Save changes.
  //
  // Now genuinely writes back to the opened file: over IPC in Electron, through a
  // FileSystemFileHandle in a supporting browser. It used to attempt the handle
  // path, fail silently on the file:// origin, fall through to the library, and
  // then clear the dirty flag and claim success — so a user could believe a file
  // was saved when nothing had been written.
  const handleSave = useCallback(async () => {
    if (!activeTab) return;
    const fs = getFsAccess();

    // Electron: write to the real path the user opened.
    if (fs.kind === 'electron' && activeTab.path) {
      try {
        await fs.saveInPlace(activeTab.path, activeTab.content);
        markTabSaved(activeTab.fileId, activeTab.content);
        await persistToLibrary(activeTab, ['Windows File']);
        confetti({ particleCount: 25, spread: 40, origin: { y: 0.9, x: 0.1 } });
        showToast(`Saved to disk: ${activeTab.name}`);
        return;
      } catch (err) {
        if (isDialogCancellation(err)) return;
        console.error('Save to disk failed', err);
        showToast(`Could not write to disk: ${errorMessage(err)}`);
        // Deliberately do not clear the dirty flag: the file on disk is unchanged.
        return;
      }
    }

    // Browser with a handle.
    if (activeTab.fileHandle && fs.canSaveInPlace) {
      try {
        if (await verifyPermission(activeTab.fileHandle, true)) {
          const writable = await activeTab.fileHandle.createWritable();
          await writable.write(activeTab.content);
          await writable.close();
          markTabSaved(activeTab.fileId, activeTab.content);
          await persistToLibrary(activeTab, ['Windows File']);
          confetti({ particleCount: 25, spread: 40, origin: { y: 0.9, x: 0.1 } });
          showToast(`Saved: ${activeTab.name}`);
          return;
        }
        showToast('Permission denied — use "Save As" to choose a location');
        return;
      } catch (err) {
        console.error('Save via handle failed', err);
        showToast(`Could not save: ${errorMessage(err)}`);
        return;
      }
    }

    // No writable destination. Still keep the work in the library so it is not
    // lost, but say plainly that the file on disk was not touched.
    try {
      await persistToLibrary({ ...activeTab, path: undefined }, ['Draft']);
      markTabSaved(activeTab.fileId, activeTab.content);
      showToast('Saved to your library only — use "Save As" to write to a file on disk');
    } catch (err) {
      console.error('Library save failed', err);
      showToast(`Could not save: ${errorMessage(err)}`);
    }
  }, [activeTab, markTabSaved, persistToLibrary, showToast]);

  // Save As: choose a location on disk and write there.
  const handleSaveAs = useCallback(async () => {
    if (!activeTab) return;
    const fs = getFsAccess();
    const suggestedName = activeTab.name.toLowerCase().endsWith('.md')
      ? activeTab.name
      : `${activeTab.name}.md`;

    try {
      const doc = await fs.saveDocumentAs(activeTab.content, suggestedName);
      if (!doc) {
        // Either the user cancelled, or the browser fell back to a download.
        if (fs.kind === 'web') {
          await persistToLibrary(activeTab, ['Exported']);
          markTabSaved(activeTab.fileId, activeTab.content);
        }
        return;
      }

      const existing = recentFiles.find((r) => r.id === activeTab.fileId);
      const wordCount = calculateWordCount(activeTab.content);

      setTabs((prev) =>
        prev.map((t) =>
          t.fileId === activeTab.fileId
            ? {
                ...t,
                name: doc.name,
                path: doc.path || undefined,
                fileHandle: doc.handle,
                originalContent: activeTab.content,
                isDirty: false,
              }
            : t
        )
      );

      const record: MarkdownFileRecord = {
        id: activeTab.fileId,
        name: doc.name,
        path: doc.path,
        content: activeTab.content,
        size: doc.size,
        lastOpened: Date.now(),
        lastModified: doc.lastModified || Date.now(),
        wordCount,
        readingTimeMinutes: calculateReadingTime(wordCount),
        // Preserve the user's own organisation across a Save As. These were
        // hard-coded, so saving a pinned document to a new location silently
        // unpinned it and replaced its tags with "Windows File".
        isPinned: existing?.isPinned ?? false,
        tags: existing?.tags ?? ['Windows File'],
        hasFileSystemHandle: !!doc.handle,
      };

      await saveFileRecord(record, doc.handle);
      setRecentFiles(await getRecentFiles());

      confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
      showToast(fs.kind === 'electron' ? `Saved as "${doc.name}"` : `Exported "${doc.name}"`);
    } catch (err) {
      if (isDialogCancellation(err)) return;
      console.error('Save As failed', err);
      showToast(`Could not save: ${errorMessage(err)}`);
    }
  }, [activeTab, recentFiles, persistToLibrary, markTabSaved, showToast]);
  // Change active view mode
  const handleChangeViewMode = useCallback((mode: ViewMode) => {
    if (!activeTabId) return;
    setTabs((prev) =>
      prev.map((t) => (t.fileId === activeTabId ? { ...t, viewMode: mode } : t))
    );
  }, [activeTabId]);

  // Close a tab, refusing to silently discard unsaved work.
  //
  // This handler used to drop the tab unconditionally, so clicking the tab's ✕,
  // middle-clicking it, or pressing Ctrl+W threw away every unsaved edit — and
  // then showed a "Closed ..." toast, confirming the loss.
  const handleCloseTab = useCallback((fileId: string) => {
    const tabToClose = tabs.find((t) => t.fileId === fileId);
    if (!tabToClose) return;

    if (tabToClose.isDirty) {
      const discard = window.confirm(
        `"${tabToClose.name}" has unsaved changes.\n\nClose it and discard your edits?`
      );
      if (!discard) return;
    }

    const remaining = tabs.filter((t) => t.fileId !== fileId);
    setTabs(remaining);

    if (activeTabId === fileId) {
      if (remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].fileId);
      } else {
        setActiveTabId(null);
      }
    }
    showToast(
      tabToClose.isDirty
        ? `Discarded unsaved changes in "${tabToClose.name}"`
        : `Closed "${tabToClose.name}"`
    );
  }, [tabs, activeTabId, showToast]);

  // Warn before the window goes away with unsaved work in any tab. Without this,
  // Alt+F4, the native title-bar X and the in-app close button all quit the app
  // and discard every dirty tab with no prompt at all.
  const hasDirtyTabs = tabs.some((t) => t.isDirty);

  useEffect(() => {
    if (!hasDirtyTabs) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy signal still required by Chromium and Electron.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasDirtyTabs]);

  // Toggle pin in permanent memory
  const handleTogglePin = useCallback(async (fileId: string) => {
    await togglePin(fileId);
    setRecentFiles(await getRecentFiles());
  }, []);

  // Delete record from permanent memory
  const handleDeleteRecord = useCallback(async (fileId: string) => {
    const record = recentFiles.find((f) => f.id === fileId);
    if (!record) return;
    const confirmed = window.confirm(
      `Remove "${record.name}" from your document library?\n\nThis does not delete the file on disk.`
    );
    if (!confirmed) return;
    try {
      await deleteFileRecord(fileId);
      setRecentFiles(await getRecentFiles());
      showToast('Removed from permanent memory');
    } catch (err) {
      console.error(err);
      showToast('Could not remove: document storage unavailable');
    }
  }, [recentFiles, showToast]);

  // Clear all file history
  const handleClearHistory = useCallback(async () => {
    const confirmed = window.confirm(
      'Clear your entire document library?\n\nThis removes every remembered document from the app (files on disk are untouched) and cannot be undone.'
    );
    if (!confirmed) return;
    try {
      await clearFileHistory();
      setRecentFiles([]);
      showToast('File history cleared');
    } catch (err) {
      console.error(err);
      showToast('Could not clear history: document storage unavailable');
    }
  }, [showToast]);

  // Insert markdown tag helper
  const handleInsertMarkdown = useCallback((prefix: string, suffix = '', defaultText = '') => {
    if (activeTab?.viewMode === 'preview') {
      handleChangeViewMode('split');
    }
    setTimeout(() => {
      editorRef.current?.insertText(prefix, suffix, defaultText);
    }, 60);
  }, [activeTab?.viewMode, handleChangeViewMode]);

  // Global Keyboard Shortcuts (Ctrl+S, Ctrl+Shift+S, Ctrl+O, Ctrl+N, Ctrl+K, Ctrl+W, F1)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never act on a global shortcut while a dialog owns the keyboard.
      // Without this guard, Ctrl+W behind the Shortcuts or Export modal closed
      // the active document and discarded unsaved edits, and Ctrl+S saved the
      // document while the user was typing in the palette's search box.
      if (
        showCommandPalette ||
        showShortcuts ||
        showExportModal ||
        showSampleLibrary ||
        lightboxImage
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAs();
        } else {
          handleSave();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenLocalFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        if (activeTabId) {
          e.preventDefault();
          handleCloseTab(activeTabId);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      } else if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleSave,
    handleSaveAs,
    handleOpenLocalFile,
    handleNewFile,
    handleCloseTab,
    activeTabId,
    showCommandPalette,
    showShortcuts,
    showExportModal,
    showSampleLibrary,
    lightboxImage,
  ]);

  // Drag and Drop files onto window with visual overlay
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter = 0;

      const fs = getFsAccess();
      const items = e.dataTransfer?.items;
      if (!items || items.length === 0) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;

        const file = item.getAsFile();
        if (!file) continue;
        if (!/\.(md|markdown|mdown|mkd|txt)$/i.test(file.name)) continue;

        try {
          // Electron 32 removed File.path, so the real location comes from the
          // preload bridge. Dropped files therefore get a genuine path and can be
          // saved back, where before they were permanently read-only.
          const droppedPath = isElectronRuntime() ? getBridge()?.pathForFile(file) ?? '' : '';
          const doc = droppedPath
            ? await fs.openDroppedPath(droppedPath)
            : {
                path: '',
                name: file.name,
                content: await file.text(),
                size: file.size,
                lastModified: file.lastModified || Date.now(),
              };
          await adoptDocument(doc, 'Dropped File', 'Opened dropped file');
        } catch (err) {
          if (isDialogCancellation(err)) continue;
          console.error('Drop failed', err);
          showToast(`Could not open "${file.name}": ${errorMessage(err)}`);
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [showToast]);

  const isLight = theme === 'light';

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden font-sans transition-colors duration-150 ${
      isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
    }`}>
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-sky-500/15 backdrop-blur-sm border-4 border-dashed border-sky-500 flex flex-col items-center justify-center pointer-events-none animate-in fade-in">
          <div className="p-6 rounded-3xl bg-slate-900/95 text-white shadow-2xl border border-sky-400 flex flex-col items-center gap-3">
            <UploadCloud className="w-14 h-14 text-sky-400 animate-bounce" />
            <div className="text-base font-bold">Drop Markdown files here to open</div>
            <div className="text-xs text-slate-400">Supports .md, .markdown, .txt</div>
          </div>
        </div>
      )}

      {/* Windows 11 Title Bar (h-11, increased by 2 points) */}
      <TitleBar
        activeTab={activeTab}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenSearch={() => setShowCommandPalette(true)}
        onNewFile={handleNewFile}
        onOpenFile={handleOpenLocalFile}
      />

      {/* Tabs Bar (h-11, increased by 2 points to match TitleBar) */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        theme={theme}
        onSelectTab={(id) => setActiveTabId(id)}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewFile}
      />

      {/* Command Bar with Toolbar actions, working zoom, sync scroll toggle, and working export */}
      <CommandBar
        viewMode={activeTab?.viewMode || 'preview'}
        theme={theme}
        fontSize={fontSize}
        wordWrap={wordWrap}
        syncScroll={syncScroll}
        onToggleSyncScroll={() => {
          const next = !syncScroll;
          setSyncScroll(next);
          persistViewPrefs({ syncScroll: next });
          showToast(`Sync Scroll ${next ? 'Enabled' : 'Disabled'}`);
        }}
        onChangeViewMode={handleChangeViewMode}
        onNewFile={handleNewFile}
        onOpenFile={handleOpenLocalFile}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onInsertMarkdown={handleInsertMarkdown}
        onOpenExportModal={() => setShowExportModal(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onToggleWordWrap={() => {
          const next = !wordWrap;
          setWordWrap(next);
          persistViewPrefs({ wordWrap: next });
          showToast(`Word wrap ${next ? 'on' : 'off'}`);
        }}
        onZoomIn={() => {
          const next = Math.min(fontSize + 2, 32);
          setFontSize(next);
          persistViewPrefs({ fontSize: next });
          showToast(`Zoom: ${next}px`);
        }}
        onZoomOut={() => {
          const next = Math.max(fontSize - 2, 11);
          setFontSize(next);
          persistViewPrefs({ fontSize: next });
          showToast(`Zoom: ${next}px`);
        }}
        isDirty={activeTab?.isDirty || false}
        hasHandle={!!activeTab?.fileHandle}
        isHomeView={activeTabId === null}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {activeTabId === null || !activeTab ? (
          /* Home Page with Permanent Memory & Search */
          <HomePage
            recentFiles={recentFiles}
            theme={theme}
            onOpenFileById={handleOpenFileById}
            onOpenLocalFile={handleOpenLocalFile}
            onNewFile={handleNewFile}
            onOpenSampleLibrary={() => setShowSampleLibrary(true)}
            onTogglePin={handleTogglePin}
            onDeleteRecord={handleDeleteRecord}
            onClearHistory={handleClearHistory}
          />
        ) : (
          /* Active Document Viewer / Editor */
          <div className="h-full w-full flex overflow-hidden">
            {/* View Mode: Raw Only */}
            {activeTab.viewMode === 'raw' && (
              <div className="h-full w-full">
                <RawEditor
                  ref={editorRef}
                  content={activeTab.content}
                  fontSize={fontSize}
                  wordWrap={wordWrap}
                  theme={theme}
                  targetLine={targetLine}
                  onTargetLineHandled={clearTargetLine}
                  onChange={handleContentChange}
                  onCursorChange={(line, col) => setCursorPos({ line, col })}
                />
              </div>
            )}

            {/* View Mode: Preview Only */}
            {activeTab.viewMode === 'preview' && (
              <div className={`h-full w-full ${isLight ? 'bg-white' : 'bg-slate-950'}`}>
                <MarkdownPreview
                  content={activeTab.content}
                  fontSize={fontSize}
                  theme={theme}
                  onContentChange={handleContentChange}
                  onImageClick={(src, alt) => setLightboxImage({ src, alt })}
                />
              </div>
            )}

            {/* View Mode: Split (Raw + Preview side-by-side with synchronized scrolling) */}
            {activeTab.viewMode === 'split' && (
              <div className={`h-full w-full flex divide-x ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
                <div className="w-1/2 h-full">
                  <RawEditor
                    ref={editorRef}
                    content={activeTab.content}
                    fontSize={fontSize}
                    wordWrap={wordWrap}
                    theme={theme}
                    targetLine={targetLine}
                    onTargetLineHandled={clearTargetLine}
                    onChange={handleContentChange}
                    onScrollPercentage={handleEditorScrollPercentage}
                    onCursorChange={(line, col) => setCursorPos({ line, col })}
                  />
                </div>
                <div className={`w-1/2 h-full ${isLight ? 'bg-white' : 'bg-slate-950'}`}>
                  <MarkdownPreview
                    ref={previewRef}
                    content={activeTab.content}
                    fontSize={fontSize}
                    theme={theme}
                    onContentChange={handleContentChange}
                    onScrollPercentage={handlePreviewScrollPercentage}
                    onImageClick={(src, alt) => setLightboxImage({ src, alt })}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className={`absolute bottom-4 right-4 z-50 border px-4 py-2.5 rounded-xl text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom-2 ${
            isLight
              ? 'bg-white border-sky-300 text-slate-800 shadow-slate-300/50'
              : 'bg-slate-900 border-sky-500/50 text-slate-100 shadow-2xl'
          }`}>
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
            <span>{toastMessage}</span>
          </div>
        )}
      </main>

      {/* Windows Status Bar */}
      <StatusBar
        activeTab={activeTab}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        theme={theme}
      />

      {/* Export Modal with Download, HTML, and Copy options */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        fileName={activeTab?.name || 'document.md'}
        markdownContent={activeTab?.content || ''}
        theme={theme}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        recentFiles={recentFiles}
        theme={theme}
        onOpenFileById={(fileId) => handleOpenFileById(fileId)}
        onNewFile={handleNewFile}
        onOpenFile={handleOpenLocalFile}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onChangeViewMode={handleChangeViewMode}
        onOpenSampleLibrary={() => setShowSampleLibrary(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onPrintPdf={() => setShowExportModal(true)}
      />

      {/* Shortcuts Reference Modal */}
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        theme={theme}
      />

      {/* Sample Files Modal */}
      <SampleFilesModal
        isOpen={showSampleLibrary}
        onClose={() => setShowSampleLibrary(false)}
        onSelectSample={async (sampleId) => {
          const sample = SAMPLE_FILES.find((s) => s.id === sampleId);
          if (!sample) return;

          // The sample list is static but opening delegated to the persisted
          // record, so once a sample had been cleared from the library the click
          // closed the modal and did nothing at all. Re-seed the record instead.
          const existing = recentFiles.find((r) => r.id === sample.id);
          if (existing) {
            await handleOpenFileById(sample.id);
            return;
          }

          const now = Date.now();
          const record: MarkdownFileRecord = {
            ...sample,
            lastOpened: now,
            lastModified: now,
            hasFileSystemHandle: false,
          };
          try {
            await saveFileRecord(record);
            setRecentFiles(await getRecentFiles());
            await handleOpenFileById(sample.id);
          } catch (err) {
            console.error(err);
            showToast(`Could not open "${sample.name}": document storage unavailable`);
          }
        }}
      />

      {/* Image Lightbox Modal */}
      <ImageLightboxModal
        imageSrc={lightboxImage?.src || null}
        imageAlt={lightboxImage?.alt || ''}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );
}
