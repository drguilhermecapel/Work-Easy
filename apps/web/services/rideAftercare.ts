import { toAppError } from '../lib/errors';
import { db, unwrap } from './client';

export interface ReceiptJourney {
  origin: string;
  destination: string;
  origin_point?: { lat: number; lng: number } | null;
  destination_point?: { lat: number; lng: number } | null;
  driver_name: string | null;
  driver_number: string | null;
  vehicle_category: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  boarded_at: string | null;
  ended_at: string;
  meters: number | null;
  quoted_meters: number | null;
  quoted_minutes: number;
  points: [number, number][];
}

export interface ReceiptMoney {
  fare_cents: number;
  extras_cents: number;
  reversed_cents: number;
  final_cents: number;
  paid_cents: number;
  due_cents?: number;
  disputed_cents?: number;
  pending?: boolean;
  commission_cents?: number;
  driver_cents?: number;
}

export interface RideReceipt {
  id: string;
  issued_at: string;
  simulation: boolean;
  role: 'passenger' | 'payer' | 'driver';
  journey?: ReceiptJourney;
  money: ReceiptMoney | null;
  /** The passenger of a leg somebody else pays (sponsor, family, companion): no value is sent. */
  paid_by_other?: boolean;
}

export interface AftercareResult {
  can_rate: boolean;
  stars: number | null;
  document: RideReceipt | null;
}

export async function getRideAftercare(legId: string) {
  return unwrap<AftercareResult>(await db().rpc('ride_aftercare', { p_leg: legId }));
}

export async function rateRide(legId: string, stars: number) {
  const { error } = await db().rpc('ride_rate', { p_leg: legId, p_stars: stars });
  if (error) throw toAppError(error);
}

export async function openRideHelp(legId: string, reason: string) {
  return unwrap<string>(await db().rpc('ride_open_help', { p_leg: legId, p_reason: reason }));
}
