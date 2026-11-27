import { HttpError } from './http.ts';
import { centsToReais } from './money.ts';
import { buildProviderSplit } from './split.ts';
import { asCents, type RidePaymentContract } from './ride-psp.ts';

export const liveContract: RidePaymentContract = {
  prefix: 'we-ride-live:',
  invoiceHost: 'www.asaas.com',
  description: 'WorkEasy · transporte',
  async prepareSplit(api, intent) {
    const payout = intent.driver_cents;
    if (!intent.wallet || !Number.isSafeInteger(payout) || !payout || payout > intent.amount_cents) {
      throw new HttpError(409, 'ride_psp_review', 'Recebedor ou valor do repasse sem aprovação.');
    }
    const estimate = await api.simulatePayment(centsToReais(intent.amount_cents), 'PIX');
    const net = asCents(estimate.pix?.netValue);
    if (asCents(estimate.value) !== intent.amount_cents || net < payout || net > intent.amount_cents) {
      throw new HttpError(409, 'service_split_unavailable', 'A tarifa desta operação não cobre o repasse contratado.');
    }
    return buildProviderSplit({ amountCents: intent.amount_cents, platformFeeCents: intent.amount_cents - payout,
      providerWalletId: intent.wallet, fixedProviderPayout: true, reference: 'we-driver:' + intent.leg_id }).split;
  },
  async reconcile(deps, intent, payment, observed) {
    const parts = payment.split;
    const piece = parts?.length === 1 ? parts[0] : null;
    const review = (reason: string) => deps.observe(intent.leg_id, { ...observed, status: 'review', invoice: null, reason });
    if (!piece?.id || !intent.wallet || !intent.driver_cents || piece.walletId !== intent.wallet ||
      !piece.status || !['PENDING','AWAITING_CREDIT','DONE','REFUNDED'].includes(piece.status)) return review('unverified_split');
    if (piece.fixedValue == null || !Number.isFinite(piece.fixedValue) || asCents(piece.fixedValue) !== intent.driver_cents) return review('split_value_mismatch');
    if (payment.netValue == null || !Number.isFinite(payment.netValue)) return review('missing_net');
    const net = asCents(payment.netValue);
    if (net < intent.driver_cents || net > intent.amount_cents) return review('net_mismatch');
    if (piece.status === 'DONE' && (piece.totalValue == null || asCents(piece.totalValue) !== intent.driver_cents)) return review('split_paid_mismatch');
    // CONFIRMED acknowledges the payment before the balance is credited.
    if (payment.status === 'CONFIRMED') {
      observed.status = 'settling';
      observed.invoice = null;
    }
    if (observed.status === 'review') return review('provider_status_requires_review');
    const completed = (payment.refunds ?? []).filter(refund => refund.status === 'DONE');
    if (observed.refunded > 0 && completed.reduce((n, r) => n + asCents(r.value), 0) !== observed.refunded) return review('missing_refund_breakdown');
    const reversals = completed.flatMap(refund => refund.refundedSplits ?? []);
    if (reversals.some(part => part.id !== piece.id || !part.done)) return review('unverified_split_reversal');
    const returned = reversals.reduce((n, part) => n + asCents(part.value), 0);
    if (returned > intent.driver_cents || returned > observed.refunded ||
      (piece.status === 'REFUNDED' && returned === 0) ||
      (observed.refunded > 0 && observed.refunded < intent.amount_cents && (intent.extras_cents ?? 0) > 0)) return review('refund_allocation_requires_review');
    return await deps.observe(intent.leg_id, { ...observed, pspFee: intent.amount_cents - net, splitCents: intent.driver_cents,
      paidToDriver: piece.status === 'DONE' ? intent.driver_cents : 0, returnedByDriver: returned });
  },
};
