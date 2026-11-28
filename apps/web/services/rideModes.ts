import type { Json } from '../lib/database.types';
import type { PricedLeg, RideLegInput, RideQuote } from './rides';
import { db, nullable, unwrap, unwrapMaybe } from './client';

// Reserve, shuttle seats, hourly blocks and intercity trips (O17 stage 6, PAR-604 and PAR-606).
// Shapes of the jsonb answers are stated here; the server stays the authority on every rule.

// --- Reserve (scheduled legs) ---

export type ReserveState = 'awaiting_driver' | 'confirmed' | 'contingency' | 'released';
export type ContingencyChoice = 'keep_searching' | 'rebook' | 'cancel';
export type ShiftReason = 'flight_delay' | 'passenger';
export interface ReserveShift {
  id: string;
  reason: string;
  old_pickup: string;
  new_pickup: string;
  state: 'proposed' | 'applied' | 'declined' | 'expired';
  expires_at: string | null;
}
export interface ReserveTerms {
  state: ReserveState;
  /** A driver must confirm the reservation until this instant. */
  confirm_by: string;
  terminal: string | null;
  flight_ref: string | null;
  /** Largest change of pickup time the policy of the area accepts; null when not published. */
  max_shift_minutes: number | null;
  /** The latest request to move the pickup, if any. */
  shift: ReserveShift | null;
}
export interface ShiftResult {
  id: string;
  /** "applied" when no driver was assigned; "proposed" when the assigned driver has to answer. */
  state: 'applied' | 'proposed';
  new_pickup: string;
  expires_at: string | null;
}

export const rideReserve = {
  /** Null for a leg without reserve terms (not scheduled, or already purged). */
  state: async (leg: string) => unwrapMaybe<ReserveTerms>(await db().rpc('ride_reserve_state', { p_leg: leg })),
  shift: async (leg: string, newPickup: string, reason: ShiftReason, key: string) =>
    unwrap<ShiftResult>(
      await db().rpc('ride_shift_reservation', {
        p_leg: leg,
        p_new_pickup: newPickup,
        p_reason: reason,
        p_key: key,
      }),
    ),
  contingency: async (leg: string, choice: ContingencyChoice, newPickup: string | null, key: string) =>
    unwrap<{ state: ReserveState }>(
      await db().rpc('ride_reserve_contingency', {
        p_leg: leg,
        p_choice: choice,
        p_new_pickup: nullable(newPickup)!,
        p_key: key,
      }),
    ),
  /** Answers the state of the shift after the decision: "applied" keeps the driver on the leg. */
  decideShift: async (shift: string, accept: boolean) =>
    unwrap<string>(await db().rpc('driver_decide_shift', { p_shift: shift, p_accept: accept })),
};

// --- Shuttle seats (a seat ledger; no money is collected for a seat in this stage) ---

export interface ShuttleDeparture {
  id: string;
  departs_at: string;
  seats_total: number;
  seats_left: number;
  state: 'open' | 'departed' | 'cancelled';
}
export interface ShuttleLine {
  id: string;
  origin_area: string;
  destination_area: string;
  /** Price of one seat. */
  seat_cents: number;
  departures: ShuttleDeparture[];
}
export interface ShuttleSeat {
  id: string;
  line_id: string;
  departure_id: string;
  origin_area: string;
  destination_area: string;
  departs_at: string;
  seats: number;
  seat_cents: number;
  state: 'confirmed' | 'cancelled' | 'rebooked' | 'released';
}
export interface ShuttleBoard {
  simulation: boolean;
  lines: ShuttleLine[];
  my_seats: ShuttleSeat[];
}
export interface ShuttleManifest {
  departs_at: string;
  state: ShuttleDeparture['state'];
  seats_total: number;
  seats_confirmed: number;
  /** Number of bookings behind the confirmed seats. Counts only: no passenger data. */
  bookings: number;
}
export interface AdminDeparture {
  id: string;
  origin_area: string;
  destination_area: string;
  departs_at: string;
  seats_total: number;
  seats_confirmed: number;
  state: ShuttleDeparture['state'];
  driver_assigned: boolean;
}
/** What a seat release records. Nothing is collected in this stage, so nothing is due back. */
export interface SeatRelease {
  refund_due_cents?: number;
}

export const rideShuttle = {
  /** Both areas null lists every open line. */
  board: async (origin: string | null, destination: string | null) =>
    unwrap<ShuttleBoard>(
      await db().rpc('ride_shuttle_board', { p_origin: nullable(origin)!, p_destination: nullable(destination)! }),
    ),
  /** `seatCents` is the price of ONE seat as shown; the server refuses a different price. */
  book: async (departure: string, seats: number, seatCents: number, key: string) =>
    unwrap<{ id: string; state: ShuttleSeat['state'] }>(
      await db().rpc('ride_book_shuttle_seat', {
        p_departure: departure,
        p_seats: seats,
        p_cents: seatCents,
        p_key: key,
      }),
    ),
  cancel: async (seat: string, key: string) =>
    unwrap<SeatRelease>(await db().rpc('ride_cancel_shuttle_seat', { p_seat: seat, p_key: key })),
  rebook: async (seat: string, departure: string, key: string) =>
    unwrap<{ id: string }>(
      await db().rpc('ride_rebook_shuttle_seat', { p_seat: seat, p_departure: departure, p_key: key }),
    ),
  manifest: async (departure: string) =>
    unwrap<ShuttleManifest>(await db().rpc('driver_shuttle_manifest', { p_departure: departure })),
  adminDepartures: async () =>
    unwrap<{ simulation: boolean; departures: AdminDeparture[] }>(await db().rpc('admin_shuttle_departures')),
  cancelDeparture: async (departure: string, reason: string, key: string) =>
    unwrap<{ released_seats?: number } & SeatRelease>(
      await db().rpc('admin_cancel_shuttle_departure', { p_departure: departure, p_reason: reason, p_key: key }),
    ),
};

// --- Hourly blocks and intercity trips ---

export interface BlockOption {
  code: string;
  minutes: number;
  included_km: number;
  block_cents: number;
  extra_15min_cents: number;
  extra_km_cents: number;
}
/** A priced leg with the stage 6 components, when the quote has them. */
export interface ModeLeg extends PricedLeg {
  block_cents?: number | null;
  /** Empty return of the driver: inside the fare, shown apart. */
  empty_return_cents?: number | null;
  return_minutes?: number | null;
}
export type ModeQuote = Pick<RideQuote, 'id' | 'expires_at' | 'total_cents'> & { legs: ModeLeg[] };

export interface BlockExtension {
  id: string;
  minutes: number;
  km: number;
  cents: number;
  state: 'pending' | 'applied' | 'declined' | 'expired';
  expires_at: string;
  /** The caller is the payer or the driver of the leg and still has to answer. */
  may_decide: boolean;
  accepted_by_me: boolean;
}
export interface BlockState {
  minutes: number;
  included_km: number;
  extra_15min_cents: number;
  extra_km_cents: number;
  /** Totals of the extensions already applied to the leg. */
  extended_minutes: number;
  extended_km: number;
  extension_cents: number;
  can_propose: boolean;
  extensions: BlockExtension[];
}
export interface Corridor {
  origin: string;
  destination: string;
  origin_jurisdiction: string;
  destination_jurisdiction: string;
  empty_return_cents: number;
  return_minutes: number;
}

export const rideBlocks = {
  options: async (area: string, at: string | null) => {
    const answer = unwrap<BlockOption[] | { blocks: BlockOption[] }>(
      await db().rpc('ride_block_options', { p_area: area, p_at: nullable(at)! }),
    );
    return Array.isArray(answer) ? answer : answer.blocks;
  },
  quote: async (key: string, scheduledAt: string | null, origin: string, destination: string, block: string) =>
    unwrap<ModeQuote>(
      await db().rpc('ride_quote_block', {
        p_key: key,
        p_scheduled_at: nullable(scheduledAt)!,
        p_origin: origin,
        p_destination: destination,
        p_block: block,
      }),
    ),
  /** Null for a leg that is not an hourly block. */
  state: async (leg: string) => unwrapMaybe<BlockState>(await db().rpc('ride_block_state', { p_leg: leg })),
  /** Minutes in multiples of 15. */
  propose: async (leg: string, minutes: number, km: number, key: string) =>
    unwrap<{ id: string; cents: number; expires_at: string }>(
      await db().rpc('ride_propose_extension', { p_leg: leg, p_minutes: minutes, p_km: km, p_key: key }),
    ),
  /** Answers the state of the extension: "applied" once payer and driver both accepted. */
  decide: async (extension: string, accept: boolean) =>
    unwrap<string>(await db().rpc('ride_decide_extension', { p_extension: extension, p_accept: accept })),
};

export const rideIntercity = {
  corridors: async () => {
    const answer = unwrap<Corridor[] | { corridors: Corridor[] }>(await db().rpc('ride_intercity_options'));
    return Array.isArray(answer) ? answer : answer.corridors;
  },
  quote: async (key: string, scheduledAt: string | null, legs: RideLegInput[]) =>
    unwrap<ModeQuote>(
      await db().rpc('ride_quote_intercity', {
        p_key: key,
        p_scheduled_at: nullable(scheduledAt)!,
        p_legs: legs as unknown as Json,
      }),
    ),
};

// --- Driver inbox of the modes ---

export interface DriverShiftTask {
  id: string;
  leg_id: string;
  origin: string;
  destination: string;
  reason: string;
  old_pickup: string;
  new_pickup: string;
  expires_at: string | null;
}
export interface DriverExtensionTask {
  id: string;
  leg_id: string;
  origin: string;
  destination: string;
  minutes: number;
  km: number;
  cents: number;
  /** The driver's part of the extension price, when the server states it. */
  driver_cents: number | null;
  expires_at: string;
}
export interface DriverDeparture {
  id: string;
  origin_area: string;
  destination_area: string;
  departs_at: string;
}
export interface DriverModeInbox {
  shifts: DriverShiftTask[];
  extensions: DriverExtensionTask[];
  departures: DriverDeparture[];
}

export const driverModes = {
  tasks: async () => unwrap<DriverModeInbox>(await db().rpc('driver_mode_tasks')),
};
