const BRL_CENTS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

/** Integer cents (as stored in the database) → "R$ 1.234,50". */
export const formatCents = (cents: number): string => BRL_CENTS.format(cents / 100);
