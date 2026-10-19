import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No secret may be injected into the client bundle. Server-side keys
// (e.g. an LLM API key) belong in backend functions, never in `define`
// or in `VITE_*` variables.
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
