// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { centsToReais, formatBRL, MoneyError } from '../../supabase/functions/_shared/money.ts';
import { buildProviderSplit } from '../../supabase/functions/_shared/split.ts';

describe('centsToReais', () => {
  it('converts with two decimals and serializes exactly', () => {
    expect(centsToReais(12345)).toBe(123.45);
    expect(centsToReais(30)).toBe(0.3);
    expect(centsToReais(1)).toBe(0.01);
    expect(centsToReais(0)).toBe(0);
    expect(JSON.stringify({ value: centsToReais(1999) })).toBe('{"value":19.99}');
    expect(JSON.stringify({ value: centsToReais(123456789) })).toBe('{"value":1234567.89}');
  });

  it('serializes every cent value in a range with at most two decimals', () => {
    for (let cents = 0; cents <= 100000; cents += 7) {
      const text = JSON.stringify(centsToReais(cents));
      expect(Math.round(Number(text) * 100)).toBe(cents);
      expect(text).toMatch(/^\d+(\.\d{1,2})?$/);
    }
  });

  it('rejects fractional, negative or non-number cents', () => {
    expect(() => centsToReais(10.5)).toThrow(MoneyError);
    expect(() => centsToReais(-1)).toThrow(MoneyError);
    expect(() => centsToReais(Number.NaN)).toThrow(MoneyError);
  });
});

describe('formatBRL', () => {
  it('formats with thousands separator and comma', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatBRL(100000000)).toBe('R$ 1.000.000,00');
    expect(formatBRL(-250)).toBe('-R$ 2,50');
  });
});

describe('buildProviderSplit', () => {
  it('sends the provider share of the NET value as a percentage', () => {
    const plan = buildProviderSplit({ amountCents: 15000, platformFeeCents: 1800, providerWalletId: 'wal_1' });
    expect(plan).toEqual({
      providerCents: 13200,
      platformCents: 1800,
      split: [{ walletId: 'wal_1', percentualValue: 88 }],
    });
  });

  it('never asks for a fixed value that the net value cannot cover (commission below the Asaas fee)', () => {
    // R$ 10,00 at 12%: fixedValue 8.80 would exceed a net value of about R$ 8,01 after a R$ 1,99 fee
    const plan = buildProviderSplit({ amountCents: 1000, platformFeeCents: 120, providerWalletId: 'wal_1' });
    expect(plan.split).toEqual([{ walletId: 'wal_1', percentualValue: 88 }]);
    expect(plan.split[0].fixedValue).toBeUndefined();
    const net = 1000 - 199;
    expect((net * (plan.split[0].percentualValue ?? 0)) / 100).toBeLessThanOrEqual(net);
  });

  it('floors to four decimals so rounding never favors the provider', () => {
    const plan = buildProviderSplit({ amountCents: 9999, platformFeeCents: 1199, providerWalletId: 'w' });
    // 8800 / 9999 = 88.0088008...%
    expect(plan.split[0].percentualValue).toBe(88.0088);
    expect(JSON.stringify(plan.split[0])).toContain('"percentualValue":88.0088');
    const third = buildProviderSplit({ amountCents: 300, platformFeeCents: 100, providerWalletId: 'w' });
    expect(third.split[0].percentualValue).toBe(66.6666);
    expect(plan.providerCents + plan.platformCents).toBe(9999);
  });

  it('with fee 0 gives the provider 100% of the net value and no platform share', () => {
    const plan = buildProviderSplit({ amountCents: 15000, platformFeeCents: 0, providerWalletId: 'wal_1', reference: 'booking:1' });
    expect(plan.platformCents).toBe(0);
    expect(plan.split).toEqual([{ walletId: 'wal_1', percentualValue: 100, externalReference: 'booking:1' }]);
  });

  it('stays exact for very large amounts', () => {
    const plan = buildProviderSplit({ amountCents: 2_000_000_000, platformFeeCents: 240_000_000, providerWalletId: 'w' });
    expect(plan.split[0].percentualValue).toBe(88);
  });

  it('rejects fees that leave nothing for the provider and invalid inputs', () => {
    expect(() => buildProviderSplit({ amountCents: 1000, platformFeeCents: 1000, providerWalletId: 'w' })).toThrow(MoneyError);
    expect(() => buildProviderSplit({ amountCents: 1000, platformFeeCents: 1001, providerWalletId: 'w' })).toThrow(MoneyError);
    expect(() => buildProviderSplit({ amountCents: 0, platformFeeCents: 0, providerWalletId: 'w' })).toThrow(MoneyError);
    expect(() => buildProviderSplit({ amountCents: 1000, platformFeeCents: -1, providerWalletId: 'w' })).toThrow(MoneyError);
    expect(() => buildProviderSplit({ amountCents: 1000, platformFeeCents: 0, providerWalletId: ' ' })).toThrow(MoneyError);
  });
});
