import type { PriceUnit } from '../../catalog/types';
import { PRICE_UNIT_LABELS } from '../../catalog/labels';
import { formatCents } from '../../lib/money';
import { APP_TIME_ZONE } from '../../lib/timezone';
import type { Period } from '../../lib/tstzrange';

// Dates and times are always shown in São Paulo time, whatever the device zone.

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const TIME = new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const LONG_DAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIME_ZONE,
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "23/10/2030 09:00" */
export const formatDateTime = (instant: Date | string): string => {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date).replace(', ', ' ');
};

/** "09:00" */
export const formatTime = (instant: Date): string => TIME.format(instant);

/** "quarta-feira, 23/10/2030" */
export const formatLongDay = (instant: Date): string => LONG_DAY.format(instant);

/** São Paulo calendar day of an instant as "YYYY-MM-DD". */
export const dayKey = (instant: Date): string => DAY_KEY.format(instant);

/** "quarta-feira, 23/10/2030, 09:00 às 10:00" */
export const formatPeriod = (period: Period | null): string =>
  period ? `${formatLongDay(period.start)}, ${formatTime(period.start)} às ${formatTime(period.end)}` : 'Horário não informado';

/** "09:00:00" → "09:00" */
export const shortTime = (value: string): string => value.slice(0, 5);

export const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'] as const;

/** "R$ 80,00 por hora", "R$ 80,00 a R$ 120,00 por hora" */
export const formatPriceRange = (min: number | null, max: number | null, unit: PriceUnit | null): string => {
  if (min === null) return '';
  const range = max !== null && max > min ? `${formatCents(min)} a ${formatCents(max)}` : formatCents(min);
  return unit ? `${range} ${PRICE_UNIT_LABELS[unit]}` : range;
};

/** "1 h 30 min" for a duration in minutes. */
export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};
