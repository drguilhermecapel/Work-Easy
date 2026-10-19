/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "browser" (website, default) or "hash" (Capacitor and Tauri builds). */
  readonly VITE_ROUTER?: 'browser' | 'hash';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
