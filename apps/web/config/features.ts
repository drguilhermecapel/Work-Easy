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
  /** Most the commission of one service can be, in cents; 0 = no ceiling. */
  commissionCapCents: number;
  /** Proposals a provider on the free plan sends per calendar month; 0 = no limit. */
  freeProposalsPerMonth: number;
  /** Free days of Pro on the first subscription of an account; 0 = no trial. */
  proTrialDays: number;
}

/**
 * Money features off, and the other keys as the database seed has them. The three revenue settings
 * (ceiling, free proposals, trial) are the exception: here they hold what the rules apply when the
 * key is missing or unreadable (no ceiling, 5 free proposals, no trial), so nothing is promised that
 * the database did not say. A screen that wants to promise a number reads it (services/proBilling).
 */
export const DEFAULT_SETTINGS: PublicSettings = {
  commissionEnabled: false,
  commissionBps: 1200,
  escrowEnabled: false,
  proPriceCents: 4900,
  proposalLimit: 3,
  laborLockDaysPerWeek: 2,
  commissionCapCents: 0,
  freeProposalsPerMonth: 5,
  proTrialDays: 0,
};

const SETTING_KEYS: Record<string, keyof PublicSettings> = {
  commission_enabled: 'commissionEnabled',
  commission_bps: 'commissionBps',
  escrow_enabled: 'escrowEnabled',
  pro_price_cents: 'proPriceCents',
  proposal_limit: 'proposalLimit',
  labor_lock_days_per_week: 'laborLockDaysPerWeek',
  commission_cap_cents: 'commissionCapCents',
  free_proposals_per_month: 'freeProposalsPerMonth',
  pro_trial_days: 'proTrialDays',
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
