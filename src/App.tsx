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
import { downloadTextFile } from './services/export';
import { SAMPLE_FILES } from './data/samples';
import { FileTab, MarkdownFileRecord, ViewMode, AppSettings } from './types';
import { UploadCloud } from 'lucide-react';

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
    if (!record) return;

    const handle = await getFileHandle(fileId);
    let contentToLoad = record.content;
    let actualName = record.name;

    if (handle) {
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

  // Open physical file from Windows via File System Access API
  const handleOpenLocalFile = useCallback(async () => {
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Markdown Files',
              accept: {
                'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'],
                'text/plain': ['.txt'],
              },
            },
          ],
          multiple: false,
        });

        if (handle) {
          const file = await handle.getFile();
          const text = await file.text();
          const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const wordCount = calculateWordCount(text);
          const readTime = calculateReadingTime(wordCount);

          const record: MarkdownFileRecord = {
            id: fileId,
            name: file.name,
            path: `C:\\Users\\Windows\\Documents\\${file.name}`,
            content: text,
            size: file.size,
            lastOpened: Date.now(),
            lastModified: file.lastModified || Date.now(),
            wordCount,
            readingTimeMinutes: readTime,
            isPinned: false,
            tags: ['Windows File'],
            hasFileSystemHandle: true,
          };

          await saveFileRecord(record, handle);
          setRecentFiles(await getRecentFiles());

          const newTab: FileTab = {
            fileId,
            name: file.name,
            path: record.path,
            content: text,
            originalContent: text,
            isDirty: false,
            viewMode: 'preview',
            cursorLine: 1,
            cursorCol: 1,
            fileHandle: handle,
          };

          setTabs((prev) => [...prev, newTab]);
          setActiveTabId(fileId);
          showToast(`Opened "${file.name}" from Windows disk`);
          return;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('showOpenFilePicker error or unsupported, falling back to input', err);
    }

    // Fallback: file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.mdown,.mkd,.txt';
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = (ev.target?.result as string) || '';
        const fileId = `file-${Date.now()}`;
        const wordCount = calculateWordCount(text);

        const record: MarkdownFileRecord = {
          id: fileId,
          name: file.name,
          path: `C:\\Users\\Windows\\Documents\\${file.name}`,
          content: text,
          size: file.size,
          lastOpened: Date.now(),
          lastModified: file.lastModified || Date.now(),
          wordCount,
          readingTimeMinutes: calculateReadingTime(wordCount),
          isPinned: false,
          tags: ['Imported'],
        };

        await saveFileRecord(record);
        setRecentFiles(await getRecentFiles());

        const newTab: FileTab = {
          fileId,
          name: file.name,
          path: record.path,
          content: text,
          originalContent: text,
          isDirty: false,
          viewMode: 'preview',
          cursorLine: 1,
          cursorCol: 1,
        };

        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(fileId);
        showToast(`Opened "${file.name}"`);
      };
      reader.readAsText(file);
    };
    input.click();
  }, [showToast]);

  // Create a new empty markdown document
  const handleNewFile = useCallback(() => {
    const fileId = `new-${Date.now()}`;
    const name = `Untitled-${tabs.length + 1}.md`;
    const initialContent = `# ${name.replace('.md', '')}\n\nStart typing your Markdown here...\n`;

    const newTab: FileTab = {
      fileId,
      name,
      path: `C:\\Users\\Windows\\Documents\\${name}`,
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

  // Verify File System permissions before saving
  const verifyPermission = async (fileHandle: any, readWrite: boolean) => {
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    try {
      if ((await fileHandle.queryPermission(options)) === 'granted') {
        return true;
      }
      if ((await fileHandle.requestPermission(options)) === 'granted') {
        return true;
      }
    } catch {
      // Permission API not supported or rejected
    }
    return false;
  };

  // Save changes directly back to disk or permanent memory
  const handleSave = useCallback(async () => {
    if (!activeTab) return;

    if (activeTab.fileHandle) {
      try {
        const hasPerm = await verifyPermission(activeTab.fileHandle, true);
        if (hasPerm) {
          const writable = await activeTab.fileHandle.createWritable();
          await writable.write(activeTab.content);
          await writable.close();

          setTabs((prev) =>
            prev.map((t) =>
              t.fileId === activeTab.fileId
                ? { ...t, originalContent: activeTab.content, isDirty: false }
                : t
            )
          );

          const wordCount = calculateWordCount(activeTab.content);
          const record: MarkdownFileRecord = {
            id: activeTab.fileId,
            name: activeTab.name,
            path: activeTab.path || `C:\\Users\\Windows\\Documents\\${activeTab.name}`,
            content: activeTab.content,
            size: new Blob([activeTab.content]).size,
            lastOpened: Date.now(),
            lastModified: Date.now(),
            wordCount,
            readingTimeMinutes: calculateReadingTime(wordCount),
            isPinned: recentFiles.find((f) => f.id === activeTab.fileId)?.isPinned || false,
            tags: recentFiles.find((f) => f.id === activeTab.fileId)?.tags || ['Edited'],
            hasFileSystemHandle: true,
          };

          await saveFileRecord(record, activeTab.fileHandle);
          setRecentFiles(await getRecentFiles());

          confetti({
            particleCount: 25,
            spread: 40,
            origin: { y: 0.9, x: 0.1 },
          });

          showToast(`Saved changes directly to Windows disk: ${activeTab.name}`);
          return;
        }
      } catch (err: any) {
        console.error('Failed writing to fileHandle, falling back to Save As', err);
      }
    }

    // Save in permanent memory
    const wordCount = calculateWordCount(activeTab.content);
    const record: MarkdownFileRecord = {
      id: activeTab.fileId,
      name: activeTab.name,
      path: activeTab.path || `C:\\Users\\Windows\\Documents\\${activeTab.name}`,
      content: activeTab.content,
      size: new Blob([activeTab.content]).size,
      lastOpened: Date.now(),
      lastModified: Date.now(),
      wordCount,
      readingTimeMinutes: calculateReadingTime(wordCount),
      isPinned: recentFiles.find((f) => f.id === activeTab.fileId)?.isPinned || false,
      tags: recentFiles.find((f) => f.id === activeTab.fileId)?.tags || ['Draft'],
    };

    await saveFileRecord(record);
    setRecentFiles(await getRecentFiles());

    setTabs((prev) =>
      prev.map((t) =>
        t.fileId === activeTab.fileId
          ? { ...t, originalContent: activeTab.content, isDirty: false }
          : t
      )
    );

    showToast(`Saved to Permanent Memory. Use "Save As" to save to a specific Windows folder.`);
  }, [activeTab, recentFiles, showToast]);

  // Save As: save as another file in Windows
  const handleSaveAs = useCallback(async () => {
    if (!activeTab) return;

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: activeTab.name.endsWith('.md') ? activeTab.name : `${activeTab.name}.md`,
          types: [
            {
              description: 'Markdown File',
              accept: { 'text/markdown': ['.md'] },
            },
          ],
        });

        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(activeTab.content);
          await writable.close();

          const file = await handle.getFile();
          const wordCount = calculateWordCount(activeTab.content);

          const record: MarkdownFileRecord = {
            id: activeTab.fileId,
            name: file.name,
            path: `C:\\Users\\Windows\\Documents\\${file.name}`,
            content: activeTab.content,
            size: file.size,
            lastOpened: Date.now(),
            lastModified: Date.now(),
            wordCount,
            readingTimeMinutes: calculateReadingTime(wordCount),
            // Preserve the user's own organisation across a Save As. These were
            // hard-coded, so saving a pinned document to a new location silently
            // unpinned it and replaced its tags with "Windows File".
            isPinned: recentFiles.find((r) => r.id === activeTab.fileId)?.isPinned ?? false,
            tags: recentFiles.find((r) => r.id === activeTab.fileId)?.tags ?? ['Windows File'],
            hasFileSystemHandle: true,
          };

          await saveFileRecord(record, handle);
          setRecentFiles(await getRecentFiles());

          setTabs((prev) =>
            prev.map((t) =>
              t.fileId === activeTab.fileId
                ? {
                    ...t,
                    name: file.name,
                    path: record.path,
                    originalContent: activeTab.content,
                    isDirty: false,
                    fileHandle: handle,
                  }
                : t
            )
          );

          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.8 },
          });

          showToast(`File saved as "${file.name}" on Windows disk!`);
          return;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('showSaveFilePicker failed or unsupported, using download fallback', err);
    }

    // Fallback: download file
    downloadTextFile(
      activeTab.name.endsWith('.md') ? activeTab.name : `${activeTab.name}.md`,
      activeTab.content,
      'text/markdown'
    );
    setTabs((prev) =>
      prev.map((t) =>
        t.fileId === activeTab.fileId ? { ...t, originalContent: activeTab.content, isDirty: false } : t
      )
    );
    showToast(`Downloaded "${activeTab.name}"`);
  }, [activeTab, showToast]);

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

      const items = e.dataTransfer?.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file && (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt'))) {
              const text = await file.text();
              const fileId = `drop-${Date.now()}-${i}`;
              const wordCount = calculateWordCount(text);

              const record: MarkdownFileRecord = {
                id: fileId,
                name: file.name,
                path: `C:\\Users\\Windows\\Documents\\${file.name}`,
                content: text,
                size: file.size,
                lastOpened: Date.now(),
                lastModified: file.lastModified || Date.now(),
                wordCount,
                readingTimeMinutes: calculateReadingTime(wordCount),
                isPinned: false,
                tags: ['Dropped File'],
              };

              await saveFileRecord(record);
              setRecentFiles(await getRecentFiles());

              const newTab: FileTab = {
                fileId,
                name: file.name,
                path: record.path,
                content: text,
                originalContent: text,
                isDirty: false,
                viewMode: 'preview',
                cursorLine: 1,
                cursorCol: 1,
              };

              setTabs((prev) => [...prev, newTab]);
              setActiveTabId(fileId);
              showToast(`Opened dropped file: "${file.name}"`);
            }
          }
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
