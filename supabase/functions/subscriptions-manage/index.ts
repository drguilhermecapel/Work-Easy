import {
  asaasClient, audit, authenticate, config, getCustomerId, getProfile, logError, must, now, saveCustomerId, serve,
  serviceClient, setProviderPlan,
} from '../_runtime/supabase.ts';
import type { PlanCode } from '../_shared/types.ts';
import { handler, type SubscriptionRow, type SubscriptionsDeps } from './handler.ts';

const DEFAULT_PRO_PRICE_CENTS = 4900;

const deps: SubscriptionsDeps = {
  siteUrl: config.siteUrl,
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
