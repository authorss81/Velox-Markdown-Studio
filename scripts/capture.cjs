/**
 * Pixel-proof for stylesheet refactors: renders a fixture exercising every
 * .markdown-body rule through the REAL built stylesheet, captures it with
 * capturePage, and compares pixel-by-pixel against the baseline.
 *
 * Usage:
 *   electron.exe scripts/capture.cjs baseline   # record before a change
 *   electron.exe scripts/capture.cjs current    # compare after a change
 *
 * Exit 0 + "IDENTICAL" means zero visual delta. Otherwise it prints the
 * differing-pixel count and percentage so a human can judge whether the drift
 * is sub-perceptual.
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const REPO = process.env.VELOX_REPO ?? path.join(__dirname, '..');
const OUT = process.argv[2] || 'current';
const REPORT = path.join(__dirname, 'capture-report.txt');
const THEME = process.argv[3] || 'dark';

function report(line) {
  try {
    fs.appendFileSync(REPORT, line + '\n', 'utf8');
  } catch { /* ignore */ }
}

process.on('uncaughtException', (err) => {
  report(`capture ${OUT}: UNCAUGHT ${err && err.stack ? err.stack : String(err)}`);
  app.exit(3);
});

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const cssFiles = fs
    .readdirSync(path.join(REPO, 'dist', 'assets'))
    .filter((f) => f.endsWith('.css'))
    .map(
      (f) =>
        `<link rel="stylesheet" href="${path
          .join(REPO, 'dist', 'assets', f)
          .replace(/\\/g, '/')}">`
    )
    .join('\n');

  let html = fs.readFileSync(path.join(__dirname, 'capture-fixture.html'), 'utf8');
  html = html.replace('<!--STYLES-->', cssFiles);
  // Both themes are captured: several defects (including the light-mode
  // invisible blockquote text) only manifest in one of them.
  html = html.replace(
    '<html lang="en" class="dark">',
    `<html lang="en" class="${THEME}">`
  );

  const page = path.join(REPO, '.capture-page.html');
  fs.writeFileSync(page, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 3000,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  await win.loadFile(page);

  // Let fonts and layout settle; the fixture contains no animations.
  await new Promise((r) => setTimeout(r, 1500));

  const png = (await win.webContents.capturePage()).toPNG();
  const outPath = path.join(__dirname, `capture-${OUT}-${THEME}.png`);
  fs.writeFileSync(outPath, png);
  const hash = crypto.createHash('sha256').update(png).digest('hex');

  let verdict = `capture ${OUT} [${THEME}]: sha256=${hash}`;
  const basePath = path.join(__dirname, `capture-baseline-${THEME}.png`);
  if (OUT !== 'baseline' && fs.existsSync(basePath)) {
    const { nativeImage } = require('electron');
    const baseImg = nativeImage.createFromBuffer(fs.readFileSync(basePath));
    const curImg = nativeImage.createFromBuffer(png);
    const bs = baseImg.getSize();
    const cs = curImg.getSize();
    if (bs.width !== cs.width || bs.height !== cs.height) {
      verdict += ` SIZE MISMATCH baseline=${bs.width}x${bs.height} current=${cs.width}x${cs.height}`;
    } else {
      const a = baseImg.toBitmap();
      const b = curImg.toBitmap();
      let diff = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
          diff++;
        }
      }
      const total = a.length / 4;
      const pct = ((diff / total) * 100).toFixed(4);
      verdict += diff === 0
        ? ' IDENTICAL to baseline (zero visual delta)'
        : ` DIFFERS: ${diff}/${total} pixels (${pct}%)`;
    }
  }
  report(verdict);

  try {
    fs.unlinkSync(page);
  } catch { /* ignore */ }
  app.exit(0);
});

app.on('window-all-closed', () => {});
