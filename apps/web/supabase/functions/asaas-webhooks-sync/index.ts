import {
  asaasClient, audit, authenticate, config, logError, must, now, readSecret, serve, serviceClient,
} from '../_runtime/supabase.ts';
import { handler, type SyncDeps } from './handler.ts';

/** `Name <a@b.com>` or `a@b.com` -> `a@b.com`; null when there is no address. */
function addressOf(from: string | undefined): string | null {
  const match = from ? /<([^<>\s]+@[^<>\s]+)>|^([^<>\s]+@[^<>\s]+)$/.exec(from.trim()) : null;
  return match ? (match[1] ?? match[2]) : null;
}

const deps: SyncDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now,
  logError,
  asaas: asaasClient(),
  webhookUrl: config.supabaseUrl ? `${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/asaas-webhook` : null,
  webhookToken: config.asaas.webhookToken,
  fallbackEmail: addressOf(config.email.from),
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      // public.is_admin() reads auth.uid(), so it must run with the caller's own client
      async isAdmin() {
        return must(await caller.db.rpc('is_admin')) === true;
      },
    };
  },
  admin: {
    async listTargets({ providerId, after, limit }) {
      const db = serviceClient();
      const base = () => db.from('provider_payment_accounts').select('provider_id', { count: 'exact', head: false }).not('api_key_secret_id', 'is', null);
      if (providerId) {
        const rows = must(await base().eq('provider_id', providerId)) as Array<{ provider_id: string }> | null;
        return { ids: (rows ?? []).map(r => r.provider_id), remaining: 0 };
      }
      let query = base().order('provider_id', { ascending: true }).limit(limit);
      if (after) query = query.gt('provider_id', after);
      const rows = (must(await query) as Array<{ provider_id: string }> | null) ?? [];
      const ids = rows.map(r => r.provider_id);
      if (ids.length < limit) return { ids, remaining: 0 };
      const rest = await db
        .from('provider_payment_accounts')
        .select('provider_id', { count: 'exact', head: true })
        .not('api_key_secret_id', 'is', null)
        .gt('provider_id', ids[ids.length - 1]);
      if (rest.error) throw new Error(rest.error.message);
      return { ids, remaining: rest.count ?? 0 };
    },
    readKey: readSecret,
    async emailOf(providerId) {
      const { data, error } = await serviceClient().auth.admin.getUserById(providerId);
      return error ? null : data.user?.email ?? null;
    },
    audit,
  },
};

serve(req => handler(req, deps));
