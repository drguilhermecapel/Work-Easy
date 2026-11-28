import { db, nullable, unwrap } from './client';

// Operator calls of O17 stage 5 (PAR-502..508): what awaits the operation, account verification,
// dependent and cession review, voucher programs, driver clearances, invoice closing and
// contestations. The database refuses every one of them to anyone who is not an administrator
// of the operation, and refuses a reviewer who belongs to the account under review.

export interface QueueAccount {
  id: string;
  kind: 'organization' | 'fleet';
  name: string;
  /** Never checked, check ended in the last 30 days (or withdrawn), or ending in the next 30 days. */
  state: 'pending' | 'lapsed' | 'expiring';
  verified_until: string | null;
  created_at: string;
}
/** About a minor only the label and the age band leave the record; each reading is logged. */
export interface QueueDependent {
  id: string;
  label: string;
  age_band: '13-15' | '16-17';
  requested_at: string;
}
export interface QueueCession {
  id: string;
  fleet_name: string;
  vehicle_identifier: string;
  driver_label: string | null;
  from: string;
  until: string;
}
export interface QueueDispute {
  id: string;
  account_name: string;
  /** First day of the invoice month, "YYYY-MM-01". */
  month: string;
  kind: string;
  cents: number;
  /** Written by a manager of the company, up to 280 characters. */
  reason: string;
  raised_at: string;
}
export interface QueueInvoice {
  account_id: string;
  account_name: string;
  /** Ended months a closing would bill now, oldest first ("YYYY-MM-01"). Months close in order. */
  months: string[];
}
export interface PartyQueue {
  accounts: QueueAccount[];
  dependents: QueueDependent[];
  cessions: QueueCession[];
  disputes: QueueDispute[];
  invoices: QueueInvoice[];
}

export interface AdminProgram {
  id: string;
  label: string;
  enabled: boolean;
  budget_cents: number;
  committed_cents: number;
  ride_value_cents: number;
  member_limit_cents: number | null;
  areas: string[];
  classes: string[];
  group_tag: string | null;
  valid_from: string;
  valid_until: string;
  excess_payer: 'rider' | 'none';
  requires_approval: boolean;
  funding_ref: string;
  evidence_ref: string;
  created_at: string;
}
export interface AdminOrganization {
  id: string;
  name: string;
  verified: boolean;
  verified_until: string | null;
  created_at: string;
  programs: AdminProgram[];
}
/** What the program form sends. `id` is the client key of a new program or the id of the one being changed. */
export interface ProgramInput {
  id: string;
  account: string;
  label: string;
  budgetCents: number;
  rideValueCents: number;
  memberLimitCents: number | null;
  areas: string[];
  classes: string[];
  group: string | null;
  from: string;
  until: string;
  excessPayer: 'rider' | 'none';
  requiresApproval: boolean;
  fundingRef: string;
  evidenceRef: string;
  enabled: boolean;
}

/** Cession as the reviewer reads it, with the references the fleet declared. */
export interface CessionDossier {
  id: string;
  account_verified: boolean;
  category: string;
  document_ref: string;
  insurance_ref: string;
  inspection_ref: string;
  vehicle_until: string;
  insurance_until: string;
  inspection_until: string;
  /** The identifier equals the one of the driver's own vehicle record at the operation. */
  driver_vehicle_match: boolean;
  cession_ref: string;
  beneficiary: 'driver' | 'fleet';
  status: string;
}

export const partiesAdmin = {
  /** One reading of everything that awaits the operation. It writes the dependents' access log. */
  queue: async () => unwrap<PartyQueue>(await db().rpc('admin_ride_party_queue')),
  /** Active companies with their programs and what each one has already committed. */
  organizations: async () => unwrap<AdminOrganization[]>(await db().rpc('admin_ride_organizations')),
  /** The cessions in review and those decided in the last 7 days, with the declared references. */
  cessionDossiers: async () => unwrap<CessionDossier[]>(await db().rpc('admin_ride_fleet_assignments')),
  /** `until` null withdraws the verification. True while the account stays verified. */
  verifyAccount: async (account: string, reference: string, until: string | null) =>
    unwrap<boolean>(
      await db().rpc('admin_verify_ride_account', {
        p_account: account,
        p_reference: reference,
        p_until: nullable(until)!,
      }),
    ),
  /** `until` is a plain date and goes only with an approval. The review is written to the access log. */
  reviewDependent: async (dependent: string, approve: boolean, evidence: string, until: string | null) =>
    unwrap<boolean>(
      await db().rpc('admin_review_dependent', {
        p_dependent: dependent,
        p_approve: approve,
        p_evidence: evidence,
        p_until: nullable(until)!,
      }),
    ),
  reviewAssignment: async (assignment: string, approve: boolean, reference: string) =>
    unwrap<boolean>(
      await db().rpc('admin_review_fleet_assignment', {
        p_assignment: assignment,
        p_approve: approve,
        p_reference: reference,
      }),
    ),
  /** `until` null withdraws the clearance. True while the driver stays cleared. */
  setDriverClearance: async (driver: string, evidence: string, until: string | null) =>
    unwrap<boolean>(
      await db().rpc('admin_set_minor_driver_clearance', {
        p_driver: driver,
        p_evidence: evidence,
        p_until: nullable(until)!,
      }),
    ),
  /** Creates the program or changes the one with this id; answers the id. */
  saveProgram: async (program: ProgramInput) =>
    unwrap<string>(
      await db().rpc('admin_save_ride_voucher_program', {
        p_id: program.id,
        p_account: program.account,
        p_label: program.label,
        p_budget: program.budgetCents,
        p_ride_value: program.rideValueCents,
        p_member_limit: nullable(program.memberLimitCents)!,
        p_areas: program.areas,
        p_classes: program.classes,
        p_group: nullable(program.group)!,
        p_from: program.from,
        p_until: program.until,
        p_excess_payer: program.excessPayer,
        p_requires_approval: program.requiresApproval,
        p_funding_ref: program.fundingRef,
        p_evidence_ref: program.evidenceRef,
        p_enabled: program.enabled,
      }),
    ),
  /** `month` is "YYYY-MM-01" of an ended month. Closing the same month again answers the same invoice. */
  closeInvoice: async (account: string, month: string, key: string) =>
    unwrap<string>(await db().rpc('admin_close_ride_invoice', { p_account: account, p_month: month, p_key: key })),
  /** Answers the status the contestation ended in. */
  decideDispute: async (dispute: string, accept: boolean, reason: string) =>
    unwrap<'accepted' | 'rejected'>(
      await db().rpc('admin_decide_invoice_dispute', { p_dispute: dispute, p_accept: accept, p_reason: reason }),
    ),
};
