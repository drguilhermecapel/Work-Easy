const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const formatBRL = (value: number): string => BRL.format(value);
