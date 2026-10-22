// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { centsToReais, formatBRL, MoneyError, reaisToCents } from '../../supabase/functions/_shared/money.ts';
import { buildProviderSplit, feeFromBps } from '../../supabase/functions/_shared/split.ts';

describe('centsToReais', () => {
  it('converts with two decimals and serializes exactly', () => {
    expect(centsToReais(12345)).toBe(123.45);
    expect(centsToReais(30)).toBe(0.3);
    expect(centsToReais(1)).toBe(0.01);
    expect(centsToReais(0)).toBe(0);
    expect(JSON.stringify({ value: centsToReais(1999) })).toBe('{"value":19.99}');
    expect(JSON.stringify({ value: centsToReais(123456789) })).toBe('{"value":1234567.89}');
  });

  it('round-trips every cent value in a range', () => {
    for (let cents = 0; cents <= 100000; cents += 7) {
      expect(reaisToCents(centsToReais(cents))).toBe(cents);
    }
  });

  it('rejects fractional, negative or non-number cents', () => {
    expect(() => centsToReais(10.5)).toThrow(MoneyError);
    expect(() => centsToReais(-1)).toThrow(MoneyError);
    expect(() => centsToReais(Number.NaN)).toThrow(MoneyError);
  });
});

describe('reaisToCents', () => {
  it('parses numbers without floating point drift', () => {
    expect(reaisToCents(0.3)).toBe(30);
    expect(reaisToCents(97.01)).toBe(9701);
    expect(reaisToCents(19.99)).toBe(1999);
    expect(reaisToCents(1.1)).toBe(110);
    expect(reaisToCents(49)).toBe(4900);
  });

  it('parses strings with dot or comma', () => {
    expect(reaisToCents('123,45')).toBe(12345);
    expect(reaisToCents('123.4')).toBe(12340);
    expect(reaisToCents(' 7 ')).toBe(700);
    expect(reaisToCents('-1,50')).toBe(-150);
  });

  it('rejects more than two decimals or garbage', () => {
    expect(() => reaisToCents(1.005)).toThrow(MoneyError);
    expect(() => reaisToCents(0.1 + 0.2)).toThrow(MoneyError);
    expect(() => reaisToCents('1.234,56')).toThrow(MoneyError);
    expect(() => reaisToCents('abc')).toThrow(MoneyError);
    expect(() => reaisToCents(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
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

describe('feeFromBps', () => {
  it('truncates like Postgres integer division', () => {
    expect(feeFromBps(10000, 1200)).toBe(1200);
    expect(feeFromBps(9999, 1200)).toBe(1199); // 1199.88
    expect(feeFromBps(1, 1200)).toBe(0);
    expect(feeFromBps(10000, 0)).toBe(0);
  });

  it('rejects invalid bps', () => {
    expect(() => feeFromBps(100, -1)).toThrow(MoneyError);
    expect(() => feeFromBps(100, 10001)).toThrow(MoneyError);
    expect(() => feeFromBps(100, 12.5)).toThrow(MoneyError);
  });
});

describe('buildProviderSplit', () => {
  it('sends amount minus fee to the provider wallet as a fixed value', () => {
    const plan = buildProviderSplit({ amountCents: 15000, platformFeeCents: 1800, providerWalletId: 'wal_1' });
    expect(plan).toEqual({
      providerCents: 13200,
      platformCents: 1800,
      split: [{ walletId: 'wal_1', fixedValue: 132 }],
    });
  });

  it('keeps cents exact when the fee came from a rounded commission', () => {
    const fee = feeFromBps(9999, 1200);
    const plan = buildProviderSplit({ amountCents: 9999, platformFeeCents: fee, providerWalletId: 'wal_1' });
    expect(plan.providerCents + plan.platformCents).toBe(9999);
    expect(plan.split[0].fixedValue).toBe(88);
    const odd = buildProviderSplit({ amountCents: 10001, platformFeeCents: feeFromBps(10001, 1200), providerWalletId: 'w' });
    expect(odd.split[0].fixedValue).toBe(88.01);
    expect(JSON.stringify(odd.split[0])).toContain('"fixedValue":88.01');
  });

  it('with fee 0 gives the provider 100% of the net value and no platform share', () => {
    const plan = buildProviderSplit({ amountCents: 15000, platformFeeCents: 0, providerWalletId: 'wal_1', reference: 'booking:1' });
    expect(plan.platformCents).toBe(0);
    expect(plan.split).toEqual([{ walletId: 'wal_1', percentualValue: 100, externalReference: 'booking:1' }]);
    expect(plan.split[0].fixedValue).toBeUndefined();
  });

  it('rejects fees that leave nothing for the provider and invalid inputs', () => {
    expect(() => buildProviderSplit({ amountCents: 1000, platformFeeCents: 1000, providerWalletId: 'w' })).toThrow(MoneyError);
    expect(() => buildProviderSplit({ amountCents: 1000, platformFeeCents: 1001, providerWalletId: 'w' })).toThrow(MoneyError);
    expect(() => buildProviderSplit({ amountCents: 0, platformFeeCents: 0, providerWalletId: 'w' })).toThrow(MoneyError);
    expect(() => buildProviderSplit({ amountCents: 1000, platformFeeCents: -1, providerWalletId: 'w' })).toThrow(MoneyError);
    expect(() => buildProviderSplit({ amountCents: 1000, platformFeeCents: 0, providerWalletId: ' ' })).toThrow(MoneyError);
  });
});
