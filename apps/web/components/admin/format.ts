import { APP_TIME_ZONE } from '../../lib/timezone';
import type { Period } from '../../lib/tstzrange';

// Dates and times of the administration screens are always São Paulo time.

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "23/10/2030 09:00"; empty for a missing or unreadable value. */
export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date).replace(', ', ' ');
};

/** First 8 characters of an identifier, for lists (the full value stays in the title). */
export const shortId = (id: string | null | undefined): string => (id ? id.slice(0, 8) : '');

/** 1200 basis points → "12,00%" */
export const formatBps = (bps: number): string =>
  `${(bps / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const DAY_TIME = new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "23/10/2030, 09:00 às 10:00" */
export const formatPeriod = (period: Period | null): string =>
  period ? `${formatDateTime(period.start.toISOString()).replace(' ', ', ')} às ${DAY_TIME.format(period.end)}` : 'Horário não informado';
