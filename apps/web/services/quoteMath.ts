// Quote arithmetic that matches the database: quotes.total_cents sums
// round(quantity * unit_price_cents) in `numeric` (exact decimals, halves away
// from zero). Floating point differs: 2.675 * 100 is 267.49999999999994 in
// JavaScript and 267.5 (rounds to 268) in Postgres.

/** The database column is `int`. */
export const MAX_TOTAL_CENTS = 2_147_483_647;

/** round(quantity * unitCents) with exact decimal arithmetic, for quantity >= 0 and integer cents >= 0. */
export const lineCents = (quantity: number, unitCents: number): number => {
  const text = String(quantity);
  // Exponent notation (1e21, 1e-7) never comes from a typed quantity: the plain product is enough
  if (!/^\d+(\.\d+)?$/.test(text) || !Number.isSafeInteger(unitCents) || unitCents < 0) return Math.round(quantity * unitCents);
  const [whole, fraction = ''] = text.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const product = BigInt(whole + fraction) * BigInt(unitCents);
  // Half up: (2p + s) / 2s
  const rounded = (product * 2n + scale) / (scale * 2n);
  return Number(rounded);
};

export const itemsTotalCents = (items: Array<{ quantity: number; unit_price_cents: number }>): number =>
  items.reduce((sum, item) => sum + lineCents(item.quantity, item.unit_price_cents), 0);
