import { authenticate, config, serve } from '../_runtime/supabase.ts';
import { errors } from '../_shared/http.ts';
import { driverNavigation, type DriverRouteContext } from './handler.ts';

serve((req) =>
  driverNavigation(req, {
    cors: { siteUrl: config.siteUrl, allowDevOrigins: config.allowDevOrigins },
    osrmBase: Deno.env.get('OSRM_URL'),
    fetcher: fetch,
    async context(request, leg) {
      const caller = await authenticate(request);
      if (!caller) throw errors.unauthorized();
      const { data, error } = await caller.db.rpc('driver_navigation', { p_leg: leg });
      if (error || !data) throw errors.notAllowed('Disponível somente ao motorista atribuído.');
      return data as DriverRouteContext;
    },
  })
);
