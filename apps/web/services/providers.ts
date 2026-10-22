import { loadPolicies } from '../catalog';
import type { OccupationPolicy, PriceUnit, VerificationStep } from '../catalog/types';
import { AppError } from '../lib/errors';
import type { Tables } from '../lib/database.types';
import { db, unwrap, unwrapMaybe } from './client';
import { guard } from './proErrors';
import type { ProviderRow } from './types';

// Writes and reads of the provider's own record: onboarding, service area,
// documents and the review request. The database decides who may do what.

export interface ProviderOccupationRow {
  occupation_slug: string;
  is_primary: boolean;
  registry_number: string | null;
  registry_uf: string | null;
  registry_status: Tables<'provider_occupations'>['registry_status'];
  /** Per-occupation approval by an admin; only approved occupations receive requests. */
  approved: boolean;
}

export type ProviderDocumentRow = Pick<
  Tables<'provider_documents'>,
  'id' | 'step' | 'storage_path' | 'status' | 'rejection_reason' | 'expires_at' | 'created_at'
>;

const PROVIDER_COLUMNS =
  'id, display_name, slug, bio, avatar_path, status, plan, base_neighborhood_id, accepts_platform_requests, created_at';
const OCCUPATION_COLUMNS = 'occupation_slug, is_primary, registry_number, registry_uf, registry_status, approved';
const DOCUMENT_COLUMNS = 'id, step, storage_path, status, rejection_reason, expires_at, created_at';

// ---- Occupation policy --------------------------------------------------------

/** What the app needs from an occupation policy (same data as occupation_policies). */
export interface PolicyView {
  slug: string;
  verification: VerificationStep[];
  priceUnits: PriceUnit[];
  laborLock: boolean;
  regulated: boolean;
  registryName: string;
  regulatorBody: string;
  /** The policy asks for a registry number (registro_profissional). */
  requiresRegistry: boolean;
}

const fromCatalog = (slug: string, policy: OccupationPolicy): PolicyView => ({
  slug,
  verification: policy.verification,
  priceUnits: policy.priceUnits,
  laborLock: policy.laborLock,
  regulated: policy.regulated,
  registryName: policy.registryName,
  regulatorBody: policy.regulatorBody,
  requiresRegistry: policy.verification.includes('registro_profissional'),
});

interface PolicyRow {
  occupation_slug: string;
  regulated: boolean;
  regulator_body: string | null;
  registry_name: string | null;
  verification: VerificationStep[] | null;
  price_units: PriceUnit[] | null;
  labor_lock: boolean;
}

/**
 * Policies of the given occupations. The database is the source (it is what
 * submit_provider_for_review and the service trigger apply); an occupation it
 * does not return falls back to catalog/policies.json, which generates the same table.
 */
export const getPolicies = async (slugs: string[]): Promise<Record<string, PolicyView | undefined>> => {
  const wanted = [...new Set(slugs)];
  const result: Record<string, PolicyView | undefined> = {};
  if (wanted.length === 0) return result;
  try {
    const { data } = await db()
      .from('occupation_policies')
      .select('occupation_slug, regulated, regulator_body, registry_name, verification, price_units, labor_lock')
      .in('occupation_slug', wanted);
    for (const row of (data ?? []) as PolicyRow[]) {
      const verification = row.verification ?? [];
      result[row.occupation_slug] = {
        slug: row.occupation_slug,
        verification,
        priceUnits: row.price_units ?? [],
        laborLock: row.labor_lock,
        regulated: row.regulated,
        registryName: row.registry_name ?? '',
        regulatorBody: row.regulator_body ?? '',
        requiresRegistry: verification.includes('registro_profissional'),
      };
    }
  } catch {
    // The static catalog below answers
  }
  const missing = wanted.filter(slug => !result[slug]);
  if (missing.length > 0) {
    const catalog = await loadPolicies();
    for (const slug of missing) if (catalog[slug]) result[slug] = fromCatalog(slug, catalog[slug]);
  }
  return result;
};

// ---- Provider record ----------------------------------------------------------

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Ana Souza Eletricista" → "ana-souza-eletricista" (a suggestion for the page address). */
export const slugify = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');

export interface BecomeProviderInput {
  displayName: string;
  slug: string;
  occupation: string;
  registryNumber?: string;
  registryUf?: string;
}

/** Creates the provider record (status draft) and its primary occupation; the user's role changes with it. */
export const becomeProvider = (input: BecomeProviderInput): Promise<string | null> =>
  guard(async () => {
    const displayName = input.displayName.trim();
    const slug = input.slug.trim().toLowerCase();
    if (displayName.length < 2 || displayName.length > 120) {
      throw new AppError('invalid_input', { message: 'O nome de exibição precisa ter de 2 a 120 caracteres.' });
    }
    if (!SLUG_PATTERN.test(slug) || slug.length > 80) {
      throw new AppError('invalid_input', {
        message: 'O endereço da página usa só letras minúsculas, números e hífens (até 80 caracteres), sem hífen no começo ou no fim.',
      });
    }
    if (!input.occupation) throw new AppError('invalid_input', { message: 'Escolha a sua ocupação principal.' });
    const uf = input.registryUf?.trim().toUpperCase() ?? '';
    if (uf && !/^[A-Z]{2}$/.test(uf)) throw new AppError('invalid_input', { message: 'Informe a UF do registro com duas letras.' });
    const data = unwrapMaybe<unknown>(
      await db().rpc('become_provider', {
        p_display_name: displayName,
        p_slug: slug,
        p_occupation: input.occupation,
        p_registry_number: input.registryNumber?.trim() || null,
        p_registry_uf: uf || null,
      }),
    );
    return typeof data === 'string' ? data : null;
  });

/**
 * Whether the page address is free (slug_available: every provider counts, approved or not,
 * and the answer never says who holds it). Someone may still take it before the record is
 * created, and then the database answers `slug_taken`.
 */
export const isSlugAvailable = (slug: string): Promise<boolean> =>
  guard(async () => {
    const data = unwrapMaybe<unknown>(await db().rpc('slug_available', { p_slug: slug.trim().toLowerCase() }));
    return data === true;
  });

export interface ProviderChanges {
  display_name?: string;
  bio?: string | null;
  accepts_platform_requests?: boolean;
}

export const updateMyProvider = (providerId: string, changes: ProviderChanges): Promise<ProviderRow> =>
  guard(async () => {
    const row: ProviderChanges = {};
    if (changes.display_name !== undefined) {
      const name = changes.display_name.trim();
      if (name.length < 2 || name.length > 120) {
        throw new AppError('invalid_input', { message: 'O nome de exibição precisa ter de 2 a 120 caracteres.' });
      }
      row.display_name = name;
    }
    if (changes.bio !== undefined) {
      const bio = changes.bio?.trim() ?? '';
      if (bio.length > 2000) throw new AppError('invalid_input', { message: 'A apresentação pode ter até 2000 caracteres.' });
      row.bio = bio || null;
    }
    if (changes.accepts_platform_requests !== undefined) row.accepts_platform_requests = changes.accepts_platform_requests;
    return unwrap<ProviderRow>(await db().from('providers').update(row).eq('id', providerId).select(PROVIDER_COLUMNS).single());
  });

export const listMyOccupations = (providerId: string): Promise<ProviderOccupationRow[]> =>
  guard(async () =>
    unwrap<ProviderOccupationRow[]>(
      await db().from('provider_occupations').select(OCCUPATION_COLUMNS).eq('provider_id', providerId).order('is_primary', { ascending: false }),
    ),
  );

// ---- Service area -------------------------------------------------------------

export const listMyNeighborhoodIds = (providerId: string): Promise<string[]> =>
  guard(async () => {
    const rows = unwrap<Array<{ neighborhood_id: string }>>(
      await db().from('provider_neighborhoods').select('neighborhood_id').eq('provider_id', providerId),
    );
    return rows.map(row => row.neighborhood_id);
  });

export const addMyNeighborhood = (providerId: string, neighborhoodId: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('provider_neighborhoods').insert({ provider_id: providerId, neighborhood_id: neighborhoodId }));
  });

export const removeMyNeighborhood = (providerId: string, neighborhoodId: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(
      await db().from('provider_neighborhoods').delete().eq('provider_id', providerId).eq('neighborhood_id', neighborhoodId),
    );
  });

// ---- Documents ----------------------------------------------------------------

export const DOCUMENT_BUCKET = 'provider-documents';
/** Same limits as the bucket. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export const listMyDocuments = (providerId: string): Promise<ProviderDocumentRow[]> =>
  guard(async () =>
    unwrap<ProviderDocumentRow[]>(
      await db().from('provider_documents').select(DOCUMENT_COLUMNS).eq('provider_id', providerId).order('created_at', { ascending: false }),
    ),
  );

const randomPart = (): string => globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);

/**
 * Sends the file to the private bucket (provider-documents/<provider_id>/...) and
 * records it for the review. A failed record removes the file again.
 */
export const uploadProviderDocument = (input: { providerId: string; step: VerificationStep; file: File }): Promise<ProviderDocumentRow> =>
  guard(async () => {
    const { providerId, step, file } = input;
    const extension = DOCUMENT_TYPES[file.type];
    if (!extension) {
      throw new AppError('invalid_input', { message: 'Envie uma foto (JPG, PNG, WebP ou HEIC) ou um PDF.' });
    }
    if (file.size === 0 || file.size > DOCUMENT_MAX_BYTES) {
      throw new AppError('invalid_input', { message: 'O arquivo precisa ter até 10 MB.' });
    }
    const path = `${providerId}/${step}-${Date.now().toString(36)}-${randomPart()}.${extension}`;
    const bucket = db().storage.from(DOCUMENT_BUCKET);
    const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    try {
      return unwrap<ProviderDocumentRow>(
        await db().from('provider_documents').insert({ provider_id: providerId, step, storage_path: path }).select(DOCUMENT_COLUMNS).single(),
      );
    } catch (err) {
      await bucket.remove([path]).catch(() => undefined);
      throw err;
    }
  });

/** Removes a document that no one has reviewed yet (the database refuses the others). */
export const deleteProviderDocument = (document: Pick<ProviderDocumentRow, 'id' | 'storage_path'>): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('provider_documents').delete().eq('id', document.id));
    await db().storage.from(DOCUMENT_BUCKET).remove([document.storage_path]).catch(() => undefined);
  });

// ---- Review -------------------------------------------------------------------

/** Moves the draft to the review queue; `documents_missing` lists what is lacking (see missingStepsOf). */
export const submitForReview = (): Promise<string | null> =>
  guard(async () => {
    const data = unwrapMaybe<unknown>(await db().rpc('submit_provider_for_review'));
    return typeof data === 'string' ? data : null;
  });
