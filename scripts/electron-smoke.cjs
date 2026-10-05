/**
 * Phase 4a smoke test.
 *
 * Launches a real Electron window with the real preload, then drives the real
 * ipcMain handlers through the real contextBridge and asserts the bytes that
 * actually land on disk. This is the only way to verify the parts I cannot see:
 * a screenshot would not tell me whether Ctrl+S writes to the right file.
 *
 * The two dialog-backed handlers (fs:open, fs:save-as) are deliberately NOT
 * exercised here because they block on a human. They are covered by the
 * main-process unit assertions at the bottom instead.
 *
 * Usage: electron.exe smoke.cjs   (exit 0 = pass)
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');

const REPO = process.env.VELOX_REPO ?? path.join(__dirname, '..');
const { register } = require(path.join(REPO, 'electron', 'ipc.cjs'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'velox-smoke-'));
const mdPath = path.join(tmp, 'note.md');
const otherMdPath = path.join(tmp, 'other.md');
const exePath = path.join(tmp, 'evil.exe');
const missingPath = path.join(tmp, 'nope.md');
const hugePath = path.join(tmp, 'huge.md');
const unauthorizedPath = path.join(tmp, 'unauthorized.md');

fs.writeFileSync(mdPath, '# Hello\n\noriginal body\n', 'utf8');
fs.writeFileSync(otherMdPath, 'other', 'utf8');
fs.writeFileSync(exePath, 'MZ binary', 'utf8');
fs.writeFileSync(hugePath, 'x'.repeat(9 * 1024 * 1024), 'utf8'); // over the 8 MB cap
fs.writeFileSync(unauthorizedPath, 'untouched', 'utf8');

const EXPECTED = '# Hello\n\noriginal body\n';
const NEW_CONTENT = '# Hello\n\nrewritten by the smoke test\n';

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail ?? '' });
};

// Electron on Windows does not reliably flush stdout to a piped parent process,
// so the report is written to a file. This also avoids any chance of a native
// error dialog appearing on the desktop.
const REPORT = path.join(__dirname, 'smoke-report.txt');
function writeReport(extra = '') {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  const body = [
    '',
    '================ PHASE 4a/4b ELECTRON SMOKE TEST ================',
    ...results.map((r) => `  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass || !r.detail ? '' : `\n          ${r.detail}`}`),
    '',
    `  ${passed} passed, ${failed.length} failed`,
    extra,
    '  NOTE: fs:open and fs:save-as block on a native dialog, so they are',
    '        verified by channel cross-reference and shared code path only.',
    '        The Window Controls Overlay result needs a human to eyeball.',
    '==============================================================',
    '',
  ].join('\n');
  try {
    fs.appendFileSync(REPORT, body, 'utf8');
  } catch { /* ignore */ }
}
try { fs.writeFileSync(REPORT, '', 'utf8'); } catch { /* ignore */ }

// Watchdog: this test drives a real window, so never let a stuck call hang CI.
const WATCHDOG_MS = Number(process.env.VELOX_SMOKE_TIMEOUT_MS ?? 90000);
const watchdog = setTimeout(() => {
  writeReport(['  WATCHDOG: smoke test timed out — aborting.']);
  app.exit(2);
}, WATCHDOG_MS);

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  register();

  const win = new BrowserWindow({
    show: false,
    // Mirror the production window configuration exactly, otherwise
    // setTitleBarOverlay is a no-op and the test proves nothing.
    frame: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f172a', symbolColor: '#cbd5e1', height: 42 },
    webPreferences: {
      preload: path.join(REPO, 'electron', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  await win.loadFile(path.join(__dirname, 'electron-smoke-page.html'));

  const paths = {
    md: mdPath,
    exe: exePath,
    missing: missingPath,
    huge: hugePath,
    unauthorized: unauthorizedPath,
    expected: EXPECTED,
    newContent: NEW_CONTENT,
  };

  let rendererResults = [];
  try {
    rendererResults = await Promise.race([
      win.webContents.executeJavaScript(`window.runTests(${JSON.stringify(paths)})`, true),
      new Promise((_, reject) => setTimeout(() => reject(new Error('renderer test timed out')), 60000)),
    ]);
  } catch (err) {
    record('renderer test harness ran', false, String(err));
  }
  for (const r of rendererResults) record(r.name, r.pass, r.detail);

  // --- main-process assertions the renderer could not make -----------------
  // The unauthorised path must be byte-for-byte unchanged on disk.
  const unauthorizedContents = fs.readFileSync(unauthorizedPath, 'utf8');
  record(
    'unauthorised file untouched on disk',
    unauthorizedContents === 'untouched',
    JSON.stringify(unauthorizedContents)
  );

  // The saved document must match exactly what was written. The last write in the
  // renderer sequence is the unicode round trip.
  const UNICODE = '# Título — 日本語 — emoji 🎉\n\nçà';
  const onDisk = fs.readFileSync(mdPath, 'utf8');
  record('final disk contents match last write', onDisk === UNICODE, JSON.stringify(onDisk));
  record(
    'file is valid utf-8 on disk',
    Buffer.from(onDisk, 'utf8').toString('utf8') === UNICODE,
    JSON.stringify(onDisk)
  );

  // A second document the renderer never opened must be untouched.
  record('other file untouched', fs.readFileSync(otherMdPath, 'utf8') === 'other');

  // Channel-name cross-check.
  //
  // Done statically in both directions rather than by inspecting Electron's
  // internals: a typo in a channel name is the classic silent failure here, and
  // the functional tests above already prove the handlers that can be reached
  // without a dialog actually work.
  const preloadSrc = fs.readFileSync(path.join(REPO, 'electron', 'preload.cjs'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(REPO, 'electron', 'ipc.cjs'), 'utf8');

  const preloadChannels = [...preloadSrc.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]).sort();
  const mainChannels = [...mainSrc.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]).sort();

  record(
    'every preload channel has a main handler',
    preloadChannels.every((c) => mainChannels.includes(c)),
    `preload-only: ${preloadChannels.filter((c) => !mainChannels.includes(c)).join(', ')}`
  );
  record(
    'every main handler is reachable from preload',
    mainChannels.every((c) => preloadChannels.includes(c)),
    `main-only: ${mainChannels.filter((c) => !preloadChannels.includes(c)).join(', ')}`
  );
  record(
    'channel name sets are identical',
    preloadChannels.join('|') === mainChannels.join('|'),
    `preload=${preloadChannels.join(',')} main=${mainChannels.join(',')}`
  );
  record('all 11 channels declared', preloadChannels.length === 11, `got ${preloadChannels.length}`);

  // The preload must not expose raw Node to the renderer.
  record('preload does not expose ipcRenderer', !/exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/.test(preloadSrc));
  record('preload does not enable nodeIntegration', !/nodeIntegration:\s*true/.test(preloadSrc));
  record('preload namespace is velox', /exposeInMainWorld\('velox'/.test(preloadSrc));

  // --- production window configuration ------------------------------------
  // The caption-button behaviour depends on these; assert them so a future edit
  // cannot silently drop back to two stacked title bars.
  const windowCfgSrc = fs.readFileSync(path.join(REPO, 'electron', 'main.cjs'), 'utf8');
  record("titleBarStyle is 'hidden'", /titleBarStyle:\s*'hidden'/.test(windowCfgSrc));
  record('titleBarOverlay is configured', /titleBarOverlay:\s*\{/.test(windowCfgSrc));
  record('frame stays true (native resize/snap kept)', /frame:\s*true/.test(windowCfgSrc));
  record('sandbox stays enabled', /sandbox:\s*true/.test(windowCfgSrc));

  // The fake caption trio must be gone from the renderer, or it would sit on top
  // of the real Windows buttons.
  const titleBarSrc = fs.readFileSync(path.join(REPO, 'src', 'components', 'TitleBar.tsx'), 'utf8');
  record(
    'fake caption buttons removed from TitleBar',
    !/handleMinimize|handleToggleMaximize|handleCloseWindow/.test(titleBarSrc)
  );
  record('header is a drag region', /\[-webkit-app-region:drag\]/.test(titleBarSrc));
  record(
    'interactive header children opt out of dragging',
    (titleBarSrc.match(/\[-webkit-app-region:no-drag\]/g) || []).length >= 3,
    `found ${(titleBarSrc.match(/\[-webkit-app-region:no-drag\]/g) || []).length}`
  );
  record(
    'no fill-* on theme toggle icons',
    !/fill-(amber|sky)-/.test(titleBarSrc),
    'filled glyphs read as a different icon family'
  );

  // --- report --------------------------------------------------------------
  writeReport();
  await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  clearTimeout(watchdog);
  app.exit(results.some((r) => !r.pass) ? 1 : 0);
});

app.on('window-all-closed', () => {});
