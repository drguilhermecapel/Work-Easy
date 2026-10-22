import {
  asaasClient, audit, authenticate, config, logError, must, now, serve, serviceClient, storeSecret,
} from '../_runtime/supabase.ts';
import { handler, type OnboardDeps, type PaymentAccount } from './handler.ts';

const deps: OnboardDeps = {
  siteUrl: config.siteUrl,
  now,
  logError,
  asaas: asaasClient(),
  webhookUrl: config.supabaseUrl ? `${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/asaas-webhook` : null,
  webhookToken: config.asaas.webhookToken,
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      async getProvider() {
        return must(
          await caller.db.from('providers').select('id, display_name').eq('id', caller.user.id).maybeSingle(),
        ) as { id: string; display_name: string | null } | null;
      },
    };
  },
  admin: {
    async getPaymentAccount(providerId) {
      return must(
        await serviceClient()
          .from('provider_payment_accounts')
          .select('provider_id, asaas_account_id, asaas_wallet_id, api_key_secret_id, status')
          .eq('provider_id', providerId)
          .maybeSingle(),
      ) as PaymentAccount | null;
    },
    storeSecret,
    async savePaymentAccount(row) {
      must(await serviceClient().from('provider_payment_accounts').upsert(row, { onConflict: 'provider_id' }));
    },
    audit,
  },
};

serve(req => handler(req, deps));
