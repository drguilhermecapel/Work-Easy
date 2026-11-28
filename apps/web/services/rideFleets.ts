import { db, nullable, unwrap, unwrapMaybe } from './client';

// Fleet accounts of the ride module (O17 PAR-508) and the operator calls of stage 5
// (account verification, dependent review, fleet review, invoice closing and disputes).
// Every rule (role, review, validity, isolation between fleets) is decided by the database;
// this file only names the calls and the shapes the screens read.

export type FleetRole = 'admin' | 'manager' | 'fleet_driver';
export type FleetBeneficiary = 'driver' | 'fleet';
export type AssignmentStatus = 'pending_review' | 'approved' | 'ended' | 'rejected';

export interface FleetMember {
  member_id: string;
  /** Profile name; null when the profile is gone. Never an e-mail or a document. */
  name: string | null;
  role: FleetRole;
  status: 'active' | 'removed';
}

/** An adhesion invite as the account lists it: no token, no e-mail. */
export interface FleetInvite {
  id: string;
  role: FleetRole;
  expires_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
}

/**
 * One row of `ride_my_accounts()` with `kind = 'fleet'`. `members` and `invites` come filled
 * only for the roles that manage the account (admin and manager).
 */
export interface FleetAccount {
  id: string;
  kind: 'family' | 'organization' | 'fleet';
  name: string;
  role: FleetRole;
  /** The caller opened the account; the owner cannot be removed. */
  owner: boolean;
  /** The operation has checked the fleet and the check is still valid. */
  verified: boolean;
  verified_until: string | null;
  members: FleetMember[];
  invites: FleetInvite[];
}

/** The token comes once; a replay of the same key answers `token: null`. */
export interface IssuedInvite {
  id: string;
  token: string | null;
  expires_at: string;
}

export interface FleetVehicle {
  id: string;
  /** The same identifier the driver's vehicle record carries at the operation. */
  vehicle_identifier: string;
  category: string;
  document_ref: string;
  insurance_ref: string;
  inspection_ref: string;
  /** Plain dates, "YYYY-MM-DD". */
  vehicle_until: string;
  insurance_until: string;
  inspection_until: string;
  status: string;
}

export interface FleetAssignment {
  id: string;
  vehicle_id: string;
  driver_id: string;
  driver_name: string | null;
  cession_ref: string;
  beneficiary: FleetBeneficiary;
  from: string;
  until: string;
  status: AssignmentStatus;
}

/** A leg driven with a vehicle of this fleet. Never a route, a place or a passenger. */
export interface FleetLeg {
  /** Local date of the leg (São Paulo), "YYYY-MM-DD". */
  date: string;
  status: string;
  vehicle_id: string;
  /** Sent only when the contracted beneficiary of the assignment is the fleet. */
  driver_cents: number | null;
}

export interface FleetOverview {
  vehicles: FleetVehicle[];
  assignments: FleetAssignment[];
  legs: FleetLeg[];
}

/** What the vehicle form sends. Saving an identifier the fleet already has renews its documents. */
export interface VehicleInput {
  identifier: string;
  category: string;
  document: string;
  insurance: string;
  inspection: string;
  vehicleUntil: string;
  insuranceUntil: string;
  inspectionUntil: string;
}

export const fleets = {
  /** The fleets the caller belongs to (family and company accounts have their own screens). */
  accounts: async () => {
    const rows = unwrapMaybe<FleetAccount[]>(await db().rpc('ride_my_accounts')) ?? [];
    return rows
      .filter((account) => account.kind === 'fleet')
      .map((account) => ({ ...account, members: account.members ?? [], invites: account.invites ?? [] }));
  },
  create: async (name: string, key: string) =>
    unwrap<string>(await db().rpc('ride_create_fleet', { p_name: name, p_key: key })),
  inviteMember: async (account: string, email: string, role: FleetRole, minutes: number, key: string) =>
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
  /** An admin removes someone else; any other member may remove themselves. False when already removed. */
  removeMember: async (account: string, member: string, key: string) =>
    unwrap<boolean>(await db().rpc('ride_remove_member', { p_account: account, p_member: member, p_key: key })),
  saveVehicle: async (account: string, vehicle: VehicleInput) =>
    unwrap<string>(
      await db().rpc('ride_fleet_save_vehicle', {
        p_account: account,
        p_identifier: vehicle.identifier,
        p_category: vehicle.category,
        p_document: vehicle.document,
        p_insurance: vehicle.insurance,
        p_inspection: vehicle.inspection,
        p_vehicle_until: vehicle.vehicleUntil,
        p_insurance_until: vehicle.insuranceUntil,
        p_inspection_until: vehicle.inspectionUntil,
      }),
    ),
  /** The assignment starts in review: the driver gets no offers with this vehicle until the operation decides. */
  assign: async (
    vehicle: string,
    driver: string,
    cession: string,
    beneficiary: FleetBeneficiary,
    from: string,
    until: string,
    key: string,
  ) =>
    unwrap<string>(
      await db().rpc('ride_fleet_assign', {
        p_vehicle: vehicle,
        p_driver: driver,
        p_cession: cession,
        p_beneficiary: beneficiary,
        p_from: from,
        p_until: until,
        p_key: key,
      }),
    ),
  /** Answers nothing the screen reads; a refusal arrives as an error. */
  endAssignment: async (assignment: string, key: string) => {
    unwrapMaybe<unknown>(await db().rpc('ride_fleet_end_assignment', { p_assignment: assignment, p_key: key }));
  },
  /** `month` is the first day of the month, "YYYY-MM-01". */
  overview: async (account: string, month: string) => {
    const data = unwrap<Partial<FleetOverview>>(
      await db().rpc('ride_fleet_overview', { p_account: account, p_month: month }),
    );
    return { vehicles: data.vehicles ?? [], assignments: data.assignments ?? [], legs: data.legs ?? [] };
  },
};

/**
 * Operator calls of stage 5. Each one is refused by the database for anyone who is not an
 * administrator of the operation, whatever this screen shows.
 */
export const partiesAdmin = {
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
  reviewDependent: async (dependent: string, approve: boolean, evidence: string, until: string | null) => {
    unwrapMaybe<unknown>(
      await db().rpc('admin_review_dependent', {
        p_dependent: dependent,
        p_approve: approve,
        p_evidence: evidence,
        p_until: nullable(until)!,
      }),
    );
  },
  reviewAssignment: async (assignment: string, approve: boolean, reference: string) => {
    unwrapMaybe<unknown>(
      await db().rpc('admin_review_fleet_assignment', {
        p_assignment: assignment,
        p_approve: approve,
        p_reference: reference,
      }),
    );
  },
  /** `month` is "YYYY-MM-01". Closing the same month again answers the same invoice. */
  closeInvoice: async (account: string, month: string, key: string) =>
    unwrap<string>(await db().rpc('admin_close_ride_invoice', { p_account: account, p_month: month, p_key: key })),
  /** Answers the status the dispute ended in. */
  decideDispute: async (dispute: string, accept: boolean, reason: string) =>
    unwrap<string>(
      await db().rpc('admin_decide_invoice_dispute', { p_dispute: dispute, p_accept: accept, p_reason: reason }),
    ),
};
