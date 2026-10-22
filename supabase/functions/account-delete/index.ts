import { audit, authenticate, config, logError, must, now, serve, serviceClient } from '../_runtime/supabase.ts';
import { type DeleteDeps, handler } from './handler.ts';

const deps: DeleteDeps = {
  siteUrl: config.siteUrl,
  now,
  logError,
  async session(req) {
    const caller = await authenticate(req);
    return caller ? { user: caller.user } : null;
  },
  admin: {
    async createRequest(userId) {
      const row = must(
        await serviceClient()
          .from('data_requests')
          .insert({ user_id: userId, kind: 'delete', status: 'processing' })
          .select('id')
          .single(),
      ) as { id: string };
      return row.id;
    },
    async updateRequest(id, patch) {
      must(await serviceClient().from('data_requests').update(patch).eq('id', id));
    },
    async anonymizeUser(userId) {
      must(await serviceClient().rpc('anonymize_user', { p_user: userId }));
    },
    async deleteAuthUser(userId) {
      const { error } = await serviceClient().auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    audit,
  },
};

serve(req => handler(req, deps));
