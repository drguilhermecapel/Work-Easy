import {
  asaasClient, audit, authenticate, config, findOpenPayment, getCustomerId, getProfile, insertPayment, logError, must,
  now, saveCustomerId, serve, serviceClient,
} from '../_runtime/supabase.ts';
import { type BookingForPayment, handler, type PaymentsCreateDeps } from './handler.ts';

const deps: PaymentsCreateDeps = {
  siteUrl: config.siteUrl,
  now,
  logError,
  asaas: asaasClient(),
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      async getBooking(id) {
        return must(
          await caller.db
            .from('bookings')
            .select('id, client_id, provider_id, occupation_slug, status, origin, price_cents, platform_fee_cents')
            .eq('id', id)
            .maybeSingle(),
        ) as BookingForPayment | null;
      },
    };
  },
  admin: {
    findOpenPayment: bookingId => findOpenPayment('booking_id', bookingId),
    async getProviderWallet(providerId) {
      const row = must(
        await serviceClient()
          .from('provider_payment_accounts')
          .select('asaas_wallet_id')
          .eq('provider_id', providerId)
          .maybeSingle(),
      ) as { asaas_wallet_id: string | null } | null;
      return row?.asaas_wallet_id ?? null;
    },
    getCustomerId,
    saveCustomerId,
    getProfile,
    insertPayment,
    audit,
  },
};

serve(req => handler(req, deps));
