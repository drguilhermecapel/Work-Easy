import {
  asaasClient, audit, authenticate, config, logError, markPaymentCanceled, must, now, readSecret, serve, serviceClient,
} from '../_runtime/supabase.ts';
import { BLOCKING_BOOKING_STATUSES, type DeleteDeps, handler, type OpenCharge } from './handler.ts';

interface OpenChargeRow {
  id: string;
  asaas_payment_id: string | null;
  provider_id: string | null;
  quote_id: string | null;
  booking: { origin: string } | { origin: string }[] | null;
}

const DOCUMENTS_BUCKET = 'provider-documents';
const LIST_PAGE = 100;
// A folder of documents is a handful of files; the cap only stops a loop if Storage never removes what it lists
const MAX_PASSES = 200;

/** Deletes every object under `prefix` (folders are virtual: recursion over what list() returns without an id). */
async function emptyFolder(prefix: string, state: { passes: number }): Promise<number> {
  const bucket = serviceClient().storage.from(DOCUMENTS_BUCKET);
  let removed = 0;
  for (;;) {
    if (++state.passes > MAX_PASSES) throw new Error('storage: folder did not empty');
    const { data, error } = await bucket.list(prefix, { limit: LIST_PAGE });
    if (error) throw error;
    if (!data || data.length === 0) return removed;
    const files = data.filter(entry => entry.id).map(entry => `${prefix}/${entry.name}`);
    for (const folder of data.filter(entry => !entry.id)) removed += await emptyFolder(`${prefix}/${folder.name}`, state);
    if (files.length > 0) {
      const result = await bucket.remove(files);
      if (result.error) throw result.error;
      removed += files.length;
    }
  }
}

const deps: DeleteDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now,
  logError,
  asaas: asaasClient(),
  async session(req) {
    const caller = await authenticate(req);
    return caller ? { user: caller.user } : null;
  },
  admin: {
    async countBlockingBookings(userId) {
      const { count, error } = await serviceClient()
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', [...BLOCKING_BOOKING_STATUSES])
        .or(`client_id.eq.${userId},provider_id.eq.${userId}`);
      return must({ data: count ?? 0, error });
    },
    async getActiveSubscriptionId(providerId) {
      const row = must(
        await serviceClient()
          .from('subscriptions')
          .select('asaas_subscription_id, status')
          .eq('provider_id', providerId)
          .maybeSingle(),
      ) as { asaas_subscription_id: string | null; status: string } | null;
      return row && row.status !== 'canceled' ? row.asaas_subscription_id : null;
    },
    async markSubscriptionCanceled(providerId, canceledAt) {
      const db = serviceClient();
      must(await db.from('subscriptions').update({ status: 'canceled', canceled_at: canceledAt }).eq('provider_id', providerId));
      must(await db.from('providers').update({ plan: 'free' }).eq('id', providerId));
    },
    async listOpenCharges(userId) {
      const rows = (must(
        await serviceClient()
          .from('payments')
          .select('id, asaas_payment_id, provider_id, quote_id, booking:bookings(origin)')
          .eq('status', 'pending')
          .or(`payer_id.eq.${userId},provider_id.eq.${userId}`),
      ) ?? []) as OpenChargeRow[];
      return rows.flatMap((row): OpenCharge[] => {
        if (!row.asaas_payment_id) return [];
        const booking = Array.isArray(row.booking) ? row.booking[0] : row.booking;
        // Quotes and the provider's own clients are charged in the provider's subaccount
        const account = row.quote_id || booking?.origin === 'own' ? 'provider' : 'platform';
        return [{ id: row.id, asaas_payment_id: row.asaas_payment_id, provider_id: row.provider_id, account }];
      });
    },
    markPaymentCanceled,
    getSubaccountApiKey: readSecret,
    removeDocuments: userId => emptyFolder(userId, { passes: 0 }),
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
