const { ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

/**
 * A Markdown editor should only ever touch Markdown-ish files, and nothing
 * enormous. Anything else is rejected before it reaches the filesystem.
 */
const ALLOWED_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdtxt', '.txt']);
const MAX_BYTES = 8 * 1024 * 1024;

const FILE_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdtxt'] },
  { name: 'Text', extensions: ['txt'] },
];

/**
 * Paths the user has actually chosen, owned entirely by this process.
 *
 * The renderer cannot write to an arbitrary location: fs:save and fs:read only
 * accept a path that is already in this set, and the only ways in are a native
 * dialog or a validated drag-and-drop. Without this, a markdown XSS payload
 * would have had unrestricted write access to the user's disk.
 */
const authorizedPaths = new Set();

function isAllowedPath(filePath) {
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Throwing keeps the rejection explicit and reaches the renderer as an Error. */
async function assertReadable(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('No file path supplied');
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('Refusing a relative path');
  }
  if (!isAllowedPath(filePath)) {
    throw new Error(`Unsupported file type: ${path.extname(filePath) || '(none)'}`);
  }
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('Not a file');
  }
  if (stat.size > MAX_BYTES) {
    throw new Error(
      `File is too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, limit ${
        MAX_BYTES / 1024 / 1024
      } MB)`
    );
  }
  return stat;
}

function requireAuthorized(filePath) {
  if (typeof filePath !== 'string' || !authorizedPaths.has(path.normalize(filePath))) {
    throw new Error('Path is not authorised: open the file through the app first');
  }
  return path.normalize(filePath);
}

async function readDocument(filePath) {
  const stat = await assertReadable(filePath);
  const content = await fs.readFile(filePath, 'utf8');
  return {
    path: filePath,
    name: path.basename(filePath),
    content,
    size: stat.size,
    lastModified: stat.mtimeMs,
  };
}

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

/**
 * True when the user dismissed a dialog rather than hitting an error. Callers use
 * this to stay silent instead of showing an error the user did not cause.
 */
function isCancellation(err) {
  return err && (err.code === 'ERR_CANCELED' || /cancel/i.test(err.message || ''));
}

/**
 * A file the OS asked us to open, waiting for the renderer to be ready.
 *
 * Windows launches the app with the document path as argv[1] when a .md is
 * double-clicked. The renderer cannot receive that directly: it may not have
 * mounted yet, and Electron gives no renderer-side hook for a cold start. So the
 * request is queued here and either consumed on mount or pushed once the window
 * exists.
 */
let pendingOpenPath = null;
let resolveOpenWindow = null;

function setOpenWindowResolver(fn) {
  resolveOpenWindow = fn;
}

/**
 * Pull a document path out of a command line.
 *
 * Deliberately shape-based rather than positional: argv[0] is the exe in a
 * packaged app but `electron.exe` in development, and Electron switches such as
 * `--inspect` can appear anywhere. So a candidate must be an absolute path to an
 * existing file with an allowed extension before it is believed.
 */
function extractOpenPath(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (typeof arg !== 'string' || arg.length === 0) continue;
    if (arg.startsWith('-')) continue;
    if (!path.isAbsolute(arg)) continue;
    if (!ALLOWED_EXTENSIONS.has(path.extname(arg).toLowerCase())) continue;
    try {
      if (!fsSync.statSync(arg).isFile()) continue;
    } catch {
      continue;
    }
    return arg;
  }
  return null;
}

/** Validate and queue a launch/second-instance request. Returns the path if accepted. */
function queueOpenFromArgv(argv) {
  const candidate = extractOpenPath(argv);
  if (!candidate) return null;
  pendingOpenPath = candidate;
  return candidate;
}

/** Take the queued path, if any. Called by the renderer once it can act on it. */
function consumePendingOpen() {
  const queued = pendingOpenPath;
  pendingOpenPath = null;
  return queued;
}

/** Deliver the queued path to a live window, if there is one. */
function pushPendingOpen() {
  if (!pendingOpenPath || !resolveOpenWindow) return;
  const win = resolveOpenWindow();
  if (!win || win.isDestroyed()) return;
  const queued = pendingOpenPath;
  pendingOpenPath = null;
  win.webContents.send('app:open-file', queued);
}

function register() {
  // ---- window -------------------------------------------------------------
  ipcMain.handle('window:minimize', () => {
    focusedWindow()?.minimize();
  });

  ipcMain.handle('window:toggle-maximize', () => {
    const win = focusedWindow();
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });

  ipcMain.handle('window:is-maximized', () => focusedWindow()?.isMaximized() ?? false);

  ipcMain.handle('window:close', () => {
    // Not destroy(): close() runs beforeunload, which is what triggers the
    // renderer's unsaved-changes guard. Destroying here would bypass it and
    // silently discard dirty tabs.
    focusedWindow()?.close();
  });

  /**
   * Whole-window zoom. Per-pane font scaling leaves the toolbar, tab strip and
   * status bar at 12px next to a 32px document, so zoom is applied at the
   * Chromium level and the panes stop scaling themselves. Clamped to the same
   * 13-26px range the UI offers, expressed as a factor of the 16px base.
   */
  ipcMain.handle('window:set-zoom', (_event, fontSize) => {
    const win = focusedWindow();
    if (!win || win.isDestroyed()) return 1;
    const size = Number(fontSize);
    const clamped = Number.isFinite(size) ? Math.min(26, Math.max(13, size)) : 16;
    win.webContents.setZoomFactor(clamped / 16);
    return clamped / 16;
  });

  /**
   * Repaint the native caption buttons when the app theme changes. Without this
   * the symbols stay whatever colour they were created with, so a dark app ends
   * up with invisible (or unreadable) window controls.
   */
  ipcMain.handle('window:set-titlebar-overlay', (_event, options) => {
    const win = focusedWindow();
    if (!win || typeof win.setTitleBarOverlay !== 'function') return false;
    const color = typeof options?.color === 'string' ? options.color : '#0f172a';
    const symbolColor = typeof options?.symbolColor === 'string' ? options.symbolColor : '#cbd5e1';
    const height = Number.isFinite(options?.height) ? options.height : 42;
    win.setTitleBarOverlay({ color, symbolColor, height });
    return true;
  });

  // ---- app lifecycle ------------------------------------------------------
  // Lets the renderer pick up a document the OS asked us to open at launch,
  // before any push could have been delivered.
  ipcMain.handle('app:consume-pending-open', () => consumePendingOpen());

  // ---- files --------------------------------------------------------------
  ipcMain.handle('fs:open', async () => {
    const result = await dialog.showOpenDialog(focusedWindow(), {
      title: 'Open Markdown file',
      properties: ['openFile'],
      filters: FILE_FILTERS,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const document = await readDocument(filePath);
    authorizedPaths.add(path.normalize(filePath));
    return document;
  });

  ipcMain.handle('fs:open-path', async (_event, filePath) => {
    // Drag-and-drop: the renderer can only supply a path that the OS handed it,
    // and readDocument re-validates existence, extension and size before the
    // path is authorised.
    const document = await readDocument(filePath);
    authorizedPaths.add(path.normalize(filePath));
    return document;
  });

  ipcMain.handle('fs:save', async (_event, filePath, content) => {
    const target = requireAuthorized(filePath);
    if (typeof content !== 'string') {
      throw new Error('Refusing to save non-text content');
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_BYTES) {
      throw new Error(`Refusing to write ${(bytes / 1024 / 1024).toFixed(1)} MB (limit 8 MB)`);
    }
    // Written verbatim, so the document's existing line endings survive a
    // round trip rather than being rewritten by the editor.
    await fs.writeFile(target, content, 'utf8');
    return { ok: true, path: target, bytes };
  });

  ipcMain.handle('fs:save-as', async (_event, content, suggestedName) => {
    if (typeof content !== 'string') {
      throw new Error('Refusing to save non-text content');
    }
    const safeName = path.basename(String(suggestedName || 'Untitled.md')).replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog(focusedWindow(), {
      title: 'Save Markdown file',
      defaultPath: safeName.toLowerCase().endsWith('.md') ? safeName : `${safeName}.md`,
      filters: FILE_FILTERS,
    });
    if (result.canceled || !result.filePath) return null;

    const target = result.filePath;
    await fs.writeFile(target, content, 'utf8');
    authorizedPaths.add(path.normalize(target));
    const stat = await fs.stat(target);
    return {
      path: target,
      name: path.basename(target),
      content,
      size: stat.size,
      lastModified: stat.mtimeMs,
    };
  });

  ipcMain.handle('fs:read', async (_event, filePath) => {
    const target = requireAuthorized(filePath);
    return (await readDocument(target)).content;
  });

  ipcMain.handle('fs:stat', async (_event, filePath) => {
    try {
      const target = requireAuthorized(filePath);
      const stat = await fs.stat(target);
      return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
    } catch {
      // Covers both "deleted since opening" and "never authorised".
      return { exists: false };
    }
  });
}

module.exports = {
  register,
  isCancellation,
  queueOpenFromArgv,
  consumePendingOpen,
  pushPendingOpen,
  setOpenWindowResolver,
  ALLOWED_EXTENSIONS,
  MAX_BYTES,
};
