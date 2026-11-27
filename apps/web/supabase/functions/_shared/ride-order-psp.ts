import { HttpError } from './http.ts';
import { asCents, type Intent, type RidePaymentContract } from './ride-psp.ts';
import { centsToReais } from './money.ts';
import { buildProviderSplit } from './split.ts';

function method(intent: Intent): 'CREDIT_CARD' | 'PIX' {
  if (intent.method === 'CREDIT_CARD' || intent.method === 'PIX') return intent.method;
  throw new HttpError(409, 'ride_psp_review', 'Método sem aprovação.');
}

// Both environments verify the exact recipient. Card numbers and CVVs are
// entered on the processor's hosted invoice; WorkEasy never receives them.
export function orderPaymentContract(environment: 'simulation' | 'live'): RidePaymentContract {
  return {
    prefix: environment === 'simulation' ? 'we-order-test:' : 'we-order-live:',
    invoiceHost: environment === 'simulation' ? 'sandbox.asaas.com' : 'www.asaas.com',
    description: environment === 'simulation' ? 'WorkEasy · componente em ensaio' : 'WorkEasy · componente de transporte',
    method,
    async prepareSplit(api, intent) {
      const billing = method(intent);
      const estimate = await api.simulatePayment(centsToReais(intent.amount_cents), billing);
      const net = asCents(billing === 'PIX' ? estimate.pix?.netValue : estimate.creditCard?.netValue);
      const promised = intent.driver_cents;
      if (!intent.wallet || promised == null || !Number.isSafeInteger(promised) || promised < 0 ||
          asCents(estimate.value) !== intent.amount_cents || net < promised || net > intent.amount_cents) {
        throw new HttpError(409, 'service_split_unavailable', 'O líquido estimado não cobre o repasse autorizado.');
      }
      if (!promised) return undefined;
      return buildProviderSplit({ amountCents: intent.amount_cents, platformFeeCents: intent.amount_cents - promised,
        providerWalletId: intent.wallet, fixedProviderPayout: true, reference: 'we-order-driver:' + intent.leg_id }).split;
    },
    async reconcile(deps, intent, remote, observed) {
      const review = (reason: string) => deps.observe(intent.leg_id, { ...observed, status: 'review', invoice: null, reason });
      if (remote.status.includes('CHARGEBACK')) return review('card_chargeback');
      if (observed.status === 'review') return review('provider_status_requires_review');
      if (intent.method === 'CREDIT_CARD' && ['paid','settling'].includes(observed.status) &&
          !intent.brands?.includes(remote.creditCard?.creditCardBrand ?? '')) return review('card_brand_unverified');
      const promised = intent.driver_cents;
      if (promised == null || !intent.wallet || remote.netValue == null) return review('missing_net');
      const net = asCents(remote.netValue);
      if (net < promised || net > intent.amount_cents) return review('net_mismatch');
      const splits = remote.split ?? [];
      const piece = splits[0];
      if (promised > 0 && (splits.length !== 1 || !piece.id || piece.walletId !== intent.wallet ||
        asCents(piece.fixedValue) !== promised || !['PENDING','AWAITING_CREDIT','DONE','REFUNDED'].includes(piece.status ?? ''))) return review('unverified_split');
      if (!promised && splits.length) return review('unverified_split');
      const paid = piece?.status === 'DONE' ? asCents(piece.totalValue) : 0;
      if (piece?.status === 'DONE' && paid !== promised) return review('split_paid_mismatch');
      const refunds = (remote.refunds ?? []).filter(refund => refund.status === 'DONE');
      if (refunds.reduce((n, refund) => n + asCents(refund.value), 0) !== observed.refunded) return review('missing_refund_breakdown');
      const reversals = refunds.flatMap(refund => refund.refundedSplits ?? []);
      if (reversals.some(reversal => reversal.id !== piece?.id || !reversal.done)) return review('unverified_split_reversal');
      const recovered = reversals.reduce((n, reversal) => n + asCents(reversal.value), 0);
      if (recovered > promised || recovered > observed.refunded || (piece?.status === 'REFUNDED' && !recovered)) return review('unverified_split_reversal');
      const settling = remote.status === 'CONFIRMED';
      return deps.observe(intent.leg_id, { ...observed, status: settling ? 'settling' : observed.status, invoice: settling ? null : observed.invoice,
        pspFee: intent.amount_cents - net, splitCents: promised, paidToDriver: paid, returnedByDriver: recovered });
    },
  };
}
