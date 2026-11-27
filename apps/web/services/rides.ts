import type { Json } from '../lib/database.types';
import { db, unwrap } from './client';

export type RidePayer = 'passenger' | 'client' | 'provider';
export type DriverAction = 'arriving' | 'boarded' | 'completed' | 'cancelled' | 'unknown';

export interface RideLegInput {
  origin: string;
  destination: string;
  payer: RidePayer;
  pickup_at?: string;
}

export interface PricedLeg extends RideLegInput {
  seq: number;
  duration_minutes?: number;
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
  kind: string;
  status: string;
  scheduled_at: string | null;
  booking_id: string | null;
  legs: RideLeg[];
}

export interface DriverProfile {
  status: string;
  vehicle: string;
  valid_until: string | null;
  online: boolean;
}

export interface RideDashboard {
  enabled: boolean;
  quote_enabled: boolean;
  dispatch_enabled: boolean;
  simulation: boolean;
  areas: string[];
  driver: DriverProfile | null;
  rides: Ride[];
  quotes: RideQuote[];
  reviews: { driver_id: string; vehicle: string; status: string; valid_until: string | null }[];
  offers: { leg_id: string; origin: string; destination: string; pickup_at: string | null; driver_cents: number }[];
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
