/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "browser" (website, default) or "hash" (Capacitor and Tauri builds). */
  readonly VITE_ROUTER?: 'browser' | 'hash';
  /** Supabase project URL. Empty = demo mode (fictitious data, no backend). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable key (sb_publishable_...). Public by design; access is enforced by RLS. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Concierge operation WhatsApp number, digits only with country code (e.g. 5511999999999). */
  readonly VITE_CONCIERGE_WHATSAPP?: string;
  /** Canonical site URL (e.g. https://workeasy.com.br), used for SEO and auth redirects. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
