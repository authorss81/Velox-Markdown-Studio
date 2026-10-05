const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Remove the default Windows top menu bar
Menu.setApplicationMenu(null);

// Keep in sync with the build-time policy injected by vite.config.ts. Applied as
// a response header as well as a <meta> tag so it holds even if a document is
// ever loaded without the built index.html.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: file: https:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "worker-src 'self' blob:",
].join('; ');

/**
 * Deny-by-default capability grant. Without a handler Chromium grants most
 * permission requests, so script running in the renderer could read the
 * clipboard, enumerate devices and geolocate. This app needs almost none of it:
 * fullscreen for the maximise button, and nothing else.
 */
const ALLOWED_PERMISSIONS = new Set(['fullscreen']);

function hardenSession(sess) {
  const isLocal = (contents) => {
    try {
      return contents.getURL().startsWith('file://');
    } catch {
      return false;
    }
  };

  sess.setPermissionRequestHandler((contents, permission, callback) => {
    callback(isLocal(contents) && ALLOWED_PERMISSIONS.has(permission));
  });

  sess.setPermissionCheckHandler((contents, permission) => {
    return isLocal(contents) && ALLOWED_PERMISSIONS.has(permission);
  });

  sess.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });
}

/**
 * A previewed markdown document is untrusted input. If a link is ever activated
 * it must open in the user's browser, never replace the application window, and
 * a document must never be able to spawn a second window with our privileges.
 */
function lockNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) {
        void shell.openExternal(url);
      }
    }
  });

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    backgroundColor: '#0f172a',
    title: 'Velox Markdown Studio',
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true,
    },
  });

  win.setMenuBarVisibility(false);
  lockNavigation(win);

  // Robust path resolution for packaged and dev environments
  const candidatePaths = [
    path.join(__dirname, '../dist/index.html'),
    path.join(__dirname, 'dist/index.html'),
    path.join(app.getAppPath(), 'dist/index.html'),
    path.join(process.resourcesPath || '', 'app/dist/index.html'),
  ];

  let resolvedPath = candidatePaths.find((p) => fs.existsSync(p));
  if (resolvedPath) {
    win.loadFile(resolvedPath);
  } else {
    // Fallback default
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  hardenSession(session.defaultSession);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
