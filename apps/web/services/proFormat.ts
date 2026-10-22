import { AppError } from '../lib/errors';
import { APP_TIME_ZONE, formatDateBR, saoPauloDateTime, todayInSaoPaulo } from '../lib/timezone';
import type { Period } from '../lib/tstzrange';

// Pure helpers of the Pro screens: money typed in reais, São Paulo days and
// weeks, periods and CPF/CNPJ check digits. No React, no network.

// ---- Money ------------------------------------------------------------------

/**
 * "150", "150,5", "1.234,56" or "R$ 99,90" → integer cents. Null for empty,
 * negative, malformed or more than two decimals (never rounds a typo into a price).
 */
export const parseReaisToCents = (input: string): number | null => {
  const text = input.replace(/\s|R\$/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(/\./g, '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
};

/** 15000 → "150,00" (to fill an input; formatCents is for display). */
export const centsToInput = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

// ---- Days and weeks in São Paulo --------------------------------------------

/** "2026-10-22" + n days, as a plain calendar date. */
export const addDays = (day: string, count: number): string => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
};

/** 0 = Sunday, like availability.weekday. */
export const weekdayOf = (day: string): number => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
};

/** The São Paulo calendar day of an instant. */
export const dayOf = (instant: Date): string => todayInSaoPaulo(instant);

/** [00:00 of the day, 00:00 of the next day) in São Paulo. */
export const dayRange = (day: string): Period => {
  const start = saoPauloDateTime(day, '00:00');
  const end = saoPauloDateTime(addDays(day, 1), '00:00');
  if (!start || !end) throw new AppError('invalid_input');
  return { start, end };
};

/** The ISO week (Monday to Sunday) that contains the day, as a half-open period. */
export const weekRange = (day: string): Period => {
  const monday = addDays(day, -((weekdayOf(day) + 6) % 7));
  return { start: dayRange(monday).start, end: dayRange(addDays(monday, 6)).end };
};

export const overlaps = (a: Period, b: Period): boolean => a.start < b.end && b.start < a.end;

/** Day and times typed by the user (São Paulo time) → the period of an appointment. */
export const toPeriod = (day: string, start: string, end: string): Period => {
  const from = saoPauloDateTime(day, start);
  const to = saoPauloDateTime(day, end);
  if (!from || !to) throw new AppError('invalid_input', { message: 'Informe o dia e os horários.' });
  if (to.getTime() <= from.getTime()) throw new AppError('invalid_input', { message: 'O horário de término precisa ser depois do início.' });
  return { start: from, end: to };
};

// ---- Display ----------------------------------------------------------------

export const WEEKDAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'] as const;

/** "09:00:00" → "09:00". */
export const shortTime = (time: string): string => time.slice(0, 5);

export const formatDateTimeBR = (instant: Date | string): string => {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const timeOf = (instant: Date): string =>
  instant.toLocaleTimeString('pt-BR', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "22/10/2026, 09:00 às 11:00" (an end on another day repeats the date). */
export const formatPeriodBR = ({ start, end }: Period): string => {
  const sameDay = dayOf(start) === dayOf(new Date(end.getTime() - 1));
  return sameDay
    ? `${formatDateBR(start.toISOString())}, ${timeOf(start)} às ${timeOf(end)}`
    : `${formatDateTimeBR(start)} até ${formatDateTimeBR(end)}`;
};

/** A time-off period as whole days: "25/10/2026" or "25/10/2026 a 27/10/2026". */
export const formatDaysBR = ({ start, end }: Period): string => {
  const first = formatDateBR(start.toISOString());
  const last = formatDateBR(new Date(end.getTime() - 1).toISOString());
  return first === last ? first : `${first} a ${last}`;
};

// ---- CPF / CNPJ --------------------------------------------------------------

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

const cpfValid = (d: string): boolean => {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(d[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
};

const cnpjValid = (d: string): boolean => {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const digit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, i) => acc + Number(d[i]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
};

/** Digits of a valid CPF (11) or CNPJ (14), else null. The server checks again. */
export const parseCpfCnpj = (input: string): string | null => {
  const digits = onlyDigits(input);
  return cpfValid(digits) || cnpjValid(digits) ? digits : null;
};
