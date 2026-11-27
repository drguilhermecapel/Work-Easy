import {
  asaasClient, audit, authenticate, config, hasPaidPayment, insertPayment, logError, markPaymentCanceled, must, now,
  PAYMENT_COLUMNS, readProviderAccount, readSecret, serve, serviceClient,
} from '../_runtime/supabase.ts';
import {
  type ChargesCreateDeps, handler, type OpenCharge, type OwnBooking, type ProviderClient, type ProviderQuote,
} from './handler.ts';

/** The pending charge of the booking or quote, with the Asaas customer it bills (from the stored payload). */
async function findOpenCharge(column: 'booking_id' | 'quote_id', id: string): Promise<OpenCharge | null> {
  const rows = must(
    await serviceClient()
      .from('payments')
      .select(`${PAYMENT_COLUMNS}, asaas_customer_id:raw->>customer`)
      .eq(column, id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1),
  ) as OpenCharge[] | null;
  return rows?.[0] ?? null;
}

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
        const account = await readProviderAccount(db, user.id);
        if (!account || account.plan === 'pro') return account;
        const [options, sales] = await Promise.all([
          db.rpc('service_commission_options'),
          db.rpc('service_pro_sales_allowed', { p_provider: user.id }),
        ]);
        const agreements = must(options) as { occupation_slug: string; accepted_at: string | null }[];
        return {
          ...account, fullyMigrated: must(sales) === false,
          migratedOccupations: agreements.filter(o => o.accepted_at !== null).map(o => o.occupation_slug),
        };
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
            .select('id, provider_id, provider_client_id, title, total_cents, status')
            .eq('id', id)
            .maybeSingle(),
        ) as ProviderQuote | null;
      },
      async getProviderClient(id) {
        return must(
          await db
            .from('provider_clients')
            .select('provider_id, name, phone, email, cpf_cnpj, client_id')
            .eq('id', id)
            .maybeSingle(),
        ) as ProviderClient | null;
      },
    };
  },
  admin: {
    getSubaccountApiKey: readSecret,
    hasPaidCharge: target =>
      target.bookingId ? hasPaidPayment('booking_id', target.bookingId) : hasPaidPayment('quote_id', target.quoteId!),
    findOpenCharge: target =>
      target.bookingId ? findOpenCharge('booking_id', target.bookingId) : findOpenCharge('quote_id', target.quoteId!),
    insertPayment,
    markPaymentCanceled,
    audit,
  },
};

serve(req => handler(req, deps));
