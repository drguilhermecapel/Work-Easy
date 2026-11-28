import { db, unwrap, unwrapMaybe } from './client';

// DD118 (28/11/2026): who holds a family, company or fleet account, and what happens to it when
// the holder leaves. The server decides everything; the screens only show it and ask.

export type OwnedKind = 'family' | 'organization' | 'fleet';

/** An active admin who may receive the account, earliest first. */
export interface OwnerCandidate {
  member_id: string;
  /** Profile name; null when the profile has no name. */
  name: string | null;
  joined_at: string;
}

/** What `ride_my_accounts()` adds to each row about the holder. */
export interface OwnershipFields {
  /** Only for the holder; empty for everybody else. */
  owner_candidates?: OwnerCandidate[];
  /** Who would receive the account if the holder deleted the profile; null means it would close. */
  successor_id?: string | null;
  /** The account came to the caller in the last 30 days. */
  transferred?: { at: string; reason: 'owner' | 'erasure' } | null;
}

/** The parts of an account row the holder section reads. */
export interface OwnedAccount extends OwnershipFields {
  id: string;
  kind: OwnedKind;
  name: string;
  role: string;
  owner: boolean;
  members: { member_id: string; name: string | null; role: string; status: string }[];
}

/** What deleting the caller's profile does to one account the caller holds. */
export interface ErasurePlanItem {
  id: string;
  kind: OwnedKind;
  name: string;
  outcome: 'transfer' | 'close';
  successor_id: string | null;
  successor_name: string | null;
}

export interface Transfer {
  id: string;
  account_id: string;
  owner_id: string;
  transferred_at: string;
}

export const ownership = {
  /** The holder names an admin (or takes the role back); an admin who is not the holder may step down. */
  setAdmin: async (account: string, member: string, admin: boolean) =>
    unwrap<boolean>(await db().rpc('ride_set_account_admin', { p_account: account, p_member: member, p_admin: admin })),
  /** Idempotent on `key`: a retry with the same key answers the same transfer. */
  transfer: async (account: string, newOwner: string, key: string) =>
    unwrap<Transfer>(await db().rpc('ride_transfer_account', { p_account: account, p_new_owner: newOwner, p_key: key })),
  erasurePlan: async () => unwrapMaybe<ErasurePlanItem[]>(await db().rpc('ride_erasure_account_plan')) ?? [],
};
