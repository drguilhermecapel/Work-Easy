import {
  asaasClient, audit, config, DbError, logError, must, now, serve, serviceClient, setProviderPlan, subaccountAsaas,
} from '../_runtime/supabase.ts';
import { UNIQUE_VIOLATION } from '../_shared/handler-kit.ts';
import type { BookingStatus } from '../_shared/types.ts';
import { handler, type StoredPayment, type StoredSubscription, type WebhookDeps } from './handler.ts';

const deps: WebhookDeps = {
  now,
  logError,
  webhookToken: config.asaas.webhookToken,
  asaas: asaasClient(),
  subaccountAsaas,
  proGraceDays: config.proGraceDays,
  store: {
    async recordEvent(event) {
      const db = serviceClient();
      const inserted = await db.from('payment_events').insert(event).select('id').single();
      if (!inserted.error) return { id: (inserted.data as { id: string }).id, processed: false };
      if (inserted.error.code !== UNIQUE_VIOLATION) throw new DbError(inserted.error.message, inserted.error.code);
      // Redelivery of an event already stored: skip it only if it was fully applied
      const existing = must(
        await db.from('payment_events').select('id, processed_at').eq('asaas_event_id', event.asaas_event_id).single(),
      ) as { id: string; processed_at: string | null };
      return { id: existing.id, processed: existing.processed_at !== null };
    },
    async markProcessed(eventRowId, paymentId) {
      must(
        await serviceClient()
          .from('payment_events')
          .update({ processed_at: new Date().toISOString(), payment_id: paymentId })
          .eq('id', eventRowId),
      );
    },
    async findPayment(asaasPaymentId) {
      return must(
        await serviceClient()
          .from('payments')
          .select('id, status, booking_id, provider_id, escrow')
          .eq('asaas_payment_id', asaasPaymentId)
          .maybeSingle(),
      ) as StoredPayment | null;
    },
    async updatePayment(id, patch) {
      must(await serviceClient().from('payments').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
    },
    async getBookingStatus(bookingId) {
      const row = must(await serviceClient().from('bookings').select('status').eq('id', bookingId).maybeSingle()) as
        | { status: BookingStatus }
        | null;
      return row?.status ?? null;
    },
    async transitionBooking(bookingId, to, reason) {
      must(await serviceClient().rpc('transition_booking', { p_booking: bookingId, p_to: to, p_reason: reason }));
    },
    async findSubscription(asaasSubscriptionId) {
      return must(
        await serviceClient()
          .from('subscriptions')
          .select('provider_id, status, current_period_end')
          .eq('asaas_subscription_id', asaasSubscriptionId)
          .maybeSingle(),
      ) as StoredSubscription | null;
    },
    async updateSubscription(providerId, patch) {
      must(await serviceClient().from('subscriptions').update(patch).eq('provider_id', providerId));
    },
    setProviderPlan,
    audit,
  },
};

serve(req => handler(req, deps));
