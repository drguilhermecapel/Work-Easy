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
  group_tag: string | null;
}
/** An adhesion invite as the account lists it: no token, no e-mail. */
export interface PendingInvite {
  id: string;
  role: AccountRole;
  expires_at: string;
  status: string;
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
  legal_basis: string;
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  /** Plain date, "YYYY-MM-DD"; null until the operation reviews the record. */
  valid_until: string | null;
  /** The ten most recent legs that carried this dependent. */
  legs: DependentLeg[];
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
  /** A family needs no review; a company or a fleet operates only while this is true. */
  verified: boolean;
  default_method: PayMethod | null;
  monthly_limit_cents: number | null;
  committed_cents: number | null;
  /** The caller's own monthly limit in this account. */
  member_limit_cents: number | null;
  /** The caller's group in a company, for programs restricted to one. */
  group_tag: string | null;
  /** The caller's active mandate: rides on the group profile are paid by the account owner. */
  mandate_id: string | null;
  members: AccountMember[];
  invites: PendingInvite[];
}
/** An active mandate that lets the caller ride while someone else pays. */
export interface PayerMandate {
  id: string;
  kind: 'family' | 'companion';
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
  /** Name of the person on the other end of the link. */
  label: string;
  mine: boolean;
  notices: string[];
  pays: boolean;
}
/** A companion invite the caller sent: no token and no e-mail. */
export interface CompanionInvite {
  id: string;
  status: string;
  notices: string[];
  pays: boolean;
  expires_at: string;
}
/** A company program the caller may ride on (professional profile). */
export interface FundedProgram {
  program_id: string;
  account_id: string;
  account_name: string;
  label: string;
  requires_approval: boolean;
  excess_payer: 'rider' | 'none';
  ride_value_cents: number;
  cost_centers: { id: string; code: string; label: string }[];
  /** The caller's approved authorizations for this program. */
  grants: { id: string; cost_center_id: string | null; purpose: string; valid_until: string }[];
}
export interface PartyOverview {
  accounts: PartyAccount[];
  mandates: PayerMandate[];
  companions: Companion[];
  companionInvites: CompanionInvite[];
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
/** What a companion invite asks, as its confirmed recipient reads it before answering. */
export interface CompanionInviteView {
  id: string;
  owner_label: string;
  notices: string[];
  pays: boolean;
  /** Highest price of one ride the companion would pay; null when the invite does not ask to pay. */
  ceiling_cents: number | null;
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
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
  /** Areas only; empty once the invite is closed. */
  legs: { seq: number; origin: string; destination: string; pickup_at: string | null }[];
  scheduled_at: string | null;
  instructions: string | null;
  expires_at: string;
  simulation: boolean;
  /** The staffed channel on duty now or next; null when no shift is scheduled. */
  support: { channel: 'email' | 'phone'; address: string; team: string; on_duty: boolean } | null;
}
export interface RiderInviteAnswer {
  status: 'accepted' | 'declined';
  quote_id: string | null;
  ride_id: string | null;
}
export interface SentRiderInvite {
  id: string;
  status: string;
  ceiling_cents: number;
  scheduled_at: string | null;
  expires_at: string;
  answered_at: string | null;
  created_at: string;
  ride_id: string | null;
}
export interface AccountStatement {
  account_id: string;
  month: string;
  role: AccountRole;
  default_method: PayMethod | null;
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
  seen_at: string;
  escalated_protocol: string | null;
}
/** The guardian reads the leg as its passenger, plus the alerts kept for it. */
export type GuardianWatch = SafetyStatus & { alerts: MinorAlert[] };

/** Validity of a ride invite, in minutes: the database takes exactly these. */
export const INVITE_MINUTES = [5, 15, 30, 60] as const;

const list = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

// What `ride_my_accounts()` adds to a row: dependents on the guardian's family rows and, on
// organization rows, the sections the caller's role may read (see services/rideBusiness.ts).
interface AccountRow extends PartyAccount {
  dependents?: Dependent[];
  cost_centers?: { id: string; code: string; label: string; active: boolean }[];
  programs?: {
    id: string;
    label: string;
    enabled: boolean;
    requires_approval: boolean;
    excess_payer: 'rider' | 'none';
    ride_value_cents: number;
    group_tag: string | null;
    valid_from: string;
    valid_until: string;
  }[];
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
interface CompanionsAnswer {
  companions: Companion[];
  mandates: PayerMandate[];
  invites: CompanionInvite[];
}

const accountRows = async () => list(unwrapMaybe<AccountRow[]>(await db().rpc('ride_my_accounts')));

export const parties = {
  /**
   * Accounts, mandates, companions, dependents and programs of the caller: `ride_my_accounts()`
   * answers the accounts (with the guardian's dependents and the company sections), and
   * `ride_my_companions()` the companion links, the companion mandates and the invites sent.
   */
  overview: async (): Promise<PartyOverview> => {
    const [rows, links] = await Promise.all([
      accountRows(),
      (async () => unwrapMaybe<CompanionsAnswer>(await db().rpc('ride_my_companions')))(),
    ]);
    const now = Date.now();
    const family = rows
      .filter((row) => row.kind === 'family' && row.mandate_id)
      .map((row): PayerMandate => ({
        id: row.mandate_id!,
        kind: 'family',
        account_id: row.id,
        payer_label: row.name,
        ceiling_cents: null,
        limit_cents: row.member_limit_cents,
        valid_until: null,
      }));
    const programs = rows
      .filter((row) => row.kind === 'organization' && row.verified)
      .flatMap((row) =>
        list(row.programs)
          .filter(
            (program) =>
              program.enabled &&
              Date.parse(program.valid_until) > now &&
              (!program.group_tag || program.group_tag === row.group_tag),
          )
          .map((program): FundedProgram => ({
            program_id: program.id,
            account_id: row.id,
            account_name: row.name,
            label: program.label,
            requires_approval: program.requires_approval,
            excess_payer: program.excess_payer,
            ride_value_cents: program.ride_value_cents,
            cost_centers: list(row.cost_centers).filter((center) => center.active),
            grants: list(row.grants).filter((g) => g.program_id === program.id && g.status === 'approved' && g.mine),
          })),
      );
    return {
      accounts: rows.map((row) => ({ ...row, members: list(row.members), invites: list(row.invites) })),
      mandates: [...family, ...list(links?.mandates)],
      companions: list(links?.companions),
      companionInvites: list(links?.invites),
      dependents: rows.flatMap((row) => list(row.dependents)).map((dependent) => ({ ...dependent, legs: list(dependent.legs) })),
      programs,
    };
  },
  /** Leg id → dependent label, for the legs of the caller that carry a dependent. */
  dependentLegs: async (): Promise<Record<string, string>> => {
    const found: Record<string, string> = {};
    for (const row of await accountRows())
      for (const dependent of list(row.dependents))
        for (const leg of list(dependent.legs)) found[leg.leg_id] = dependent.label;
    return found;
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
    unwrap<'accepted' | 'declined'>(await db().rpc('ride_join_account', { p_token: token, p_accept: accept })),
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
  companionInvite: async (token: string) =>
    unwrapMaybe<CompanionInviteView>(await db().rpc('ride_companion_invite', { p_token: token })),
  answerCompanion: async (token: string, accept: boolean) =>
    unwrap<'accepted' | 'declined'>(await db().rpc('ride_answer_companion', { p_token: token, p_accept: accept })),
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
  | { kind: 'funded'; program: string; costCenter: string; grant: string | null; approval: boolean }
  | { kind: 'dependent'; dependent: string; consent: boolean };

export const SELF_FUNDING: Funding = { kind: 'self' };

/** What still blocks a quote with this choice, as a sentence for the form; null when it can be sent. */
export function fundingProblem(funding: Funding): string | null {
  if (funding.kind === 'funded' && !funding.costCenter) return 'Escolha o centro de custo desta viagem a trabalho.';
  if (funding.kind === 'funded' && funding.approval && !funding.grant)
    return 'Este programa pede uma autorização aprovada. Escolha a autorização ou peça uma em Empresa.';
  if (funding.kind === 'dependent' && !funding.consent)
    return 'Marque o aceite do responsável para cotar a viagem do dependente.';
  return null;
}

type Quoted = Pick<RideQuote, 'id' | 'expires_at' | 'total_cents' | 'legs' | 'funding'>;

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
