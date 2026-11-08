import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config.ts';

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
    host: '0.0.0.0',
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
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
