import { CONSENT_VERSIONS } from '../config/legal';
import { AppError } from '../lib/errors';
import { toE164BR } from '../lib/phone';
import { db, invokeFunction, unwrap, unwrapMaybe } from './client';
import type { ConsentPurpose, ConsentRow, ProfileRow, ProfileUpdate, ProviderRow } from './types';

const PROFILE_COLUMNS = 'id, full_name, phone, role, city, deleted_at, created_at';
const PROVIDER_COLUMNS =
  'id, display_name, slug, bio, avatar_path, status, plan, base_neighborhood_id, accepts_platform_requests, created_at';

export const getProfile = async (userId: string): Promise<ProfileRow | null> =>
  unwrapMaybe<ProfileRow>(await db().from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle());

/**
 * Updates name, phone and city. Role is never sent: it changes only through become_provider().
 * The phone is stored in E.164 (+55...), the format WhatsApp and SMS notifications need.
 */
export const updateProfile = async (userId: string, changes: ProfileUpdate): Promise<ProfileRow> => {
  const row: ProfileUpdate = {};
  if (changes.full_name !== undefined) row.full_name = changes.full_name?.trim() || null;
  if (changes.phone !== undefined) {
    const typed = changes.phone?.trim() ?? '';
    const phone = typed ? toE164BR(typed) : null;
    if (typed && !phone) throw new AppError('invalid_phone');
    row.phone = phone;
  }
  if (changes.city !== undefined) row.city = changes.city?.trim() || null;
  return unwrap<ProfileRow>(await db().from('profiles').update(row).eq('id', userId).select(PROFILE_COLUMNS).single());
};

/** The provider record of this user, or null for clients. */
export const getMyProvider = async (userId: string): Promise<ProviderRow | null> =>
  unwrapMaybe<ProviderRow>(await db().from('providers').select(PROVIDER_COLUMNS).eq('id', userId).maybeSingle());

export const fetchIsAdmin = async (): Promise<boolean> => {
  const data = unwrapMaybe<unknown>(await db().rpc('is_admin'));
  return data === true;
};

/** Consent history, newest first. */
export const listConsents = async (userId: string): Promise<ConsentRow[]> =>
  unwrap<ConsentRow[]>(
    await db()
      .from('consents')
      .select('id, user_id, purpose, version, granted, at')
      .eq('user_id', userId)
      .order('at', { ascending: false }),
  );

/** Appends a consent decision (the table is insert-only: history, never update). */
export const recordConsent = async (
  userId: string,
  purpose: ConsentPurpose,
  granted: boolean,
  version: string = CONSENT_VERSIONS[purpose],
): Promise<ConsentRow> =>
  unwrap<ConsentRow>(
    await db()
      .from('consents')
      .insert({ user_id: userId, purpose, granted, version })
      .select('id, user_id, purpose, version, granted, at')
      .single(),
  );

/** Latest decision per purpose, from a newest-first history. */
export const latestConsents = (history: ConsentRow[]): Partial<Record<ConsentPurpose, ConsentRow>> => {
  const latest: Partial<Record<ConsentPurpose, ConsentRow>> = {};
  for (const row of history) latest[row.purpose] ??= row;
  return latest;
};

/** Consents every account needs, in their current version, before using the platform. */
export const REQUIRED_CONSENTS = ['terms', 'privacy'] as const satisfies readonly ConsentPurpose[];

/** Required purposes not accepted in their current version (empty = all accepted). */
export const missingRequiredConsents = (
  latest: Partial<Record<ConsentPurpose, ConsentRow>>,
): Array<(typeof REQUIRED_CONSENTS)[number]> =>
  REQUIRED_CONSENTS.filter(purpose => {
    const current = latest[purpose];
    return !current || !current.granted || current.version !== CONSENT_VERSIONS[purpose];
  });

/** Reads the history and tells which required consents are missing. */
export const fetchMissingRequiredConsents = async (userId: string) => missingRequiredConsents(latestConsents(await listConsents(userId)));

/** Records acceptance of the current terms and privacy texts, unless already accepted. */
export const acceptCurrentTerms = async (userId: string): Promise<void> => {
  for (const purpose of await fetchMissingRequiredConsents(userId)) {
    await recordConsent(userId, purpose, true);
  }
};

/** All data the platform holds about the user (Edge Function account-export). */
export const exportMyData = async (): Promise<unknown> => invokeFunction<unknown>('account-export');

/** The exact word the user must type to delete the account. */
export const DELETE_CONFIRMATION = 'EXCLUIR';

/**
 * Deletes the account (Edge Function account-delete): personal data is erased;
 * payments and bookings stay anonymized for tax law. The caller signs out after.
 */
export const deleteMyAccount = async (confirmation: string): Promise<void> => {
  if (confirmation !== DELETE_CONFIRMATION) throw new AppError('invalid_input');
  await invokeFunction<unknown>('account-delete', { confirm: confirmation });
};
