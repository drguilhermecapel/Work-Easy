import { describe, expect, it, vi } from 'vitest';
import {
  driverNavigation,
  type DriverRouteContext,
} from '../../supabase/functions/ride-driver-navigation/handler.ts';
import { errors } from '../../supabase/functions/_shared/http.ts';
const leg = 'c621ad68-c0b5-4012-8b58-6fd2484c964c';
const target = { lat: -23.62, lng: -46.63 };
const defaultCtx: DriverRouteContext = { phase: 'arriving', index: 0, target, simulation: false };
const request = (args: object) =>
  new Request('https://workeasy.test/navigation', { method: 'POST', body: JSON.stringify(args) });
const make = (ctx = defaultCtx) => ({
  cors: {},
  context: vi.fn(async (): Promise<DriverRouteContext> => ctx),
  osrmBase: 'http://osrm-internal:5000',
  fetcher: vi.fn<typeof fetch>(async () =>
    Response.json({
      code: 'Ok',
      routes: [{
        distance: 422,
        duration: 89,
        geometry: { type: 'LineString', coordinates: [[-46.632, -23.625], [-46.63, -23.62]] },
      }],
    }),
  ),
});
describe('roteamento de motorista', () => {
  it('usa somente a posição indicada e o destino recuperado do servidor, revalidando a atribuição', async () => {
    const deps = make();
    const result = await driverNavigation(
      request({
        leg,
        index: 0,
        phase: 'arriving',
        lat: -23.625,
        lng: -46.632,
        destination: { lat: 0, lng: 0 },
      }),
      deps,
    );
    expect(result.status).toBe(200);
    expect(deps.context).toHaveBeenCalledTimes(2);
    expect(String(deps.fetcher.mock.calls[0][0])).toContain('-46.632000,-23.625000;-46.630000,-23.620000');
  });
  it('um trecho de outro motorista não consulta o roteador', async () => {
    const deps = make();
    deps.context = vi.fn(async () => { throw errors.notAllowed(); });
    expect((await driverNavigation(request({ leg, phase: 'arriving', index: 0 }), deps)).status).toBe(403);
    expect(deps.fetcher).not.toHaveBeenCalled();
  });
  it('ensaio recusa GPS real e troca de estado durante recálculo descarta o resultado', async () => {
    const sim = make({ ...defaultCtx, simulation: true });
    expect(
      (await driverNavigation(request({ leg, phase: 'arriving', index: 0, lat: 0, lng: 0 }), sim)).status,
    ).toBe(400);
    expect(sim.fetcher).not.toHaveBeenCalled();
    const deps = make();
    let count = 0;
    deps.context = vi.fn(async (): Promise<DriverRouteContext> => count++ ? { ...defaultCtx, phase: 'boarded' } : defaultCtx);
    expect(
      (await driverNavigation(request({ leg, phase: 'arriving', index: 0, lat: -23.62, lng: -46.632 }), deps))
        .status,
    ).toBe(409);
  });
});
