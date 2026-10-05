const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Remove the default Windows top menu bar
Menu.setApplicationMenu(null);

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
    },
  });

  win.setMenuBarVisibility(false);

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
