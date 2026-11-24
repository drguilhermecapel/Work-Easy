import { authenticate, config, logError, must, now, serve, serviceClient } from '../_runtime/supabase.ts';
import { type DocumentRow, handler, type UploadDeps } from './handler.ts';

const BUCKET = 'provider-documents';
const RECORD_COLUMNS = 'id, step, storage_path, status, rejection_reason, expires_at, created_at';

const deps: UploadDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now,
  logError,
  randomId: () => crypto.randomUUID().slice(0, 8),
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      async providerAccount() {
        // The caller's own rows, read with its JWT (RLS: own rows only)
        const provider = must(await caller.db.from('providers').select('id').eq('id', caller.user.id).maybeSingle());
        const profile = must(await caller.db.from('profiles').select('deleted_at').eq('id', caller.user.id).maybeSingle()) as
          | { deleted_at: string | null }
          | null;
        return {
          hasProviderRow: provider !== null,
          profile: profile === null ? null : { deletedAt: profile.deleted_at },
        };
      },
    };
  },
  storage: {
    async countFiles(folder, limit) {
      const { data, error } = await serviceClient().storage.from(BUCKET).list(folder, { limit });
      if (error) throw error;
      return data?.length ?? 0;
    },
    async put(path, bytes, contentType) {
      const { error } = await serviceClient().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
      if (error) throw error;
    },
    async remove(path) {
      const { error } = await serviceClient().storage.from(BUCKET).remove([path]);
      if (error) throw error;
    },
  },
  records: {
    async insert(row) {
      return must(await serviceClient().from('provider_documents').insert(row).select(RECORD_COLUMNS).single()) as DocumentRow;
    },
  },
};

serve(req => handler(req, deps));
