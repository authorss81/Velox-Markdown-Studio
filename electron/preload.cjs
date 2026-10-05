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
    /** Returns an unsubscribe function. */
    onMaximizeChange: (callback) => {
      const listener = (_event, maximized) => callback(Boolean(maximized));
      ipcRenderer.on('window:maximize-changed', listener);
      return () => ipcRenderer.removeListener('window:maximize-changed', listener);
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
