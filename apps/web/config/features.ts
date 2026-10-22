import { backendEnabled, supabase } from '../lib/supabase';

// Build flags come from VITE_* variables; runtime flags come from the public
// keys of platform_settings. Sensitive features (escrow, commission) start
// off and stay off unless the database says otherwise.

/** Digits only, with country code; null when not configured or malformed. */
const conciergeNumber = (): string | null => {
  const digits = (import.meta.env.VITE_CONCIERGE_WHATSAPP ?? '').replace(/\D/g, '');
  return digits.length >= 12 && digits.length <= 15 ? digits : null;
};

const siteUrl = (): string | null => {
  const value = (import.meta.env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(value) ? value : null;
};

export const features = {
  /** Supabase configured: real login, requests and account. */
  backendEnabled,
  /** Concierge WhatsApp number used by /pedido when there is no backend. */
  get conciergeWhatsApp(): string | null {
    return conciergeNumber();
  },
  get siteUrl(): string | null {
    return siteUrl();
  },
};

export interface PublicSettings {
  commissionEnabled: boolean;
  commissionBps: number;
  escrowEnabled: boolean;
  proPriceCents: number;
  proposalLimit: number;
  laborLockDaysPerWeek: number;
}

/** Same defaults as the database seed: money features off. */
export const DEFAULT_SETTINGS: PublicSettings = {
  commissionEnabled: false,
  commissionBps: 1200,
  escrowEnabled: false,
  proPriceCents: 4900,
  proposalLimit: 3,
  laborLockDaysPerWeek: 2,
};

const SETTING_KEYS: Record<string, keyof PublicSettings> = {
  commission_enabled: 'commissionEnabled',
  commission_bps: 'commissionBps',
  escrow_enabled: 'escrowEnabled',
  pro_price_cents: 'proPriceCents',
  proposal_limit: 'proposalLimit',
  labor_lock_days_per_week: 'laborLockDaysPerWeek',
};

/** Turns platform_settings rows into typed settings, ignoring unknown keys and wrong types. */
export const parseSettings = (rows: Array<{ key: string; value: unknown }>): PublicSettings => {
  const settings: PublicSettings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    const field = SETTING_KEYS[key];
    if (!field) continue;
    const fallback = DEFAULT_SETTINGS[field];
    if (typeof fallback === 'boolean' && typeof value === 'boolean') (settings[field] as boolean) = value;
    if (typeof fallback === 'number' && typeof value === 'number' && Number.isFinite(value)) (settings[field] as number) = value;
  }
  return settings;
};

let settingsPromise: Promise<PublicSettings> | undefined;

/**
 * Public platform settings, read once per session. RLS exposes only the keys
 * that are not internal. Without a backend, or on any failure, the safe defaults.
 */
export const loadPublicSettings = (): Promise<PublicSettings> =>
  (settingsPromise ??= (async () => {
    if (!supabase) return DEFAULT_SETTINGS;
    const { data, error } = await supabase.from('platform_settings').select('key, value');
    if (error || !data) {
      settingsPromise = undefined; // try again next time
      return DEFAULT_SETTINGS;
    }
    return parseSettings(data as Array<{ key: string; value: unknown }>);
  })());
