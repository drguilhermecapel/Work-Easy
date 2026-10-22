// payments-void (participante do atendimento): after a booking is canceled,
// removes its open charges (`pending`) in Asaas and marks them `canceled`, so
// nobody can still pay for what was canceled. The charge of a platform booking
// lives in the root account; the one of a provider's own client in the
// provider's subaccount. Idempotent: no open charge is a 200 with zeros. A
// charge that was paid meanwhile stays `pending` until the webhook arrives,
// which refunds a payment received for a canceled booking (asaas-webhook).

import type { AsaasClient } from '../_shared/asaas-client.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, corsOf, validated,
} from '../_shared/handler-kit.ts';
import { errors, readJson, route } from '../_shared/http.ts';
import { object, uuid } from '../_shared/validate.ts';
import { type PendingCharge, voidCharges } from '../_shared/void-payments.ts';

export interface BookingForVoid {
  id: string;
  client_id: string | null;
  provider_id: string | null;
  status: string;
  origin: string;
}

export interface VoidDeps extends BaseDeps {
  /** Root client; null without ASAAS_API_KEY. */
  asaas: AsaasClient | null;
  session(req: Request): Promise<{ user: AuthUser; getBooking(id: string): Promise<BookingForVoid | null> } | null>;
  admin: {
    listPendingCharges(bookingId: string): Promise<PendingCharge[]>;
    getSubaccountApiKey(providerId: string): Promise<string | null>;
    markPaymentCanceled(id: string): Promise<void>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({ booking_id: uuid() });

export function handler(req: Request, deps: VoidDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const asaas = deps.asaas;
    if (!asaas) throw errors.paymentsNotConfigured();
    const input = validated(Body, await readJson(req));
    const { user } = session;

    // The caller's own query: the database hides what is not theirs
    const booking = await session.getBooking(input.booking_id);
    if (!booking) throw errors.notFound('Atendimento');
    if (booking.client_id !== user.id && booking.provider_id !== user.id) {
      throw errors.notAllowed('Só quem participa do atendimento pode cancelar a cobrança.');
    }
    if (booking.status !== 'canceled') {
      throw errors.conflict('booking_not_canceled', 'A cobrança só é cancelada depois que o atendimento é cancelado.');
    }

    const charges = await deps.admin.listPendingCharges(booking.id);
    if (charges.length === 0) return { data: { booking_id: booking.id, canceled: 0, awaiting_confirmation: 0 } };

    let client = asaas;
    if (booking.origin === 'own') {
      const key = booking.provider_id ? await deps.admin.getSubaccountApiKey(booking.provider_id) : null;
      if (!key) {
        throw errors.conflict(
          'payment_key_missing',
          'Não foi possível acessar a conta de recebimento do prestador para cancelar a cobrança. Fale com o suporte.',
        );
      }
      client = asaas.withApiKey(key);
    }

    const result = await voidCharges({ client, charges, markCanceled: deps.admin.markPaymentCanceled });
    for (const charge of result.canceled) {
      await auditSafely(deps, {
        actor_id: user.id,
        action: 'payment.void',
        entity: 'payments',
        entity_id: charge.id,
        data: { booking_id: booking.id, asaas_payment_id: charge.asaas_payment_id },
      });
    }
    for (const charge of result.paid) {
      await auditSafely(deps, {
        actor_id: user.id,
        action: 'payment.void_paid',
        entity: 'payments',
        entity_id: charge.id,
        data: { booking_id: booking.id, asaas_payment_id: charge.asaas_payment_id },
      });
    }
    // Some charges stay open: the answer is an error so the caller knows to try again
    if (result.failed.length > 0) throw result.failed[0].error;

    return {
      data: { booking_id: booking.id, canceled: result.canceled.length, awaiting_confirmation: result.paid.length },
    };
  });
}
