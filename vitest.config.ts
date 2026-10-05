import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

/**
 * Tests run in jsdom rather than the app's Electron runtime, because the renderer
 * is ordinary web code: React, marked and DOMPurify behave identically in both.
 * The parts that genuinely need Electron (the preload bridge, ipcMain, the
 * native dialogs, the window controls overlay) are covered separately by
 * scripts/electron-smoke.cjs, which launches a real Electron process.
 *
 * Two dependencies are load-bearing and easy to break by accident:
 *  - `environment: jsdom`, because DOMPurify silently degrades to a no-op
 *    passthrough when createNodeIterator is missing. Under a lesser DOM the XSS
 *    tests would pass while proving nothing. smoke-only guards live in the suite.
 *  - `setupFiles`, which installs fake-indexeddb before the storage module is
 *    imported.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The Electron smoke suite is a separate process, never picked up here.
    exclude: ['node_modules/**', 'dist/**', 'release/**'],
    restoreMocks: true,
  },
});
