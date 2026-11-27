import { authenticate, config, serve, serviceClient } from '../_runtime/supabase.ts';
import { errors } from '../_shared/http.ts';
import { routeMeasure } from './handler.ts';
serve((req) =>
  routeMeasure(req, {
    cors: { siteUrl: config.siteUrl, allowDevOrigins: config.allowDevOrigins },
    authenticate: async (request) => (await authenticate(request))?.user.id ?? null,
    osrmBase: Deno.env.get('OSRM_URL'),
    fetcher: fetch,
    getInput: async (id, user) => {
      const { data, error } = await serviceClient().rpc('ride_measure_input', { p_route: id, p_user: user });
      if (error || !data)
        throw errors.conflict('route_unavailable', 'Este trajeto não pode ser medido automaticamente.');
      return data;
    },
    commit: async (id, user, version, measurement) => {
      const { error } = await serviceClient().rpc('ride_measure_commit', {
        p_route: id,
        p_user: user,
        p_version: version,
        p_meters: measurement.meters,
        p_minutes: measurement.minutes,
        p_geometry: measurement.geometry,
      });
      if (error) throw errors.conflict('route_unavailable', 'O trajeto mudou ou venceu. Confira os pontos.');
    },
  }),
);
