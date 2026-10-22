import { AppError } from '../lib/errors';
import { formatTstzRange, type Period } from '../lib/tstzrange';
import { db, unwrap, unwrapMaybe } from './client';
import type { ProposalRow, RequestInsert, RequestRow } from './types';

export interface NewRequest {
  clientId: string;
  occupationSlug: string;
  neighborhoodId: string;
  description: string;
  preferredDates?: string;
  urgent?: boolean;
}

/** Same bounds as the database check on requests.description. */
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;

const REQUEST_COLUMNS =
  'id, client_id, occupation_slug, neighborhood_id, description, preferred_dates, urgent, status, expires_at, created_at';
const PROPOSAL_COLUMNS = 'id, request_id, provider_id, price_cents, message, valid_until, status, created_at';

export const createRequest = async (input: NewRequest): Promise<RequestRow> => {
  const description = input.description.trim();
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) throw new AppError('invalid_input');
  const row: RequestInsert = {
    client_id: input.clientId,
    occupation_slug: input.occupationSlug,
    neighborhood_id: input.neighborhoodId,
    description,
    preferred_dates: input.preferredDates?.trim() || null,
    urgent: input.urgent ?? false,
  };
  return unwrap<RequestRow>(await db().from('requests').insert(row).select(REQUEST_COLUMNS).single());
};

/** The signed-in client's requests (RLS returns only theirs), newest first. */
export const listMyRequests = async (): Promise<RequestRow[]> =>
  unwrap<RequestRow[]>(await db().from('requests').select(REQUEST_COLUMNS).order('created_at', { ascending: false }));

export const getRequest = async (id: string): Promise<RequestRow> => {
  const row = unwrapMaybe<RequestRow>(await db().from('requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle());
  if (!row) throw new AppError('not_found');
  return row;
};

export interface ProposalWithProvider extends ProposalRow {
  /** Null when the provider's public name is not readable by this user. */
  provider_name: string | null;
  provider_slug: string | null;
}

/** Proposals received for a request, with the provider's public name when RLS allows it. */
export const listProposals = async (requestId: string): Promise<ProposalWithProvider[]> => {
  const proposals = unwrap<ProposalRow[]>(
    await db().from('proposals').select(PROPOSAL_COLUMNS).eq('request_id', requestId).order('created_at', { ascending: true }),
  );
  const ids = [...new Set(proposals.map(p => p.provider_id))];
  const names = new Map<string, { display_name: string; slug: string }>();
  if (ids.length > 0) {
    // A separate read: if RLS hides providers, the list still loads without names
    const { data } = await db().from('providers').select('id, display_name, slug').in('id', ids);
    for (const p of (data ?? []) as Array<{ id: string; display_name: string; slug: string }>) names.set(p.id, p);
  }
  return proposals.map(p => ({
    ...p,
    provider_name: names.get(p.provider_id)?.display_name ?? null,
    provider_slug: names.get(p.provider_id)?.slug ?? null,
  }));
};

/**
 * Accepts a proposal for the chosen period: the database declines the others,
 * marks the request matched and creates the booking. Returns the booking id
 * when the function returns it.
 */
export const acceptProposal = async (proposalId: string, period: Period): Promise<string | null> => {
  let range: string;
  try {
    range = formatTstzRange(period);
  } catch {
    throw new AppError('invalid_input');
  }
  const data = unwrapMaybe<unknown>(await db().rpc('accept_proposal', { p_proposal: proposalId, p_period: range }));
  return typeof data === 'string' ? data : null;
};
