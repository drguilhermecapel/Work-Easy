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
  pickup_at?: string | null;
  /** Pickup the shift limit is measured from (the booked one, or the last rebooked one). */
  original_pickup?: string | null;
  /** Airport of the reserve; null for a reserve that is not an airport trip. */
  airport?: string | null;
  terminal: string | null;
  /** Only the passenger reads the flight reference; null for anybody else. */
  flight_ref: string | null;
  /** Largest change of pickup time, from the original pickup, the policy of the area accepts. */
  max_shift_minutes: number | null;
  /** The caller is the passenger and the leg still accepts a new pickup time. */
  can_shift?: boolean;
  /** The caller is the passenger and the reserve waits for a contingency choice. */
  can_decide?: boolean;
  /** The latest request to move the pickup, if any. */
  shift: ReserveShift | null;
}
export interface ShiftResult {
  id: string;
  /** "applied" when no driver was assigned; "proposed" when the assigned driver has to answer. */
  state: 'applied' | 'proposed';
  /** State now (a replay may find the proposal already decided). */
  current?: ReserveShift['state'];
  new_pickup: string;
  expires_at: string | null;
  replayed?: boolean;
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
    unwrap<{ state: ReserveState; choice: ContingencyChoice; pickup_at: string; replayed?: boolean }>(
      await db().rpc('ride_reserve_contingency', {
        p_leg: leg,
        p_choice: choice,
        p_new_pickup: nullable(newPickup)!,
        p_key: key,
      }),
    ),
  /** Passenger only, airport reserves only; an empty reference clears it. */
  flight: async (leg: string, flightRef: string) =>
    unwrap<{ flight_ref: string | null; terminal: string | null }>(
      await db().rpc('ride_reserve_flight', { p_leg: leg, p_flight_ref: flightRef }),
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

// --- Operations registry (DD125): what the operation provisions for these modes ---
// Finance administrators only. A save takes the row's id (the client key of a new row) or its natural
// key, so a retry with the same input answers the same row. In live nothing is enabled without a real
// evidence reference and a validity date at most 24 months ahead; `valid_until` null means open-ended (rehearsal only).

export interface RegistryList {
  simulation: boolean;
  /** Areas of the market of this environment, for the forms. */
  areas: string[];
}
export interface RegistryLine {
  id: string;
  origin_area: string;
  destination_area: string;
  operator_ref: string;
  seat_cents: number;
  minutes: number;
  evidence_ref: string;
  valid_until: string | null;
  enabled: boolean;
  open_departures: number;
  next_departure: string | null;
}
export interface LineInput {
  id: string;
  origin: string;
  destination: string;
  operatorRef: string;
  seatCents: number;
  minutes: number;
  evidenceRef: string;
  validUntil: string;
  enabled: boolean;
}
export interface RegistryDeparture {
  id: string;
  line_id: string;
  departs_at: string;
  seats_total: number;
  seats_confirmed: number;
  state: ShuttleDeparture['state'];
  closed_at: string | null;
  driver_id: string | null;
  driver_label: string | null;
  /** The designated registration holds on the day of the departure. */
  driver_valid: boolean;
}
/** Approved drivers valid today with an inspected capacity; the server checks the day and the seats again. */
export interface RegistryDriver {
  id: string;
  label: string | null;
  vehicle: string;
  seats: number;
  capacity_until: string;
  valid_until: string;
}
export interface LineDepartures {
  line_id: string;
  minutes: number;
  departures: RegistryDeparture[];
  drivers: RegistryDriver[];
}
export interface RegistryTariff {
  id: string;
  area: string;
  code: string;
  minutes: number;
  included_km: number;
  block_cents: number;
  extra_15min_cents: number;
  extra_km_cents: number;
  evidence_ref: string;
  valid_until: string | null;
  /** Legs already sold with this block: its area and code no longer change. */
  legs: number;
}
export type TariffInput = Omit<RegistryTariff, 'valid_until' | 'legs'> & { valid_until: string };
export interface RegistryCorridor {
  origin: string;
  destination: string;
  origin_jurisdiction: string;
  destination_jurisdiction: string;
  authority_ref: string;
  coverage_ref: string;
  empty_return_cents: number;
  return_minutes: number;
  valid_until: string | null;
  enabled: boolean;
}
export type CorridorInput = Omit<RegistryCorridor, 'valid_until'> & { valid_until: string };
export interface RegistryPolicy {
  area: string;
  min_lead_minutes: number;
  confirm_lead_minutes: number;
  max_shift_minutes: number;
  evidence_ref: string;
  valid_until: string | null;
  enabled: boolean;
}
export type PolicyInput = Omit<RegistryPolicy, 'valid_until'> & { valid_until: string };

export const rideRegistry = {
  lines: async () => unwrap<RegistryList & { lines: RegistryLine[] }>(await db().rpc('admin_ride_shuttle_lines')),
  saveLine: async (line: LineInput) =>
    unwrap<RegistryLine>(
      await db().rpc('admin_save_ride_shuttle_line', {
        p_id: line.id,
        p_origin: line.origin,
        p_destination: line.destination,
        p_operator_ref: line.operatorRef,
        p_seat_cents: line.seatCents,
        p_minutes: line.minutes,
        p_evidence_ref: line.evidenceRef,
        p_valid_until: line.validUntil,
        p_enabled: line.enabled,
      }),
    ),
  departures: async (line: string) =>
    unwrap<LineDepartures>(await db().rpc('admin_ride_shuttle_line_departures', { p_line: line })),
  /** `id` is the client key of a new departure or the id of the one being changed. */
  saveDeparture: async (id: string, line: string, departsAt: string, seats: number) =>
    unwrap<RegistryDeparture>(
      await db().rpc('admin_save_ride_shuttle_departure', {
        p_id: id,
        p_line: line,
        p_departs_at: departsAt,
        p_seats_total: seats,
      }),
    ),
  /** `driver` null withdraws the designation. */
  designate: async (departure: string, driver: string | null) =>
    unwrap<RegistryDeparture>(
      await db().rpc('admin_designate_shuttle_driver', { p_departure: departure, p_driver: nullable(driver)! }),
    ),
  markDeparted: async (departure: string) =>
    unwrap<RegistryDeparture>(await db().rpc('admin_mark_shuttle_departed', { p_departure: departure })),
  tariffs: async () => unwrap<RegistryList & { tariffs: RegistryTariff[] }>(await db().rpc('admin_ride_block_tariffs')),
  saveTariff: async (tariff: TariffInput) =>
    unwrap<RegistryTariff>(
      await db().rpc('admin_save_ride_block_tariff', {
        p_id: tariff.id,
        p_area: tariff.area,
        p_code: tariff.code,
        p_minutes: tariff.minutes,
        p_included_km: tariff.included_km,
        p_block_cents: tariff.block_cents,
        p_extra_15min_cents: tariff.extra_15min_cents,
        p_extra_km_cents: tariff.extra_km_cents,
        p_evidence_ref: tariff.evidence_ref,
        p_valid_until: tariff.valid_until,
      }),
    ),
  corridors: async () =>
    unwrap<RegistryList & { corridors: RegistryCorridor[] }>(await db().rpc('admin_ride_intercity_corridors')),
  /** One corridor per direction, keyed by origin and destination. */
  saveCorridor: async (corridor: CorridorInput) =>
    unwrap<RegistryCorridor>(
      await db().rpc('admin_save_ride_intercity_corridor', {
        p_origin: corridor.origin,
        p_destination: corridor.destination,
        p_origin_jurisdiction: corridor.origin_jurisdiction,
        p_destination_jurisdiction: corridor.destination_jurisdiction,
        p_authority_ref: corridor.authority_ref,
        p_coverage_ref: corridor.coverage_ref,
        p_empty_return_cents: corridor.empty_return_cents,
        p_return_minutes: corridor.return_minutes,
        p_valid_until: corridor.valid_until,
        p_enabled: corridor.enabled,
      }),
    ),
  policies: async () => unwrap<RegistryList & { policies: RegistryPolicy[] }>(await db().rpc('admin_ride_reserve_policies')),
  /** One policy per area. */
  savePolicy: async (policy: PolicyInput) =>
    unwrap<RegistryPolicy>(
      await db().rpc('admin_save_ride_reserve_policy', {
        p_area: policy.area,
        p_min_lead_minutes: policy.min_lead_minutes,
        p_confirm_lead_minutes: policy.confirm_lead_minutes,
        p_max_shift_minutes: policy.max_shift_minutes,
        p_evidence_ref: policy.evidence_ref,
        p_valid_until: policy.valid_until,
        p_enabled: policy.enabled,
      }),
    ),
};
