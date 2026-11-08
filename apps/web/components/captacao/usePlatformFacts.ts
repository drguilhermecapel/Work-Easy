import { DEFAULT_SETTINGS, features, loadPublicSettings } from '../../config/features';
import { useAsync } from '../../lib/useAsync';
import { getFreeProposalsPerMonth, getProPriceCents, getProTrialDays } from '../../services/proBilling';

/**
 * The numbers an acquisition page may print. Every one is read from
 * platform_settings (public keys, readable without login); null means "not
 * read", and the pages then print no number at all.
 */
export interface PlatformFacts {
  /** pro_price_cents */
  proPriceCents: number | null;
  /** pro_trial_days; null also when there is no trial (0) */
  proTrialDays: number | null;
  /** free_proposals_per_month; null also when the free plan has no limit (0) */
  freeProposalsPerMonth: number | null;
  /** proposal_limit: proposals one request can receive */
  proposalLimit: number | null;
  /** labor_lock_days_per_week */
  laborLockDays: number | null;
  /** commission_enabled */
  commissionEnabled: boolean | null;
}

export const NO_FACTS: PlatformFacts = {
  proPriceCents: null,
  proTrialDays: null,
  freeProposalsPerMonth: null,
  proposalLimit: null,
  laborLockDays: null,
  commissionEnabled: null,
};

const orNull = <T>(read: Promise<T | null>): Promise<T | null> => read.catch(() => null);

/**
 * Demo mode: nothing is real, so nothing is known. With a backend, each value is
 * known only if its own read worked. loadPublicSettings answers DEFAULT_SETTINGS
 * itself when it cannot read the table, and those defaults are not values read
 * from the platform, so they are dropped here. It does not carry the trial and the
 * free allowance, which come from the readers the Pro subscription screen uses.
 */
export const loadPlatformFacts = async (): Promise<PlatformFacts> => {
  if (!features.backendEnabled) return NO_FACTS;
  const [settings, proPriceCents, proTrialDays, freeProposalsPerMonth] = await Promise.all([
    loadPublicSettings().catch(() => DEFAULT_SETTINGS),
    orNull(getProPriceCents()),
    orNull(getProTrialDays()),
    orNull(getFreeProposalsPerMonth()),
  ]);
  const read = settings !== DEFAULT_SETTINGS;
  return {
    proPriceCents,
    proTrialDays,
    freeProposalsPerMonth,
    proposalLimit: read ? settings.proposalLimit : null,
    laborLockDays: read ? settings.laborLockDaysPerWeek : null,
    commissionEnabled: read ? settings.commissionEnabled : null,
  };
};

/** True when a backend is configured but none of the values could be read. */
export const nothingRead = (facts: PlatformFacts): boolean => Object.values(facts).every(value => value === null);

export const usePlatformFacts = (): { facts: PlatformFacts; loading: boolean } => {
  const state = useAsync(() => loadPlatformFacts(), 'platform-facts');
  return { facts: state.data ?? NO_FACTS, loading: state.loading };
};
