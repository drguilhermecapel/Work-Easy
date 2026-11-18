import { config, logError, must, now, serve, serviceClient } from '../_runtime/supabase.ts';
import { type PurgeCandidate, type PurgeDeps, handler } from './handler.ts';

const DOCUMENTS_BUCKET = 'provider-documents';

const deps: PurgeDeps = {
  now,
  logError,
  cronSecret: config.cronSecret,
  store: {
    async candidates() {
      return (must(await serviceClient().rpc('background_check_purge_candidates')) as PurgeCandidate[] | null) ?? [];
    },
    async removeObject(path) {
      const { error } = await serviceClient().storage.from(DOCUMENTS_BUCKET).remove([path]);
      if (error) throw error;
    },
    async markPurged(id) {
      must(await serviceClient().rpc('mark_background_check_purged', { p_id: id }));
    },
  },
};

serve(req => handler(req, deps));
