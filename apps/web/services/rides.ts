import type { Json } from '../lib/database.types';
import { db, unwrap } from './client';

export type RidePayer = 'passenger' | 'client' | 'provider';
export type DriverAction = 'arriving' | 'boarded' | 'completed' | 'cancelled' | 'unknown';

export interface RideLegInput {
  origin: string;
  destination: string;
  payer: RidePayer;
  pickup_at?: string;
  replaces?: string;
  route_id?: string;
  next_booking_id?: string;
  extras?: string[];
}

export interface PricedLeg extends RideLegInput {
  seq: number;
  duration_minutes?: number;
  approach_minutes?: number;
  eta_observed_at?: string;
  ride_class?: string;
  meters?: number;
  fare_cents: number | null;
  fee_cents: number | null;
  driver_cents: number | null;
  extras_cents: number | null;
  limit_cents: number | null;
}

export interface RideLeg extends PricedLeg {
  id: string;
  status: string;
  driver_id: string | null;
  can_cancel: boolean;
  dispatch_state?: string;
  can_review_no_show?: boolean;
  pickup_estimate?: string | null;
  can_requote?: boolean;
  can_view_driver_identity?: boolean;
}

export interface RideQuote {
  id: string;
  booking_id: string | null;
  expires_at: string;
  total_cents: number;
  status: string;
  legs: PricedLeg[];
  accepted_by_me: boolean;
  required_from_me: boolean;
}

export interface Ride {
  id: string;
  in_my_journeys?: boolean;
  kind: string;
  status: string;
  scheduled_at: string | null;
  booking_id: string | null;
  legs: RideLeg[];
}

export interface DriverShift {
  id: string;
  area: string;
  starts_at: string;
  ends_at: string;
}

export interface DriverProfile {
  shifts?: DriverShift[];
  status: string;
  vehicle: string;
  valid_until: string | null;
  online: boolean;
}

export interface RideDashboard {
  enabled: boolean;
  quote_enabled: boolean;
  dispatch_enabled: boolean;
  dispatch_waves?: boolean;
  external_navigation?: boolean;
  simulation: boolean;
  areas: string[];
  extra_options?: { code: string; label: string; cents: number }[];
  driver: DriverProfile | null;
  rides: Ride[];
  quotes: RideQuote[];
  reviews: { driver_id: string; vehicle: string; status: string; valid_until: string | null }[];
  offers: { leg_id: string; origin: string; destination: string; pickup_at: string | null; driver_cents: number; approach_minutes?: number | null; approach_meters?: number; expires_at?: string; trip_minutes?: number; trip_meters?: number; cost_cents?: number | null; scheduled?: boolean }[];
}

export const getRideDashboard = async () => unwrap<RideDashboard>(await db().rpc('ride_dashboard'));

export const quoteRide = async (key: string, booking: string | null, scheduledAt: string | null, legs: RideLegInput[]) => {
  // These SQL parameters accept JSON null via PostgREST, which emits non-null scalar argument types.
  const result = await db().rpc('ride_quote', {
    p_key: key,
    p_booking: booking as string,
    p_scheduled_at: scheduledAt as string,
    p_legs: legs.map(leg => ({ ...leg })) satisfies Json,
  });
  return unwrap<Pick<RideQuote, 'id' | 'expires_at' | 'total_cents' | 'legs'>>(result);
};

export const consentToRide = async (id: string, accept: boolean) =>
  unwrap<{ ride_id: string | null; status: string }>(await db().rpc('ride_consent', { p_quote: id, p_accept: accept }));

export const applyDriver = async (vehicle: string) =>
  unwrap(await db().rpc('ride_apply_driver', { p_vehicle: vehicle }));

export const reviewDriver = async (driverId: string, approve: boolean, validUntil: string | null) =>
  unwrap(await db().rpc('ride_review_driver', { p_driver: driverId, p_approve: approve, p_valid_until: validUntil as string }));

export const setDriverOnline = async (online: boolean) =>
  unwrap(await db().rpc('ride_set_online', { p_online: online }));

export const acceptRideOffer = async (legId: string, key: string) =>
  unwrap(await db().rpc('ride_accept_offer', { p_leg: legId, p_key: key }));

export const declineRideOffer = async (legId: string, key: string) =>
  unwrap(await db().rpc('ride_decline_offer', { p_leg: legId, p_key: key }));

export const transitionRide = async (legId: string, to: DriverAction, key: string) =>
  unwrap(await db().rpc('ride_transition', { p_leg: legId, p_to: to, p_key: key }));

export const resolveRide = async (legId: string, to: 'cancelled' | 'completed', key: string) =>
  unwrap(await db().rpc('ride_resolve', { p_leg: legId, p_to: to, p_key: key }));

export const resolveCompletedRide = async (legId:string, key:string, evidenceRef:string, boardedAt:string, endedAt:string) =>
  unwrap(await db().rpc('ride_resolve_with_evidence',{
    p_leg:legId, p_key:key, p_evidence_ref:evidenceRef, p_boarded_at:boardedAt, p_ended_at:endedAt,
  }));


export const configureDriverShift = async (area: string, from: string, until: string) =>
  unwrap(await db().rpc('ride_configure_shift', { p_area: area, p_from: from, p_until: until }));

export const removeDriverShift = async (id: string) =>
  unwrap(await db().rpc('ride_remove_shift', { p_shift: id }));
