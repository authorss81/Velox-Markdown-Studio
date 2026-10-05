import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

/**
 * Tests run in jsdom rather than the app's Electron runtime, because the renderer
 * is ordinary web code: React, marked and DOMPurify behave identically in both.
 * The parts that genuinely need Electron (the preload bridge, ipcMain, the
 * native dialogs, the window controls overlay) are covered separately by
 * scripts/electron-smoke.cjs, which launches a real Electron process.
 *
 * Two things are load-bearing and easy to break by accident:
 *  - `environment: jsdom`, because DOMPurify silently degrades to a no-op
 *    passthrough when createNodeIterator is missing. Under a lesser DOM the XSS
 *    tests would pass while proving nothing; src/test/setup.ts asserts the
 *    capability loudly so the suite cannot pass vacuously.
 *  - `setupFiles`, which installs fake-indexeddb before the storage module is
 *    imported.
 *
 * Note: no @vitejs/plugin-react here. It is only needed for Fast Refresh, and
 * vitest ships its own nested Vite whose plugin types clash with this repo's
 * rolldown-based Vite 8. JSX still compiles, via the automatic runtime that
 * tsconfig.json already selects.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'release/**'],
    restoreMocks: true,
  },
});
