import { errors, readJson, route, type RouteOptions } from '../_shared/http.ts';

import { measureRideRoad, type Coordinate, type RouteMeasurement } from '../_shared/ride-osrm.ts';
type Input = { verified: true } | { version: number; coordinates: Coordinate[] };
interface Deps {
  cors: Pick<RouteOptions, 'siteUrl' | 'allowDevOrigins'>;
  authenticate(req: Request): Promise<string | null>;
  getInput(id: string, user: string): Promise<Input>;
  commit(id: string, user: string, version: number, result: RouteMeasurement): Promise<void>;
  osrmBase?: string;
  fetcher: typeof fetch;
}

/** Uses the operator's configured OSRM process. Coordinates come exclusively
 * from the authorized private case. Its graph estimates do not contain traffic. */
export function routeMeasure(req: Request, deps: Deps): Promise<Response> {
  return route(req, { methods: ['POST'], ...deps.cors }, async () => {
    const user = await deps.authenticate(req);
    if (!user) throw errors.unauthorized();
    const body = await readJson(req, 512);
    if (
      !body ||
      typeof body !== 'object' ||
      !('route_id' in body) ||
      typeof body.route_id !== 'string' ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.route_id)
    )
      throw errors.invalidInput(['route_id']);
    const id = body.route_id;
    const input = await deps.getInput(id, user);
    if ('verified' in input) return { data: { verified: true } };
    if (!deps.osrmBase) throw errors.conflict('route_unavailable', 'Use a medição assistida deste trajeto.');
    const measurement = await measureRideRoad(deps.osrmBase, input.coordinates, deps.fetcher);
    await deps.commit(id, user, input.version, measurement);
    return { data: { verified: true } };
  });
}
