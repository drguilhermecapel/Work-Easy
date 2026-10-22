// Money is stored in integer cents; Asaas takes and returns reais with two
// decimals. All conversions go through integer arithmetic or exact decimal
// strings, never through `x * 100` on an arbitrary float.

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

const DECIMAL = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/;

/** 123.45 or "123,45" -> 12345. Rejects more than two decimal places. */
export function reaisToCents(value: number | string): number {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MoneyError('value must be finite');
    const fixed = value.toFixed(2);
    // toFixed rounds; if that changed the number, it had more than 2 decimals
    if (Number(fixed) !== value) throw new MoneyError('value has more than two decimal places');
    text = fixed;
  } else {
    text = value.trim();
  }
  const match = DECIMAL.exec(text);
  if (!match) throw new MoneyError('value is not a decimal amount in reais');
  const [, sign, whole, frac = ''] = match;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new MoneyError('value is too large');
  return sign === '-' && cents !== 0 ? -cents : cents;
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
