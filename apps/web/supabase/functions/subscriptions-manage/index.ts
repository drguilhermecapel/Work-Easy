import {
  asaasClient, audit, authenticate, config, DbError, getCustomerId, getProfile, logError, must, now, readProviderAccount,
  saveCustomerId, serve, serviceClient, setProviderPlan,
} from '../_runtime/supabase.ts';
import { UNIQUE_VIOLATION } from '../_shared/handler-kit.ts';
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
      getProvider() {
        return readProviderAccount(caller.db, caller.user.id);
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
    async isPaymentOnboardingComplete(providerId) {
      const row = must(
        await serviceClient()
          .from('provider_payment_accounts')
          .select('asaas_wallet_id, status')
          .eq('provider_id', providerId)
          .maybeSingle(),
      ) as { asaas_wallet_id: string | null; status: string | null } | null;
      return Boolean(row?.asaas_wallet_id) && row?.status === 'active';
    },
    async claimTrial(cpfHash, providerId) {
      const { error } = await serviceClient().from('trial_claims').insert({ cpf_hash: cpfHash, provider_id: providerId });
      if (!error) return true;
      if (error.code === UNIQUE_VIOLATION) return false;
      throw new DbError(error.message, error.code);
    },
    async releaseTrial(cpfHash, providerId) {
      must(await serviceClient().from('trial_claims').delete().eq('cpf_hash', cpfHash).eq('provider_id', providerId));
    },
    async getProPriceCents() {
      const row = must(
        await serviceClient().from('platform_settings').select('value').eq('key', 'pro_price_cents').maybeSingle(),
      ) as { value: unknown } | null;
      const value = typeof row?.value === 'string' ? Number(row.value) : row?.value;
      return typeof value === 'number' && Number.isSafeInteger(value) ? value : DEFAULT_PRO_PRICE_CENTS;
    },
    async getTrialDays() {
      const row = must(
        await serviceClient().from('platform_settings').select('value').eq('key', 'pro_trial_days').maybeSingle(),
      ) as { value: unknown } | null;
      const value = typeof row?.value === 'string' ? Number(row.value) : row?.value;
      // No trial unless the setting is a sane whole number: an unreadable value must not hand out free Pro
      return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 90 ? value : 0;
    },
    getCustomerId,
    saveCustomerId,
    getProfile,
    audit,
  },
};

serve(req => handler(req, deps));
