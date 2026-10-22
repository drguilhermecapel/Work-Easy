import {
  asaasClient, audit, authenticate, config, findOpenPayment, hasPaidPayment, insertPayment, logError, markPaymentCanceled, must, now,
  readSecret, serve,
} from '../_runtime/supabase.ts';
import {
  type ChargesCreateDeps, handler, type OwnBooking, type ProviderClient, type ProviderQuote,
} from './handler.ts';

const deps: ChargesCreateDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now,
  logError,
  asaas: asaasClient(),
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    const { db, user } = caller;
    return {
      user,
      async getProvider() {
        return must(await db.from('providers').select('id, plan').eq('id', user.id).maybeSingle()) as
          | { id: string; plan: string }
          | null;
      },
      async getBooking(id) {
        return must(
          await db
            .from('bookings')
            .select('id, provider_id, client_id, provider_client_id, occupation_slug, status, origin, price_cents')
            .eq('id', id)
            .maybeSingle(),
        ) as OwnBooking | null;
      },
      async getQuote(id) {
        return must(
          await db
            .from('quotes')
            .select('id, provider_id, provider_client_id, client_name, client_phone, title, total_cents, status')
            .eq('id', id)
            .maybeSingle(),
        ) as ProviderQuote | null;
      },
      async getProviderClient(id) {
        return must(
          await db.from('provider_clients').select('name, phone, email, client_id').eq('id', id).maybeSingle(),
        ) as ProviderClient | null;
      },
    };
  },
  admin: {
    getSubaccountApiKey: readSecret,
    hasPaidCharge: target =>
      target.bookingId ? hasPaidPayment('booking_id', target.bookingId) : hasPaidPayment('quote_id', target.quoteId!),
    findOpenCharge: target =>
      target.bookingId ? findOpenPayment('booking_id', target.bookingId) : findOpenPayment('quote_id', target.quoteId!),
    insertPayment,
    markPaymentCanceled,
    audit,
  },
};

serve(req => handler(req, deps));
