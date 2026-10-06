const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * The only surface the renderer gets. Deliberately narrow and named: no
 * ipcRenderer, no require, no fs, no arbitrary channel invocation. A compromised
 * renderer can call exactly these functions and nothing else.
 *
 * Runs under contextIsolation:true and sandbox:true, so this is also the only
 * place Node exists at all in the renderer process.
 */
const api = {
  isElectron: true,
  platform: process.platform,

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    close: () => ipcRenderer.invoke('window:close'),
    /** Whole-window zoom factor; the renderer keeps offering 13-26px. */
    setZoom: (fontSize) => ipcRenderer.invoke('window:set-zoom', Number(fontSize)),
    /** Repaint the native caption buttons; called when the app theme changes. */
    setTitleBarOverlay: (options) =>
      ipcRenderer.invoke('window:set-titlebar-overlay', {
        color: String(options?.color ?? '#0f172a'),
        symbolColor: String(options?.symbolColor ?? '#cbd5e1'),
        height: Number(options?.height ?? 42),
      }),
    /** Returns an unsubscribe function. */
    onMaximizeChange: (callback) => {
      const listener = (_event, maximized) => callback(Boolean(maximized));
      ipcRenderer.on('window:maximize-changed', listener);
      return () => ipcRenderer.removeListener('window:maximize-changed', listener);
    },
  },

  /**
   * Documents the OS asked us to open.
   *
   * Double-clicking a .md launches the app with the path as argv. Cold start and
   * an already-running app need different delivery: on launch the renderer may
   * not be mounted yet, so it asks for anything queued; afterwards the main
   * process pushes.
   */
  app: {
    consumePendingOpen: () => ipcRenderer.invoke('app:consume-pending-open'),
    onOpenFile: (callback) => {
      const listener = (_event, filePath) => callback(String(filePath));
      ipcRenderer.on('app:open-file', listener);
      return () => ipcRenderer.removeListener('app:open-file', listener);
    },
  },

  fs: {
    /** Native open dialog. Resolves null when the user cancels. */
    open: () => ipcRenderer.invoke('fs:open'),
    /**
     * Open a specific path (used for drag-and-drop, where the renderer holds a
     * File but not a path). Validated and authorised in the main process.
     */
    openPath: (filePath) => ipcRenderer.invoke('fs:open-path', filePath),
    /** Write back to a path the main process has already authorised. */
    save: (filePath, content) => ipcRenderer.invoke('fs:save', filePath, content),
    /** Native save dialog. Resolves null when the user cancels. */
    saveAs: (content, suggestedName) =>
      ipcRenderer.invoke('fs:save-as', content, suggestedName),
    read: (filePath) => ipcRenderer.invoke('fs:read', filePath),
    stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
  },

  /**
   * Electron 32 removed File.path. This is the supported replacement. It returns
   * an empty string for a File the app did not receive from the OS, so it
   * cannot be used to probe arbitrary locations.
   */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
};

contextBridge.exposeInMainWorld('velox', api);
