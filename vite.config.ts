import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Production Content-Security-Policy.
 *
 * Injected at build time only: the Vite dev server needs inline scripts, eval
 * and a websocket for HMR, so shipping this policy in index.html directly would
 * break `npm run dev`. Every directive is chosen against what this app actually
 * does — it makes no network requests of its own, which is why connect-src is
 * 'none'. That single directive is what stops a markdown XSS payload from
 * exfiltrating the user's document library.
 */
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

function cspPlugin() {
  return {
    name: 'velox-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`;
      return html.replace('</head>', `  ${tag}\n  </head>`);
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Velox Markdown Studio',
          short_name: 'VeloxMD',
          description: 'Windows-native Markdown app to open, preview, edit, and save MD files with permanent memory and syntax highlighting.',
          theme_color: '#0078d4',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          // Never register a service worker against the dev server: `npm run
          // dev` is reachable on the LAN and a SW would cache and serve the
          // shell to anything that asked.
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': __dirname,
      },
    },
    server: {
      host: '127.0.0.1',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
