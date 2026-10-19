import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

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
    VitePWA({
      disable: mode === 'native' || mode === 'test',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icons/apple-touch-icon.png', 'icons/icon.svg'],
      manifest: {
        name: 'WorkEasy',
        short_name: 'WorkEasy',
        description: 'Encontre profissionais e serviços de todas as áreas perto de você.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f9fafb',
        theme_color: '#667eea',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: '/index.html',
      },
    }),
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
    css: false,
  },
}));
