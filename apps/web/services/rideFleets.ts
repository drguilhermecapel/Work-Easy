import { db, unwrap, unwrapMaybe } from './client';

// Fleet accounts of the ride module (O17 PAR-508). The operator calls of stage 5 are in
// services/ridePartiesAdmin.ts.
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
  /** A retired vehicle gives no offers; saving its documents again reactivates it. */
  status: 'active' | 'retired';
  /** One of the three dates is behind today (São Paulo). */
  expired: boolean;
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
  account_id: string;
  month: string;
  vehicles: FleetVehicle[];
  /** The 300 most recent cessions, newest first, whatever the month. */
  assignments: FleetAssignment[];
  /** Legs of the month taken with a vehicle of the fleet. */
  legs: FleetLeg[];
}

/** A cession as the driver it names reads it. */
export interface DriverCession {
  id: string;
  account_id: string;
  account_name: string;
  vehicle_identifier: string;
  category: string;
  cession_ref: string;
  beneficiary: FleetBeneficiary;
  from: string;
  until: string;
  status: AssignmentStatus;
  created_at: string;
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
  /** True when the cession ended now (or on a replay of the same key); false when it was already over. */
  endAssignment: async (assignment: string, key: string) =>
    unwrap<boolean>(await db().rpc('ride_fleet_end_assignment', { p_assignment: assignment, p_key: key })),
  /** `month` is the first day of the month, "YYYY-MM-01". For who manages the fleet; a driver is refused. */
  overview: async (account: string, month: string) =>
    unwrap<FleetOverview>(await db().rpc('ride_fleet_overview', { p_account: account, p_month: month })),
  /** Every cession that names the caller as driver, in any fleet, oldest first. */
  myCessions: async () => unwrapMaybe<DriverCession[]>(await db().rpc('ride_my_cessions')) ?? [],
};
