// Datas no fuso de São Paulo (UTC-3 o ano todo desde 2019). As regras por dia e
// por semana do banco usam America/Sao_Paulo e a semana ISO (segunda a domingo).
import { formatTstzRange } from '../../../lib/tstzrange';

const SP_OFFSET = '-03:00';

export const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const spToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/** Primeira segunda-feira (data de São Paulo) pelo menos `minDaysAhead` dias à frente. */
export const mondayAtLeast = (minDaysAhead: number): string => {
  const start = addDays(spToday(), minDaysAhead);
  const weekday = new Date(`${start}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(start, (8 - weekday) % 7);
};

export const spInstant = (isoDate: string, time: string): Date => new Date(`${isoDate}T${time}:00${SP_OFFSET}`);

/** Período `[início,fim)` no formato que o PostgREST entende, a partir da hora de parede de São Paulo. */
export const spRange = (isoDate: string, from: string, to: string): string =>
  formatTstzRange({ start: spInstant(isoDate, from), end: spInstant(isoDate, to) });
