import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { pwaOptions } from './pwa.config.ts';

type MiddlewareStack = Array<{
  route: string;
  handle: (req: unknown, res: { statusCode: number; end: () => void }) => void;
}>;

// Vite's /__open-in-editor route opens a file in the developer's editor for any
// request that reaches the server. The app never uses it: answer 404 before Vite does.
const blockEditorLauncher: Plugin = {
  name: 'block-open-in-editor',
  apply: 'serve',
  configureServer(server) {
    (server.middlewares as unknown as { stack: MiddlewareStack }).stack.unshift({
      route: '/__open-in-editor',
      handle: (_req, res) => {
        res.statusCode = 404;
        res.end();
      },
    });
  },
};

// No secret may be injected into the client bundle. Server-side keys
// (e.g. an LLM API key) belong in backend functions, never in `define`
// or in `VITE_*` variables.
//
// Modes: the default build is the website (PWA, clean URLs). `--mode native`
// builds the bundle packaged by Capacitor (Android/iOS) and Tauri
// (Windows/macOS/Linux): hash URLs and no service worker.
export default defineConfig(({ mode }) => ({
  server: {
    port: 3000,
    // The dev server answers only on localhost. Another address (a phone on the same
    // network, for example) is opened on purpose: VITE_DEV_HOST=0.0.0.0 npm run dev.
    host: process.env.VITE_DEV_HOST?.trim() || 'localhost',
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    blockEditorLauncher,
    // Manifest, service worker rules and update flow: pwa.config.ts
    VitePWA(pwaOptions(mode)),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    // integration tests need a running Supabase stack: `npm run test:integration`
    exclude: [...configDefaults.exclude, 'test/integration/**'],
    css: false,
    // Screens load lazily and several suites render whole pages: allow for a loaded runner
    testTimeout: 15000,
  },
}));
