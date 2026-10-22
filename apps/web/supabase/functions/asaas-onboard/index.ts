import {
  asaasClient, audit, authenticate, config, DbError, logError, must, now, serve, serviceClient, storeSecret,
} from '../_runtime/supabase.ts';
import { isUniqueViolation } from '../_shared/handler-kit.ts';
import { handler, type OnboardDeps, type PaymentAccount } from './handler.ts';

/** A `creating` claim older than this belongs to a run that died. */
const CLAIM_TTL_MS = 5 * 60_000;

const deps: OnboardDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
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
    async claimOnboarding(providerId) {
      const db = serviceClient();
      const inserted = await db.from('provider_payment_accounts').insert({ provider_id: providerId, status: 'creating' });
      if (!inserted.error) return true;
      if (!isUniqueViolation(new DbError(inserted.error.message, inserted.error.code))) {
        throw new DbError(inserted.error.message, inserted.error.code);
      }
      // A row exists: take it over only if it is a dead claim (no account, `creating`, old)
      const stale = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
      const taken = must(
        await db
          .from('provider_payment_accounts')
          .update({ created_at: new Date().toISOString() })
          .eq('provider_id', providerId)
          .eq('status', 'creating')
          .is('asaas_wallet_id', null)
          .lt('created_at', stale)
          .select('provider_id'),
      ) as unknown[] | null;
      return (taken?.length ?? 0) > 0;
    },
    async releaseOnboarding(providerId) {
      must(
        await serviceClient()
          .from('provider_payment_accounts')
          .delete()
          .eq('provider_id', providerId)
          .eq('status', 'creating')
          .is('asaas_wallet_id', null),
      );
    },
    storeSecret,
    async savePaymentAccount(row) {
      must(await serviceClient().from('provider_payment_accounts').upsert(row, { onConflict: 'provider_id' }));
    },
    audit,
  },
};

serve(req => handler(req, deps));
