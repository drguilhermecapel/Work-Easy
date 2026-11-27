import { describe, expect, it, vi } from 'vitest';
import { routeMeasure } from '../../supabase/functions/ride-route-measure/handler.ts';
import { type Coordinate } from '../../supabase/functions/_shared/ride-osrm.ts';

const id = '4fe27344-900f-4d19-88a3-c8719d772942';
const coordinates: Coordinate[] = [
  [-46.6367045, -23.6206567],
  [-46.6355272, -23.6179524],
];
const request = () =>
  new Request('https://workeasy.test/ride-route-measure', {
    method: 'POST',
    body: JSON.stringify({ route_id: id, meters: 1 }),
  });
function dependencies() {
  return {
    cors: {},
    osrmBase: 'http://router.test',
    authenticate: vi.fn(async () => 'signed-user'),
    getInput: vi.fn(async () => ({ version: 4, coordinates })),
    commit: vi.fn(async () => {}),
    fetcher: vi.fn<typeof fetch>(async () =>
      Response.json({
        code: 'Ok',
        routes: [
          {
            distance: 400.6,
            duration: 78.9,
            geometry: { type: 'LineString', coordinates },
          },
        ],
      }),
    ),
  };
}
describe('roteamento por vias', () => {
  it('uses only server coordinates and rounds road distance and minutes before committing', async () => {
    const deps = dependencies();
    const response = await routeMeasure(request(), deps);
    expect(response.status).toBe(200);
    expect(String(deps.fetcher.mock.calls[0][0])).toContain(
      '/route/v1/driving/-46.636705,-23.620657;-46.635527,-23.617952',
    );
    expect(deps.commit).toHaveBeenCalledWith(id, 'signed-user', 4, {
      meters: 401,
      minutes: 2,
      geometry: { type: 'LineString', coordinates },
    });
    expect(await response.json()).toEqual({ ok: true, data: { verified: true } });
  });
  it('keeps human measurement available when OSRM cannot route the pair', async () => {
    const deps = dependencies();
    deps.fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: 'NoRoute', routes: [] }));
    expect((await routeMeasure(request(), deps)).status).toBe(409);
    expect(deps.commit).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated attempts before touching either location or router', async () => {
    const deps = dependencies();
    expect((await routeMeasure(request(), { ...deps, authenticate: async () => null })).status).toBe(401);
    expect(deps.getInput).not.toHaveBeenCalled();
    expect(deps.fetcher).not.toHaveBeenCalled();
  });
  it('replays a completed measurement without another route lookup', async () => {
    const deps = dependencies();
    expect(
      (await routeMeasure(request(), { ...deps, getInput: async () => ({ verified: true }) })).status,
    ).toBe(200);
    expect(deps.fetcher).not.toHaveBeenCalled();
  });
});
