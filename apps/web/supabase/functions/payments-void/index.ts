import {
  asaasClient, audit, authenticate, config, logError, markPaymentCanceled, must, now, readSecret, serve, serviceClient,
} from '../_runtime/supabase.ts';
import type { PendingCharge } from '../_shared/void-payments.ts';
import { type BookingForVoid, handler, type VoidDeps } from './handler.ts';

const deps: VoidDeps = {
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
      async getBooking(id) {
        return must(
          await caller.db.from('bookings').select('id, client_id, provider_id, status, origin').eq('id', id).maybeSingle(),
        ) as BookingForVoid | null;
      },
    };
  },
  admin: {
    async listPendingCharges(bookingId) {
      const rows = must(
        await serviceClient().from('payments').select('id, asaas_payment_id').eq('booking_id', bookingId).eq('status', 'pending'),
      ) as Array<{ id: string; asaas_payment_id: string | null }> | null;
      return (rows ?? []).filter((row): row is PendingCharge => Boolean(row.asaas_payment_id));
    },
    getSubaccountApiKey: readSecret,
    markPaymentCanceled,
    audit,
  },
};

serve(req => handler(req, deps));
