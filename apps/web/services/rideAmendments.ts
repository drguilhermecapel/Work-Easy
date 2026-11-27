import { db, unwrap } from './client';
import { prepareRoute, type RidePoint } from './rideRoutes';
import { measureAutomaticRoute, setRouteWaypoints } from './rideLocalMap';

export interface RideAmendment {
  id: string;
  status: 'pending' | 'applied' | 'declined' | 'superseded' | 'expired';
  expires_at: string;
  pickup_at: string;
  created_at: string;
  previous_destination: string | null;
  is_current: boolean;
  consumed_variable_cents: number | null;
  old_cents: number | null;
  fare_cents: number | null;
  driver_cents: number | null;
  accepted_by_me: boolean;
  may_decide: boolean;
  remaining_minutes: number | null;
  destination: string | null;
  stops: string[] | null;
}
export interface AmendmentState {
  status: string;
  can_propose: boolean;
  can_reschedule: boolean;
  anchor: RidePoint | null;
  origin_area: string | null;
  destination_area: string | null;
  current_cents: number | null;
  changes: RideAmendment[];
}

export async function amendmentState(legId: string) {
  return unwrap<AmendmentState>(await db().rpc('ride_amendment_state', { p_leg: legId }));
}

export async function proposeAmendment(input: {
  leg: string; key: string; fromArea: string; toArea: string; anchor: RidePoint;
  stops: RidePoint[]; destination: RidePoint; pickup?: string; instruction: string;
}, prepared?: string) {
  const route = prepared || (await prepareRoute(input.key, null, input.fromArea, input.toArea, input.anchor, input.destination, null)).id;
  if (!prepared) {
    // Keep the route and its exact waypoint version fixed across uncertain responses.
    await setRouteWaypoints(route, input.stops, input.instruction);
    await measureAutomaticRoute(route);
  }
  return unwrap<{ id: string; status: string }>(await db().rpc('ride_propose_amendment', {
    p_leg: input.leg, p_route: route, p_key: input.key, p_pickup_at: input.pickup,
  }));
}

export async function decideAmendment(change: string, accept: boolean) {
  return unwrap<{ status: RideAmendment['status'] }>(await db().rpc('ride_decide_amendment', { p_change: change, p_accept: accept }));
}
