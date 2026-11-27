import { db, invokeFunction, nullable, unwrap, unwrapMaybe } from './client';
import type { RidePoint } from './rideRoutes';
export type Geometry = { type: 'LineString'; coordinates: [number, number][] };
export interface RouteDetail {
  geometry: Geometry | null;
  stops: RidePoint[];
  instruction: string | null;
  meters: number | null;
  minutes: number | null;
  source: string | null;
}
export interface ClassOption {
  code: string;
  label: string;
  seats: number;
  tools: boolean;
  accessible: boolean;
  fare_cents: number;
  approach_minutes: number | null;
  duration_minutes: number | null;
  available: boolean;
  observed_at: string;
}
export interface SavedPlace {
  id: string;
  kind: 'favorite' | 'recent';
  point: RidePoint;
}
export interface PassengerUpdates {
  external_available: boolean;
  forward: boolean;
  items: {
    leg_id: string;
    seq: number;
    event: string;
    created_at: string;
    pickup_at: string;
    search_deadline: string;
  }[];
}
export async function searchRidePlaces(search: string, area?: string) {
  return unwrap<(RidePoint & { osm_type: string; osm_id: number; area: string; kind: string })[]>(
    await db().rpc('ride_search_places', { p_search: search, p_area: area || undefined }),
  );
}
export async function listMyRidePlaces() {
  return unwrap<SavedPlace[]>(await db().rpc('ride_my_places'));
}
export async function storeRidePlace(kind: SavedPlace['kind'], point: RidePoint) {
  return unwrap<string>(await db().rpc('ride_store_place', { p_kind: kind, p_point: { ...point } }));
}
export async function forgetRidePlace(id: string) {
  const { error } = await db().rpc('ride_forget_place', { p_id: id });
  if (error) throw error;
}
export async function setRouteWaypoints(routeId: string, stops: RidePoint[], instruction: string) {
  const { error } = await db().rpc('ride_route_waypoints', {
    p_route: routeId,
    p_stops: stops.map((p) => ({ ...p })),
    p_instruction: instruction,
  });
  if (error) throw error;
}
export async function measureAutomaticRoute(routeId: string) {
  return invokeFunction<{ verified: boolean }>('ride-route-measure', { route_id: routeId });
}
export async function getRouteDetail(routeId: string) {
  return unwrapMaybe<RouteDetail>(await db().rpc('ride_route_detail', { p_route: routeId }));
}
export async function getClassOptions(routeId: string, departure: string | null) {
  return unwrap<ClassOption[]>(
    await db().rpc('ride_class_options', { p_route: routeId, p_departure: nullable(departure) }),
  );
}
export async function chooseRideClass(routeId: string, code: string, departure: string | null) {
  const { error } = await db().rpc('ride_choose_class', {
    p_route: routeId,
    p_code: code,
    p_departure: nullable(departure),
  });
  if (error) throw error;
}
export async function getPassengerUpdates(forward?: boolean) {
  return unwrap<PassengerUpdates>(await db().rpc('ride_passenger_updates', { p_forward: forward }));
}
