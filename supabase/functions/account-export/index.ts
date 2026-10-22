import { authenticate, config, logError, must, now, serve, serviceClient } from '../_runtime/supabase.ts';
import { type ExportDeps, handler } from './handler.ts';

type Row = Record<string, unknown>;

const deps: ExportDeps = {
  siteUrl: config.siteUrl,
  now,
  logError,
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      async selectOwned(table, orFilter) {
        return (must(await caller.db.from(table).select('*').or(orFilter).limit(10000)) as Row[] | null) ?? [];
      },
      async selectIn(table, column, values) {
        return (must(await caller.db.from(table).select('*').in(column, values).limit(10000)) as Row[] | null) ?? [];
      },
    };
  },
  admin: {
    async recordRequest(row) {
      must(await serviceClient().from('data_requests').insert(row));
    },
  },
};

serve(req => handler(req, deps));
