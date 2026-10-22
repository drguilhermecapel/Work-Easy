import { assertCents, centsToReais, MoneyError } from './money.ts';

// Asaas split reference: https://docs.asaas.com/reference/criar-nova-cobranca
// (split[].walletId, fixedValue, percentualValue). The split is applied to the
// charge's net value (after the Asaas fee).

export interface AsaasSplitItem {
  walletId: string;
  fixedValue?: number;
  percentualValue?: number;
  externalReference?: string;
  description?: string;
}

export interface SplitPlan {
  providerCents: number;
  platformCents: number;
  split: AsaasSplitItem[];
}

/** Mirrors `compute_platform_fee`: `price_cents * commission_bps / 10000`
 *  with Postgres integer division (truncates toward zero). */
export function feeFromBps(amountCents: number, bps: number): number {
  assertCents(amountCents);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new MoneyError('commission_bps must be an integer between 0 and 10000');
  }
  return Math.trunc((amountCents * bps) / 10000);
}

/**
 * Platform charge with split: the provider's wallet receives
 * `amount − platform fee`; the platform keeps the fee.
 *
 * With fee 0 the provider receives 100% of the net value as a percentage,
 * because a fixed value equal to the gross amount would exceed the net value
 * (gross minus the Asaas fee) and Asaas would reject or block the split.
 */
export function buildProviderSplit(input: {
  amountCents: number;
  platformFeeCents: number;
  providerWalletId: string;
  reference?: string;
}): SplitPlan {
  const { amountCents, platformFeeCents, providerWalletId, reference } = input;
  assertCents(amountCents, 'amount_cents');
  assertCents(platformFeeCents, 'platform_fee_cents');
  if (amountCents === 0) throw new MoneyError('amount_cents must be greater than zero');
  if (platformFeeCents >= amountCents) {
    throw new MoneyError('platform_fee_cents must be lower than amount_cents');
  }
  if (!providerWalletId.trim()) throw new MoneyError('provider wallet is missing');

  const providerCents = amountCents - platformFeeCents;
  const item: AsaasSplitItem =
    platformFeeCents === 0
      ? { walletId: providerWalletId, percentualValue: 100 }
      : { walletId: providerWalletId, fixedValue: centsToReais(providerCents) };
  if (reference) item.externalReference = reference;
  return { providerCents, platformCents: platformFeeCents, split: [item] };
}
