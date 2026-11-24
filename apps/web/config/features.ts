import { backendEnabled, supabase } from '../lib/supabase';

// Build flags come from VITE_* variables; runtime flags come from the public
// keys of platform_settings. Sensitive features (escrow, commission) start
// off and stay off unless the database says otherwise.

/** Digits only, with country code; null when not configured or malformed. */
const conciergeNumber = (): string | null => {
  const digits = (import.meta.env.VITE_CONCIERGE_WHATSAPP ?? '').replace(/\D/g, '');
  return digits.length >= 12 && digits.length <= 15 ? digits : null;
};

export type StoreBuild = 'android' | 'ios';
export type LoginMethod = 'email' | 'phone';

/** VITE_STORE_BUILD: the app store this build is made for; anything else is not a store build. */
const storeBuild = (): StoreBuild | null => {
  const value = (import.meta.env.VITE_STORE_BUILD ?? '').trim().toLowerCase();
  return value === 'android' || value === 'ios' ? value : null;
};

/** VITE_LOGIN_METHODS: "email", "phone" or both separated by a comma. Empty or unreadable = both. */
const loginMethods = (): LoginMethod[] => {
  const listed = (import.meta.env.VITE_LOGIN_METHODS ?? '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter((item): item is LoginMethod => item === 'email' || item === 'phone');
  const unique = [...new Set(listed)];
  return unique.length > 0 ? unique : ['email', 'phone'];
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
  /** "android" or "ios" in a build made for an app store; null on the site, the desktop apps and in development. */
  get storeBuild(): StoreBuild | null {
    return storeBuild();
  },
  /**
   * Whether this build may sell the Pro plan. A store build may not: the stores require their own
   * billing for features of the app and forbid pointing the user to another way of paying
   * (docs/lojas/google-play.md B06, docs/lojas/app-store.md D1). There the plan is only shown.
   */
  get proSalesEnabled(): boolean {
    return storeBuild() === null;
  },
  /** Whether the care line is part of this build. A store build leaves it out (docs/DECISOES.md, D12). */
  get careLineInBuild(): boolean {
    return storeBuild() === null;
  },
  /**
   * Whether the AI assistants are part of this build. The first iOS version ships without them
   * (docs/lojas/app-store.md, D6); every other build shows them, behind the recorded consent.
   */
  get aiAssistInBuild(): boolean {
    return storeBuild() !== 'ios';
  },
  /** Ways of receiving the sign-in code this build offers, in the order of the tabs. */
  get loginMethods(): LoginMethod[] {
    return loginMethods();
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
  /** Care line shown in the menu to everyone (D12); off = only accounts already in it and admins. */
  careLineOpen: boolean;
  /** Slugs of the neighborhoods the pilot serves; empty = every neighborhood. */
  pilotNeighborhoods: string[];
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
  careLineOpen: false,
  pilotNeighborhoods: [],
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
  care_line_open: 'careLineOpen',
  pilot_neighborhoods: 'pilotNeighborhoods',
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
    if (Array.isArray(fallback) && Array.isArray(value)) {
      (settings[field] as string[]) = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    }
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
