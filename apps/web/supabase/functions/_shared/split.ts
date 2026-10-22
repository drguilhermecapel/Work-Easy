import { assertCents, MoneyError } from './money.ts';

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

/** Scale for a percentage with four decimal places (percent × 10^4 per unit). */
const PERCENT_SCALE = 1_000_000n;

/**
 * Platform charge with split: the provider's wallet receives
 * `amount − platform fee`; the platform keeps the fee.
 *
 * Asaas applies the split to the net value (gross minus the Asaas fee), so a
 * fixed value of `amount − fee` is refused or blocked whenever the commission
 * is smaller than the Asaas fee (R$ 10,00 at 12% asks R$ 8,80 of a net value
 * near R$ 8,01). The split is therefore a percentage of the net value, floored
 * to four decimals so rounding never gives the provider more than its share.
 * The platform absorbs its proportional share of the Asaas fee.
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
  // BigInt keeps providerCents * 10^6 exact for any safe integer amount
  const percentual = Number((BigInt(providerCents) * PERCENT_SCALE) / BigInt(amountCents)) / 10_000;
  const item: AsaasSplitItem = { walletId: providerWalletId, percentualValue: percentual };
  if (reference) item.externalReference = reference;
  return { providerCents, platformCents: platformFeeCents, split: [item] };
}
