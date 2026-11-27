import { authenticate, config, must, serve, serviceClient } from '../_runtime/supabase.ts';
import { errors, readJson, route } from '../_shared/http.ts';
import { isUuid } from '../_shared/secrets.ts';
import { readDriverFile } from './upload.ts';

const BUCKET = 'ride-driver-files';
serve((req) =>
  route(req, { methods: ['POST'], siteUrl: config.siteUrl, allowDevOrigins: config.allowDevOrigins }, async () => {
    const caller = await authenticate(req);
    if (!caller) throw errors.unauthorized();
    const bucket = serviceClient().storage.from(BUCKET);
    if (req.headers.get('content-type')?.startsWith('application/json')) {
      const args = (await readJson(req, 2048)) as { file?: unknown; leg?: unknown } | null;
      if (typeof args?.file !== 'string' || !isUuid(args.file) || (args.leg != null && (typeof args.leg !== 'string' || !isUuid(args.leg))))
        throw errors.invalidInput(['Identificador inválido.']);
      const path = must(await caller.db.rpc('ride_dossier_file_path', { p_file: args.file, p_leg: args.leg ?? null }));
      if (typeof path !== 'string') throw errors.notAllowed();
      const { data, error } = await bucket.createSignedUrl(path, 120);
      if (error) throw errors.upstream('Não foi possível abrir o arquivo.');
      // Hosted and local Edge runtimes can use an internal gateway host. The
      // browser already knows the public origin for this same Supabase project.
      const signed = new URL(data.signedUrl);
      return { data: { path: signed.pathname + signed.search } };
    }
    const dossier = must(await caller.db.rpc('ride_dossier_upload_target'));
    if (typeof dossier !== 'string') throw errors.notAllowed();
    const { kind, mime, extension, bytes } = await readDriverFile(req);
    const path = `${caller.user.id}/${dossier}/${kind}-${crypto.randomUUID()}.${extension}`;
    const { error } = await bucket.upload(path, bytes, { contentType: mime, upsert: false, cacheControl: '0' });
    if (error) throw errors.upstream('Não foi possível guardar o documento.');
    // A lost DB reply may follow a successful attachment. Leave uncertain objects to the
    // retention job, which consults the committed record before removing anything.
    const file = must(
      await serviceClient().rpc('ride_dossier_attach', { p_driver: caller.user.id, p_dossier: dossier, p_kind: kind, p_path: path }),
    );
    return { data: { id: file } };
  }),
);
