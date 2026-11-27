import { db, nullable, unwrap } from './client';

export interface RidePoint {
  label: string;
  lat: number;
  lng: number;
}
export interface RideRouteCase {
  id: string;
  booking_id: string | null;
  status: 'draft' | 'awaiting_review' | 'verified' | 'expired';
  origin_area: string;
  destination_area: string;
  service_endpoint: 'origin' | 'destination' | null;
  origin: RidePoint | null;
  destination: RidePoint | null;
  can_complete: boolean;
  can_claim: boolean;
  can_verify: boolean;
  can_quote: boolean;
  meters: number | null;
  minutes: number | null;
  valid_until: string | null;
}
export async function listRideRouteCases() {
  return unwrap<RideRouteCase[]>(await db().rpc('ride_route_cases'));
}
export async function prepareRoute(
  key: string,
  booking: string | null,
  originArea: string,
  destinationArea: string,
  origin: RidePoint | null,
  destination: RidePoint | null,
  serviceEnd: 'origin' | 'destination' | null,
) {
  return unwrap<{ id: string }>(
    await db().rpc('ride_prepare_route', {
      p_key: key,
      p_booking: nullable(booking) as string,
      p_origin_area: originArea,
      p_destination_area: destinationArea,
      p_origin: origin ? { ...origin } : null,
      p_destination: destination ? { ...destination } : null,
      p_service_endpoint: nullable(serviceEnd) as string,
    }),
  );
}
export async function completeRoute(id: string, origin: RidePoint | null, destination: RidePoint | null) {
  const { error } = await db().rpc('ride_complete_route', {
    p_route: id,
    p_origin: origin ? { ...origin } : null,
    p_destination: destination ? { ...destination } : null,
  });
  if (error) throw error;
}
export async function measureRoute(id: string, meters: number, minutes: number, source: string) {
  const { error } = await db().rpc('ride_verify_route', {
    p_route: id,
    p_meters: meters,
    p_minutes: minutes,
    p_reference: source,
  });
  if (error) throw error;
}
