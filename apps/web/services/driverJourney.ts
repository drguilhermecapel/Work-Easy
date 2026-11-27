import { db, invokeFunction, unwrap } from './client';
import { supabase } from '../lib/supabase';
import type { RidePoint } from './rideRoutes';

interface Terminal {
  id: string;
  name: string;
  instruction: string;
  reference: string;
  lat: number;
  lng: number;
  radius_m: number;
  until: string | null;
  position: number | null;
}
export interface DriverPreferences {
  destination: string | null;
  arrive_by: string | null;
  cost_per_km: number | null;
  terminals: Terminal[];
}
export interface Opportunity {
  id: string;
  origin: string;
  destination: string;
  pickup_at: string;
  driver_cents: number;
  interested: boolean;
  scheduled: boolean;
}
export interface NavigationContext {
  phase: 'scheduled' | 'accepted' | 'arriving' | 'boarded';
  index: number;
  simulation: boolean;
  target: RidePoint | null;
  stops: RidePoint[];
  origin: RidePoint | null;
  destination: RidePoint | null;
  instruction: string | null;
  geometry: { coordinates: [number, number][] } | null;
  external_allowed: boolean;
  pickup_deviation_seconds: number | null;
}
interface RoadResult {
  meters: number;
  minutes: number;
  geometry: { coordinates: [number, number][] };
}

export async function driverWorkspace() {
  const [settings, opportunities] = await Promise.all([
    db().rpc('driver_preferences'),
    db().rpc('driver_opportunities'),
  ]);
  return {
    preferences: unwrap<DriverPreferences>(settings),
    opportunities: unwrap<Opportunity[]>(opportunities),
  };
}
export async function saveDriverPreferences(
  destination: string | null,
  arriveBy: string | null,
  cost: number | null,
) {
  const { error } = await db().rpc('driver_save_preferences', {
    p_destination: destination as string,
    p_arrive_by: arriveBy as string,
    p_cost_per_km: cost as number,
  });
  if (error) throw error;
}
export async function joinAirport(
  terminal: string,
  join: boolean,
  point?: { lat: number; lng: number; accuracy: number },
) {
  const { error } = await db().rpc('driver_airport_queue', {
    p_terminal: terminal,
    p_join: join,
    p_lat: (point?.lat ?? null) as number,
    p_lng: (point?.lng ?? null) as number,
    p_accuracy: (point?.accuracy ?? null) as number,
  });
  if (error) throw error;
}
export async function interestInRide(id: string) {
  const { error } = await db().rpc('ride_register_interest', { p_leg: id });
  if (error) throw error;
}
export async function releaseReservation(leg: string, key: string, noShow = false) {
  const { error } = await db().rpc('driver_release_reservation', {
    p_leg: leg,
    p_key: key,
    p_no_show: noShow,
  });
  if (error) throw error;
}
export const readNavigation = async (leg: string) =>
  unwrap<NavigationContext>(await db().rpc('driver_navigation', { p_leg: leg }));
export const reachWaypoint = async (leg: string, index: number) =>
  unwrap<number>(await db().rpc('driver_reach_waypoint', { p_leg: leg, p_index: index }));
export const recalculateRoad = (leg: string, ctx: NavigationContext, point?: { lat: number; lng: number }) =>
  invokeFunction<RoadResult>('ride-driver-navigation', { leg, phase: ctx.phase, index: ctx.index, ...point });
export async function shareDriverEta(leg: string, minutes: number) {
  const { error } = await db().rpc('ride_report_eta', { p_leg: leg, p_minutes: minutes });
  if (error) throw error;
}
export const devicePoint = () =>
  new Promise<{ lat: number; lng: number; accuracy: number }>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('A localização do aparelho está indisponível.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => reject(new Error('A posição não foi obtida. Confira a permissão de localização do aparelho.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  });
export function watchDriverInbox(driver: string, refresh: () => void) {
  if (!supabase) return () => {};
  const channel = supabase.channel('driver-offers-' + driver)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'ride_driver_inbox',
      filter: 'driver_id=eq.' + driver,
    }, refresh)
    .subscribe();
  return () => {
    void supabase?.removeChannel(channel);
  };
}

export async function decideOffer(leg: string, key: string, expires: string, accept: boolean) {
  return unwrap(
    await db().rpc('driver_decide_offer', { p_leg: leg, p_key: key, p_expires: expires, p_accept: accept }),
  );
}
