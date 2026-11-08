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
  /** Corporate name of the supplier, shown in the footer of a build with a backend. */
  readonly VITE_COMPANY_NAME?: string;
  /** CNPJ of the supplier, as it should be printed. */
  readonly VITE_COMPANY_CNPJ?: string;
  /** Physical address of the supplier. */
  readonly VITE_COMPANY_ADDRESS?: string;
  /** Customer service (SAC) e-mail address. */
  readonly VITE_SAC_EMAIL?: string;
  /** Customer service (SAC) WhatsApp number, digits only with country code (e.g. 5511999999999). */
  readonly VITE_SAC_WHATSAPP?: string;
  /** "vigente" once a lawyer approved the published legal texts; anything else keeps the draft notice. */
  readonly VITE_LEGAL_STATUS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
