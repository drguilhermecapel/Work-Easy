import {
  asaasClient, audit, authenticate, config, DbError, getCustomerId, getProfile, logError, must, now, saveCustomerId, serve,
  serviceClient, setProviderPlan,
} from '../_runtime/supabase.ts';
import { UNIQUE_VIOLATION } from '../_shared/handler-kit.ts';
import type { PlanCode } from '../_shared/types.ts';
import { handler, type SubscriptionRow, type SubscriptionsDeps } from './handler.ts';

const DEFAULT_PRO_PRICE_CENTS = 4900;

const deps: SubscriptionsDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now,
  logError,
  asaas: asaasClient(),
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      async getProvider() {
        return must(await caller.db.from('providers').select('id, plan').eq('id', caller.user.id).maybeSingle()) as
          | { id: string; plan: PlanCode }
          | null;
      },
    };
  },
  admin: {
    async getSubscription(providerId) {
      return must(
        await serviceClient()
          .from('subscriptions')
          .select('provider_id, plan, status, asaas_subscription_id, current_period_end, canceled_at')
          .eq('provider_id', providerId)
          .maybeSingle(),
      ) as SubscriptionRow | null;
    },
    async saveSubscription(row) {
      must(await serviceClient().from('subscriptions').upsert(row, { onConflict: 'provider_id' }));
    },
    async claimSubscription(row, previous) {
      const db = serviceClient();
      if (!previous) {
        const { error } = await db.from('subscriptions').insert(row);
        if (!error) return true;
        if (error.code === UNIQUE_VIOLATION) return false;
        throw new DbError(error.message, error.code);
      }
      // Compare-and-set on the row read at the start of the request
      const query = db.from('subscriptions').update(row).eq('provider_id', row.provider_id).eq('status', previous.status);
      const guarded = previous.asaas_subscription_id
        ? query.eq('asaas_subscription_id', previous.asaas_subscription_id)
        : query.is('asaas_subscription_id', null);
      const updated = must(await guarded.select('provider_id')) as unknown[] | null;
      return (updated?.length ?? 0) > 0;
    },
    setProviderPlan,
    async getProPriceCents() {
      const row = must(
        await serviceClient().from('platform_settings').select('value').eq('key', 'pro_price_cents').maybeSingle(),
      ) as { value: unknown } | null;
      const value = typeof row?.value === 'string' ? Number(row.value) : row?.value;
      return typeof value === 'number' && Number.isSafeInteger(value) ? value : DEFAULT_PRO_PRICE_CENTS;
    },
    getCustomerId,
    saveCustomerId,
    getProfile,
    audit,
  },
};

serve(req => handler(req, deps));
