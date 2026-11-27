import { config, must, serve, serviceClient } from '../_runtime/supabase.ts';
import { bearerToken, secretMatches } from '../_shared/secrets.ts';

serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!secretMatches(bearerToken(req.headers.get('Authorization')), config.cronSecret)) return new Response(null, { status: 401 });
  const service = serviceClient();
  const files = must(await service.rpc('ride_dossier_expired_files')) as { path: string }[];
  if (files.length) {
    const { error } = await service.storage.from('ride-driver-files').remove(files.map((f) => f.path));
    if (error) return new Response(null, { status: 502 });
  }
  must(await service.rpc('ride_purge_dossier_rows'));
  return Response.json({ purged: files.length });
});
