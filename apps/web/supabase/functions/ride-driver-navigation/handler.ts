import { errors, readJson, route, type RouteOptions } from '../_shared/http.ts';
import { type Coordinate, measureRideRoad } from '../_shared/ride-osrm.ts';

export interface DriverRouteContext {
  phase: string;
  index: number;
  target?: { lat: number; lng: number };
  simulation: boolean;
}
interface NavigationDeps {
  cors: Pick<RouteOptions, 'siteUrl' | 'allowDevOrigins'>;
  context(request: Request, leg: string): Promise<DriverRouteContext>;
  osrmBase?: string;
  fetcher: typeof fetch;
}

/** Only an assigned driver may request the current target. No GPS is written to the database. */
export function driverNavigation(req: Request, deps: NavigationDeps) {
  return route(req, { methods: ['POST'], ...deps.cors }, async () => {
    const input = await readJson(req, 1024) as {
      leg?: string;
      phase?: string;
      index?: number;
      lat?: number;
      lng?: number;
    };
    if (
      !input || typeof input.leg !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.leg)
    ) throw errors.invalidInput(['leg']);
    const ctx = await deps.context(req, input.leg);
    if (!ctx.target || ctx.phase !== input.phase || ctx.index !== input.index) {
      throw errors.conflict('invalid_transition', 'A etapa mudou. Atualize o trecho.');
    }
    if (!deps.osrmBase) {
      throw errors.conflict('route_unavailable', 'O navegador interno está indisponível neste momento.');
    }
    let start: Coordinate;
    if (ctx.simulation) {
      // A known synthetic position in the local rehearsal graph. Never accept device coordinates in rehearsal.
      if (input.lat != null || input.lng != null) throw errors.invalidInput(['simulation']);
      start = [-46.6414, -23.6186];
    } else {
      if (
        typeof input.lat !== 'number' || typeof input.lng !== 'number' || !Number.isFinite(input.lat) ||
        !Number.isFinite(input.lng) ||
        Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180
      ) throw errors.invalidInput(['position']);
      start = [input.lng, input.lat];
    }
    const road = await measureRideRoad(
      deps.osrmBase,
      [start, [ctx.target.lng, ctx.target.lat]],
      deps.fetcher,
    );
    // Re-read authorization before returning a route after a slow network response.
    const latest = await deps.context(req, input.leg);
    if (
      latest.phase !== ctx.phase || latest.index !== ctx.index || latest.target?.lat !== ctx.target.lat ||
      latest.target?.lng !== ctx.target.lng
    ) {
      throw errors.conflict('invalid_transition', 'A etapa mudou. Atualize o trecho.');
    }
    return { data: road };
  });
}
