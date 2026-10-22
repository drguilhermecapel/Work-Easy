// Money is stored in integer cents; Asaas takes and returns reais with two
// decimals. Cents become reais by integer division, never through `x * 100`
// on an arbitrary float.

export class MoneyError extends Error {}

export function assertCents(cents: unknown, field = 'amount_cents'): asserts cents is number {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) {
    throw new MoneyError(`${field} must be a non-negative integer number of cents`);
  }
}

/** 12345 -> 123.45. Integer division by 100 is correctly rounded by IEEE 754,
 *  so the result is the double closest to the two-decimal value and
 *  serializes as exactly that value in JSON. */
export function centsToReais(cents: number): number {
  assertCents(cents);
  return cents / 100;
}

/** 123456 -> "R$ 1.234,56" (plain spaces, for messages). */
export function formatBRL(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new MoneyError('cents must be an integer');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}R$ ${whole},${frac}`;
}
