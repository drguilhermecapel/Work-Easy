import type { Json } from '../lib/database.types';
import type { RideLegInput, RideQuote } from './rides';
import { db, nullable, unwrap, unwrapMaybe } from './client';

// Organizations, trip grants, voucher programs and invoices of the ride module (O17 PAR-505..507).
// Every rule (role, budget, approval, invoice state) is decided by the database; this file only
// names the calls and the shapes the screens read.

export type OrgRole = 'admin' | 'member' | 'operator' | 'approver' | 'manager';
export type VoucherMethod = 'pix' | 'card';

export interface OrgMember {
  member_id: string;
  /** Profile name; null when the profile is gone. Never an e-mail or a document. */
  name: string | null;
  role: OrgRole;
  status: 'active' | 'removed';
  group_tag: string | null;
}

/** An adhesion invite as the account lists it: no token, no e-mail. */
export interface PendingInvite {
  id: string;
  role: OrgRole;
  expires_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
}

export interface CostCenter {
  id: string;
  code: string;
  label: string;
  active: boolean;
}

export interface VoucherProgram {
  id: string;
  label: string;
  enabled: boolean;
  /** Budget and commitment are sent only to the roles that may see them. */
  budget_cents: number | null;
  committed_cents: number | null;
  ride_value_cents: number;
  member_limit_cents: number | null;
  areas: string[];
  classes: string[];
  group_tag: string | null;
  valid_from: string | null;
  valid_until: string | null;
  excess_payer: 'rider' | 'none';
  requires_approval: boolean;
}

export interface TripGrant {
  id: string;
  program_id: string;
  cost_center_id: string | null;
  /** Display name of the person who will travel. */
  beneficiary: string;
  purpose: string;
  status: 'requested' | 'approved' | 'rejected' | 'used' | 'expired';
  valid_from: string;
  valid_until: string;
  /** True when the caller is the beneficiary: an approver never decides their own request. */
  mine: boolean;
}

/**
 * One row of `ride_my_accounts()`, which lists only active accounts the caller is an active member of.
 * `members` and `invites` come filled for admins and managers; the organization sections
 * (`cost_centers`, `programs`, `grants`) come only for the caller's role.
 */
export interface OrgAccount {
  id: string;
  kind: 'family' | 'organization' | 'fleet';
  name: string;
  role: OrgRole;
  /** The caller opened the account; the owner cannot be removed. */
  owner: boolean;
  /** The operation has checked the company and the check is still valid. */
  verified: boolean;
  verified_until: string | null;
  members: OrgMember[];
  invites: PendingInvite[];
  cost_centers?: CostCenter[];
  programs?: VoucherProgram[];
  grants?: TripGrant[];
}

/** The token comes once; a replay of the same key answers `token: null`. */
export interface IssuedInvite {
  id: string;
  token: string | null;
  expires_at: string;
}

export interface ReportRow {
  /** Local date of the trip (São Paulo), "YYYY-MM-DD". */
  date: string;
  cost_center: string | null;
  member: string;
  ride_class: string | null;
  voucher_cents: number;
  refunded_cents: number;
}

export interface OrgReport {
  rows: ReportRow[];
  /** The closed invoice of this month, when finance has closed it. */
  invoice: { id: string; status: string; total_cents: number; closed_at: string } | null;
}

export type InvoiceLineKind = 'voucher' | 'refund' | 'adjustment' | 'personal_topup';

export interface InvoiceLine {
  id: string;
  kind: InvoiceLineKind;
  billable: boolean;
  cost_center: string | null;
  member: string | null;
  /** Signed: credits are negative. */
  cents: number;
  occurred_at: string;
  dispute: { status: 'open' | 'accepted' | 'rejected'; decision: string | null } | null;
}

export interface Invoice {
  id: string;
  month: string;
  status: string;
  closed_at: string;
  total_cents: number;
  lines: InvoiceLine[];
}

export interface VoucherRedemption {
  order_id: string;
  /** Cents of the voucher applied to the order. */
  applied_cents: number;
  /** What is left on the same order for the rider's own method. */
  remainder_cents: number;
}

export interface GuestInviteAnswer {
  status: string;
  ride_id: string | null;
}

/** What a professional quote answers: the rider stays the payer and the legs carry the company's share. */
export type FundedQuote = Pick<RideQuote, 'id' | 'expires_at' | 'total_cents' | 'legs'>;

export const business = {
  /** The organizations the caller belongs to (family and fleet accounts have their own screens). */
  accounts: async () => {
    // The database answers a plain list; the envelope is accepted too because the family screens read one.
    const data = unwrapMaybe<OrgAccount[] | { accounts?: OrgAccount[] }>(await db().rpc('ride_my_accounts'));
    const rows = Array.isArray(data) ? data : (data?.accounts ?? []);
    return rows
      .filter((account) => account.kind === 'organization')
      .map((account) => ({ ...account, members: account.members ?? [], invites: account.invites ?? [] }));
  },
  create: async (name: string, key: string) =>
    unwrap<string>(await db().rpc('ride_create_organization', { p_name: name, p_key: key })),
  inviteMember: async (account: string, email: string, role: OrgRole, minutes: number, key: string) =>
    unwrap<IssuedInvite>(
      await db().rpc('ride_invite_member', {
        p_account: account,
        p_email: email,
        p_role: role,
        p_minutes: minutes,
        p_key: key,
      }),
    ),
  /** The issuer or an admin ends a pending invite; false when it was no longer pending. */
  revokeInvite: async (id: string) => unwrap<boolean>(await db().rpc('ride_revoke_account_invite', { p_id: id })),
  /** Answers nothing; a refusal arrives as an error. */
  setRole: async (account: string, member: string, role: OrgRole, group: string | null) => {
    unwrapMaybe<null>(
      await db().rpc('ride_set_member_role', {
        p_account: account,
        p_member: member,
        p_role: role,
        p_group: nullable(group)!,
      }),
    );
  },
  /** An admin removes someone else; any other member may remove themselves. False when already removed. */
  removeMember: async (account: string, member: string, key: string) =>
    unwrap<boolean>(await db().rpc('ride_remove_member', { p_account: account, p_member: member, p_key: key })),
  /** Creates the cost center or, for a code that exists, updates its label and state. */
  saveCostCenter: async (account: string, code: string, label: string, active: boolean) =>
    unwrap<string>(
      await db().rpc('ride_save_cost_center', { p_account: account, p_code: code, p_label: label, p_active: active }),
    ),
  requestGrant: async (
    account: string,
    program: string,
    costCenter: string,
    purpose: string,
    from: string,
    until: string,
    key: string,
  ) =>
    unwrap<string>(
      await db().rpc('ride_request_trip_grant', {
        p_account: account,
        p_program: program,
        p_cost_center: costCenter,
        p_purpose: purpose,
        p_from: from,
        p_until: until,
        p_key: key,
      }),
    ),
  decideGrant: async (grant: string, approve: boolean) =>
    unwrap<string>(await db().rpc('ride_decide_trip_grant', { p_grant: grant, p_approve: approve })),
  inviteGuest: async (
    account: string,
    program: string,
    costCenter: string,
    email: string,
    legs: RideLegInput[],
    scheduledAt: string | null,
    minutes: number,
    key: string,
  ) =>
    unwrap<IssuedInvite>(
      await db().rpc('ride_invite_guest', {
        p_account: account,
        p_program: program,
        p_cost_center: costCenter,
        p_email: email,
        p_legs: legs.map((leg) => ({ ...leg })) satisfies Json,
        p_scheduled_at: nullable(scheduledAt)!,
        p_minutes: minutes,
        p_key: key,
      }),
    ),
  /** `month` is the first day of the month, "YYYY-MM-01". */
  report: async (account: string, month: string) =>
    unwrap<OrgReport>(await db().rpc('ride_org_report', { p_account: account, p_month: month })),
  invoice: async (id: string) => unwrap<Invoice>(await db().rpc('ride_invoice', { p_invoice: id })),
  /** The export is saved as it comes: the database already leaves places and routes out of it. */
  exportInvoice: async (id: string) => unwrap<Json>(await db().rpc('ride_invoice_export', { p_invoice: id })),
  dispute: async (line: string, reason: string, key: string) =>
    unwrap<string>(await db().rpc('ride_dispute_invoice_line', { p_line: line, p_reason: reason, p_key: key })),
};

/** A ride on the professional profile; a personal ride is the plain `quoteRide`. */
export const quoteFunded = async (
  key: string,
  scheduledAt: string | null,
  legs: RideLegInput[],
  program: string,
  costCenter: string,
  grant: string | null = null,
) =>
  unwrap<FundedQuote>(
    await db().rpc('ride_quote_funded', {
      p_key: key,
      p_scheduled_at: nullable(scheduledAt)!,
      p_legs: legs.map((leg) => ({ ...leg })) satisfies Json,
      p_program: program,
      p_cost_center: costCenter,
      p_grant: nullable(grant),
    }),
  );

/**
 * Applies the company voucher to a completed leg, in the payer's own session. What the voucher does
 * not cover stays on the same payment order for `method`. A replay answers the same result.
 */
export const redeemVoucher = async (leg: string, method: VoucherMethod) =>
  unwrap<VoucherRedemption>(await db().rpc('ride_redeem_voucher', { p_leg: leg, p_method: method }));

/**
 * Answer of the invited guest. Accepting creates the funded quote and the consent in the guest's
 * own session; a token that is not a guest invite for this account raises `ride_invite_unavailable`.
 */
export const answerGuestInvite = async (token: string, accept: boolean, key: string) =>
  unwrap<GuestInviteAnswer>(
    await db().rpc('ride_answer_guest_invite', { p_token: token, p_accept: accept, p_key: key }),
  );
