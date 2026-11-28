import { features } from '../config/features';
import type { Json } from '../lib/database.types';
import { db, nullable, unwrap, unwrapMaybe } from './client';
import { quoteRide, type RideLegInput, type RideQuote } from './rides';
import type { SafetyStatus } from './rideSafety';

// PAR-501..504: who rides and who pays. The passenger is always the signed-in account;
// a payer mandate (sponsor, family, companion) or a dependent flag is applied by the server.

export type AccountKind = 'family' | 'organization' | 'fleet';
export type AccountRole = 'admin' | 'member' | 'operator' | 'approver' | 'manager' | 'fleet_driver';
export type AgeBand = '13-15' | '16-17';
export type PayMethod = 'pix' | 'card';

export interface AccountMember {
  member_id: string;
  /** Profile name; null when the profile is gone. */
  name: string | null;
  role: AccountRole;
  status: 'active' | 'removed';
  member_limit_cents: number | null;
}
/** An adhesion invite as the account lists it: no token, no e-mail. */
export interface PendingInvite {
  id: string;
  role: AccountRole;
  expires_at: string;
  status: string;
}
/**
 * One row of `ride_my_accounts()`: an active account the caller is an active member of. Limits,
 * the month's commitment, `members` and `invites` come only to who administers the account.
 */
export interface PartyAccount {
  id: string;
  kind: AccountKind;
  name: string;
  role: AccountRole;
  owner: boolean;
  default_method: PayMethod | null;
  monthly_limit_cents: number | null;
  committed_cents: number | null;
  /** The caller's own monthly limit in this account. */
  member_limit_cents: number | null;
  /** The caller's active mandate: rides on the group profile are paid by the account owner. */
  mandate_id: string | null;
  members: AccountMember[];
  invites: PendingInvite[];
}
/** An active mandate that lets the caller ride while someone else pays. */
export interface PayerMandate {
  id: string;
  kind: 'sponsor' | 'family' | 'companion';
  account_id: string | null;
  payer_label: string;
  /** Highest price of one ride, when the mandate states it. */
  ceiling_cents: number | null;
  /** The caller's monthly limit under this mandate, when there is one. */
  limit_cents: number | null;
  valid_until: string | null;
}
/** A trusted-companion link; `mine` is true when the caller is the person being accompanied. */
export interface Companion {
  owner_id: string;
  companion_id: string;
  label: string;
  mine: boolean;
  notices: string[];
  pays: boolean;
}
export interface DependentLeg {
  leg_id: string;
  status: string;
  pickup_at: string | null;
}
export interface Dependent {
  id: string;
  account_id: string;
  label: string;
  age_band: AgeBand;
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  valid_until: string | null;
  legs: DependentLeg[];
}
/** A company program the caller may ride on (professional profile). */
export interface FundedProgram {
  program_id: string;
  account_id: string;
  account_name: string;
  label: string;
  requires_approval: boolean;
  cost_centers: { id: string; code: string; label: string }[];
  grants: { id: string; cost_center_id: string | null; purpose: string; valid_until: string }[];
}
export interface PartyOverview {
  accounts: PartyAccount[];
  mandates: PayerMandate[];
  companions: Companion[];
  dependents: Dependent[];
  programs: FundedProgram[];
}
/** What an adhesion invite is for, as its confirmed recipient reads it before answering. */
export interface AccountInviteView {
  id: string;
  account_name: string;
  kind: AccountKind;
  role: AccountRole;
  expires_at: string;
  simulation: boolean;
}

/** A one-time invite: the token comes back once; a replay of the same request returns `token: null`. */
export interface IssuedInvite {
  id: string;
  token: string | null;
  expires_at: string;
}
export interface RiderInviteView {
  status: string;
  legs: { seq: number; origin: string; destination: string; pickup_at: string | null }[];
  scheduled_at: string | null;
  instructions: string | null;
  expires_at: string;
  simulation: boolean;
  support: { channel: 'email' | 'phone' | null; address: string | null; team: string | null } | null;
}
export interface RiderInviteAnswer {
  status: string;
  quote_id: string | null;
  ride_id: string | null;
}
export interface SentRiderInvite {
  id: string;
  status: string;
  ceiling_cents: number;
  expires_at: string;
  answered_at: string | null;
}
export interface AccountStatement {
  month: string;
  role: AccountRole;
  monthly_limit_cents: number | null;
  member_limit_cents: number | null;
  /** Sum of the fares of the rows that count (not cancelled); only for who administers. */
  total_cents: number | null;
  rows: {
    leg_id: string;
    member_id: string;
    member_name: string | null;
    date: string;
    pickup_at: string | null;
    status: string;
    counted: boolean;
    fare_cents: number | null;
    order_status: string | null;
    received_cents: number | null;
    refunded_cents: number | null;
  }[];
}
export interface CompanionProgress {
  status: string;
  eta: string | null;
  simulation: boolean;
}
export interface MinorAlert {
  kind: string;
  at: string;
  escalated_protocol: string | null;
}
export type GuardianWatch = Pick<SafetyStatus, 'status' | 'simulation' | 'wellness' | 'location'> & {
  alerts: MinorAlert[];
};

export const INVITE_MINUTES = [5, 15, 30, 60] as const;

const list = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

// Organization rows carry these sections for the caller's role (PAR-505/506, services/rideBusiness.ts).
interface OrganizationSections {
  verified?: boolean;
  cost_centers?: { id: string; code: string; label: string; active: boolean }[];
  programs?: { id: string; label: string; enabled: boolean; requires_approval: boolean }[];
  grants?: {
    id: string;
    program_id: string;
    cost_center_id: string | null;
    purpose: string;
    status: string;
    valid_until: string;
    mine: boolean;
  }[];
}
type AccountRow = PartyAccount & OrganizationSections & { dependents?: Dependent[] };
interface AccountsEnvelope {
  accounts?: AccountRow[];
  mandates?: PayerMandate[];
  companions?: Companion[];
  dependents?: Dependent[];
}

export const parties = {
  /**
   * Accounts, mandates, companions, dependents and programs of the caller, in one read.
   * `ride_my_accounts()` answers the list of accounts. Companions, companion mandates and
   * dependents have no listing call of their own in the stage design, so they are read from the
   * envelope form of the same answer (or from the family row, for dependents) when it is sent.
   */
  overview: async (): Promise<PartyOverview> => {
    const data = unwrapMaybe<AccountRow[] | AccountsEnvelope>(await db().rpc('ride_my_accounts'));
    const envelope: AccountsEnvelope = Array.isArray(data) ? { accounts: data } : (data ?? {});
    const rows = list(envelope.accounts);
    const family = rows
      .filter((row) => row.kind === 'family' && row.mandate_id && !row.owner)
      .map((row): PayerMandate => ({
        id: row.mandate_id!,
        kind: 'family',
        account_id: row.id,
        payer_label: row.name,
        ceiling_cents: null,
        limit_cents: row.member_limit_cents ?? null,
        valid_until: null,
      }));
    const programs = rows
      .filter((row) => row.kind === 'organization' && row.verified !== false)
      .flatMap((row) =>
        list(row.programs)
          .filter((program) => program.enabled)
          .map((program): FundedProgram => ({
            program_id: program.id,
            account_id: row.id,
            account_name: row.name,
            label: program.label,
            requires_approval: program.requires_approval,
            cost_centers: list(row.cost_centers).filter((center) => center.active),
            grants: list(row.grants).filter((g) => g.program_id === program.id && g.status === 'approved' && g.mine),
          })),
      );
    return {
      accounts: rows.map((row) => ({ ...row, members: list(row.members), invites: list(row.invites) })),
      mandates: [...family, ...list(envelope.mandates).filter((m) => !family.some((f) => f.id === m.id))],
      companions: list(envelope.companions),
      dependents: [...list(envelope.dependents), ...rows.flatMap((row) => list(row.dependents))].map((dependent) => ({
        ...dependent,
        legs: list(dependent.legs),
      })),
      programs,
    };
  },

  // PAR-501 · ride requested for another adult
  inviteRider: async (quote: string, email: string, minutes: number, instructions: string, key: string) =>
    unwrap<IssuedInvite>(
      await db().rpc('ride_invite_rider', {
        p_quote: quote,
        p_email: email,
        p_minutes: minutes,
        p_instructions: nullable(instructions.trim() || null)!,
        p_key: key,
      }),
    ),
  riderInvite: async (token: string) =>
    unwrapMaybe<RiderInviteView>(await db().rpc('ride_rider_invite', { p_token: token })),
  answerRiderInvite: async (token: string, accept: boolean, key: string) =>
    unwrap<RiderInviteAnswer>(
      await db().rpc('ride_answer_rider_invite', { p_token: token, p_accept: accept, p_key: key }),
    ),
  revokeRiderInvite: async (id: string) => unwrap<boolean>(await db().rpc('ride_revoke_rider_invite', { p_id: id })),
  riderInvites: async () => list(unwrapMaybe<SentRiderInvite[]>(await db().rpc('ride_my_rider_invites'))),

  // PAR-502 · family group and shared payer
  createFamily: async (name: string, monthlyLimit: number, method: PayMethod, key: string) =>
    unwrap<string>(
      await db().rpc('ride_create_family', {
        p_name: name,
        p_monthly_limit: monthlyLimit,
        p_method: method,
        p_key: key,
      }),
    ),
  inviteMember: async (account: string, email: string, role: AccountRole, minutes: number, key: string) =>
    unwrap<IssuedInvite>(
      await db().rpc('ride_invite_member', {
        p_account: account,
        p_email: email,
        p_role: role,
        p_minutes: minutes,
        p_key: key,
      }),
    ),
  accountInvite: async (token: string) =>
    unwrapMaybe<AccountInviteView>(await db().rpc('ride_account_invite', { p_token: token })),
  revokeAccountInvite: async (id: string) =>
    unwrap<boolean>(await db().rpc('ride_revoke_account_invite', { p_id: id })),
  joinAccount: async (token: string, accept: boolean) =>
    unwrap<string>(await db().rpc('ride_join_account', { p_token: token, p_accept: accept })),
  setMemberLimit: async (account: string, member: string, cents: number | null) => {
    unwrapMaybe(
      await db().rpc('ride_set_member_limit', { p_account: account, p_member: member, p_cents: nullable(cents)! }),
    );
  },
  setAccountLimit: async (account: string, cents: number, method: PayMethod) => {
    unwrapMaybe(await db().rpc('ride_set_account_limit', { p_account: account, p_cents: cents, p_method: method }));
  },
  removeMember: async (account: string, member: string, key: string) =>
    unwrap<boolean>(await db().rpc('ride_remove_member', { p_account: account, p_member: member, p_key: key })),
  statement: async (account: string, month: string) =>
    unwrap<AccountStatement>(await db().rpc('ride_account_statement', { p_account: account, p_month: month })),

  // PAR-503 · trusted companion
  inviteCompanion: async (email: string, notices: string[], pays: boolean, minutes: number, key: string) =>
    unwrap<IssuedInvite>(
      await db().rpc('ride_invite_companion', {
        p_email: email,
        p_notices: notices,
        p_pays: pays,
        p_minutes: minutes,
        p_key: key,
      }),
    ),
  answerCompanion: async (token: string, accept: boolean) =>
    unwrap<string>(await db().rpc('ride_answer_companion', { p_token: token, p_accept: accept })),
  setCompanion: async (companion: string, notices: string[], pays: boolean) => {
    unwrapMaybe(await db().rpc('ride_set_companion', { p_companion: companion, p_notices: notices, p_pays: pays }));
  },
  /** Either side may end the link: `other` is the person on the other end of it. */
  revokeCompanion: async (other: string) =>
    unwrap<boolean>(await db().rpc('ride_revoke_companion', { p_companion: other })),
  companionProgress: async (owner: string) =>
    unwrapMaybe<CompanionProgress>(await db().rpc('ride_companion_progress', { p_owner: owner })),

  // PAR-504 · adolescent travelling under a guardian
  registerDependent: async (account: string, label: string, ageBand: AgeBand, legalBasis: string, key: string) =>
    unwrap<string>(
      await db().rpc('ride_register_dependent', {
        p_account: account,
        p_label: label,
        p_age_band: ageBand,
        p_legal_basis: legalBasis,
        p_key: key,
      }),
    ),
  guardianWatch: async (leg: string): Promise<GuardianWatch> => {
    const data = unwrap<GuardianWatch>(await db().rpc('ride_guardian_watch', { p_leg: leg }));
    return { ...data, alerts: list(data.alerts) };
  },
  guardianEscalate: async (leg: string, key: string) =>
    unwrap<string>(await db().rpc('ride_guardian_escalate', { p_leg: leg, p_key: key })),
};

/** What the passenger chose in "Quem viaja e quem paga". */
export type Funding =
  | { kind: 'self' }
  | { kind: 'mandate'; mandate: string }
  | { kind: 'funded'; program: string; costCenter: string; grant: string | null }
  | { kind: 'dependent'; dependent: string; consent: boolean };

export const SELF_FUNDING: Funding = { kind: 'self' };

/** What still blocks a quote with this choice, as a sentence for the form; null when it can be sent. */
export function fundingProblem(funding: Funding): string | null {
  if (funding.kind === 'funded' && !funding.costCenter) return 'Escolha o centro de custo desta viagem a trabalho.';
  if (funding.kind === 'dependent' && !funding.consent)
    return 'Marque o aceite do responsável para cotar a viagem do dependente.';
  return null;
}

type Quoted = Pick<RideQuote, 'id' | 'expires_at' | 'total_cents' | 'legs'>;

/**
 * One standalone quote for any funding choice: the server applies the mandate, the company
 * program or the dependent flag. None of these wrappers takes a booking, so a ride linked to
 * a service keeps using `quoteRide`.
 */
export async function quoteRideFor(
  funding: Funding,
  key: string,
  scheduledAt: string | null,
  legs: RideLegInput[],
): Promise<Quoted> {
  const common = {
    p_key: key,
    p_scheduled_at: nullable(scheduledAt)!,
    p_legs: legs.map((leg) => ({ ...leg })) as unknown as Json,
  };
  switch (funding.kind) {
    case 'self':
      return quoteRide(key, null, scheduledAt, legs);
    case 'mandate':
      return unwrap<Quoted>(await db().rpc('ride_quote_sponsored', { ...common, p_mandate: funding.mandate }));
    case 'funded':
      return unwrap<Quoted>(
        await db().rpc('ride_quote_funded', {
          ...common,
          p_program: funding.program,
          p_cost_center: funding.costCenter,
          p_grant: nullable(funding.grant)!,
        }),
      );
    case 'dependent':
      return unwrap<Quoted>(
        await db().rpc('ride_quote_for_dependent', {
          ...common,
          p_dependent: funding.dependent,
          p_consent: funding.consent,
        }),
      );
  }
}

/**
 * Address of /corridas/convite for a link handed to another person, or null when this build
 * has no site to point to. Ask before issuing an invite: the token is returned only once.
 */
export function invitePageUrl(routerHref: string): string | null {
  const site = features.siteUrl;
  if (import.meta.env.VITE_ROUTER === 'hash' && !site) return null;
  return site ? new URL('corridas/convite', site + '/').href : new URL(routerHref, window.location.href).href;
}
