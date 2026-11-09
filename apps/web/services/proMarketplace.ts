import { AppError } from '../lib/errors';
import { saoPauloDateTime } from '../lib/timezone';
import type { Tables } from '../lib/database.types';
import { db, unwrap, unwrapMaybe } from './client';
import { getFreeProposalsPerMonth } from './proBilling';
import { guard } from './proErrors';
import { monthStartSaoPaulo } from './proFormat';
import type { ProposalRow, ProviderRow } from './types';

/** A request the provider may answer (open_requests_for_me): never carries the client's phone or e-mail. */
export interface OpenRequest {
  id: string;
  occupation_slug: string;
  neighborhood_id: string;
  neighborhood_name: string;
  description: string;
  preferred_dates: string | null;
  urgent: boolean;
  expires_at: string;
  created_at: string;
  proposal_count: number;
  my_proposal_id: string | null;
  my_proposal_status: Tables<'proposals'>['status'] | null;
}

const PROPOSAL_COLUMNS = 'id, request_id, provider_id, price_cents, message, valid_until, status, created_at';

/** Open requests for the occupations and neighborhoods of an approved provider; empty for any other status. */
export const listOpenRequests = (): Promise<OpenRequest[]> =>
  guard(async () => unwrap<OpenRequest[]>(await db().rpc('open_requests_for_me')));

export const listMyProposals = (providerId: string): Promise<ProposalRow[]> =>
  guard(async () =>
    unwrap<ProposalRow[]>(
      await db().from('proposals').select(PROPOSAL_COLUMNS).eq('provider_id', providerId).order('created_at', { ascending: false }),
    ),
  );

export interface NewProposal {
  providerId: string;
  requestId: string;
  priceCents: number;
  message?: string;
  /** Last day the offer holds ("YYYY-MM-DD", São Paulo); empty = no deadline. */
  validUntilDay?: string;
}

export const MESSAGE_MAX = 1000;

/** Sends a proposal. The database applies the per-request limit (`proposal_limit`) and checks the request is still open. */
export const sendProposal = (input: NewProposal): Promise<ProposalRow> =>
  guard(async () => {
    if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) {
      throw new AppError('invalid_input', { message: 'Informe o preço da proposta.' });
    }
    const message = input.message?.trim() ?? '';
    if (message.length > MESSAGE_MAX) throw new AppError('invalid_input', { message: `A mensagem pode ter até ${MESSAGE_MAX} caracteres.` });
    let validUntil: string | null = null;
    if (input.validUntilDay) {
      // The whole last day counts: valid until 23:59:59 in São Paulo
      const end = saoPauloDateTime(input.validUntilDay, '23:59:59');
      if (!end) throw new AppError('invalid_input', { message: 'Confira a data de validade.' });
      if (end.getTime() <= Date.now()) throw new AppError('invalid_input', { message: 'A validade precisa ser uma data futura.' });
      validUntil = end.toISOString();
    }
    return unwrap<ProposalRow>(
      await db()
        .from('proposals')
        .insert({ request_id: input.requestId, provider_id: input.providerId, price_cents: input.priceCents, message: message || null, valid_until: validUntil })
        .select(PROPOSAL_COLUMNS)
        .single(),
    );
  });

/** A proposal can be withdrawn while it is still "sent". */
export const withdrawProposal = (proposalId: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('proposals').update({ status: 'withdrawn' }).eq('id', proposalId));
  });

// ---- Free allowance -------------------------------------------------------------

/** The free plan has a monthly allowance; the Pro plan has none. */
export type ProposalAllowance = { kind: 'unlimited' } | { kind: 'limited'; limit: number; used: number };

/**
 * What the plan allows for proposals this month. The free plan sends up to `limit` per calendar month in
 * São Paulo, counted when a proposal is created whatever happens to it later (the check_proposal trigger
 * counts the same way and is what enforces it). A `limit` of null (unreadable, or no limit set) gives null:
 * the screens show nothing rather than a made-up number.
 */
export const proposalAllowance = (input: {
  plan: ProviderRow['plan'];
  limit: number | null;
  proposals: Array<Pick<ProposalRow, 'created_at'>>;
  now?: Date;
}): ProposalAllowance | null => {
  if (input.plan === 'pro') return { kind: 'unlimited' };
  if (input.limit === null) return null;
  const since = monthStartSaoPaulo(input.now).getTime();
  const used = input.proposals.filter(item => new Date(item.created_at).getTime() >= since).length;
  return { kind: 'limited', limit: input.limit, used };
};

/** Reads what proposalAllowance needs (a Pro provider needs no read). Rejects when a read fails. */
export const getProposalAllowance = async (provider: Pick<ProviderRow, 'id' | 'plan'>): Promise<ProposalAllowance | null> => {
  if (provider.plan === 'pro') return { kind: 'unlimited' };
  const [limit, proposals] = await Promise.all([getFreeProposalsPerMonth(), listMyProposals(provider.id)]);
  return proposalAllowance({ plan: provider.plan, limit, proposals });
};
