import { APP_TIME_ZONE, saoPauloDateTime } from '../../lib/timezone';
import type { Period } from '../../lib/tstzrange';
import type { OfferStatus, ShiftOffer, ShiftStatus } from '../../services/care';

// Dates and times are always São Paulo time, whatever the zone of the device.

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** São Paulo calendar day of an instant as "YYYY-MM-DD". */
export const dayKey = (instant: Date): string => DAY_KEY.format(instant);

/** "09:00" */
export const formatTime = (instant: Date | string): string => {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return Number.isNaN(date.getTime()) ? '' : TIME.format(date);
};

/** "qua., 23/10/2030" */
export const formatDay = (instant: Date | string): string => {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return Number.isNaN(date.getTime()) ? '' : DATE.format(date);
};

/** "qua., 23/10/2030, 08:00 às 20:00"; an end on another day says so ("08:00 às 07:00 do dia seguinte"). */
export const formatShiftPeriod = ({ start, end }: Period): string => {
  const sameDay = dayKey(start) === dayKey(new Date(end.getTime() - 1));
  return `${formatDay(start)}, ${formatTime(start)} às ${formatTime(end)}${sameDay ? '' : ' do dia seguinte'}`;
};

/** "qua., 23/10/2030, 08:00" */
export const formatMoment = (instant: Date | string): string => `${formatDay(instant)}, ${formatTime(instant)}`;

/**
 * "280", "280,5", "1.234,56" or "R$ 99,90" → integer cents. Null for empty,
 * negative, malformed or more than two decimals (never rounds a typo into a price).
 */
export const parseReaisToCents = (input: string): number | null => {
  const text = input.replace(/\s|R\$/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(/\./g, '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
};

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  open: 'Aberto, sem ofertas',
  offered: 'Oferecido a cuidadores',
  assigned: 'Cuidador confirmado',
  checked_in: 'Em andamento',
  completed: 'Concluído',
  canceled: 'Cancelado',
  no_show: 'Cuidador não compareceu',
};

export const SHIFT_STATUS_STYLES: Record<ShiftStatus, string> = {
  open: 'bg-gray-100 text-gray-700',
  offered: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  checked_in: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',
  canceled: 'bg-red-100 text-red-800',
  no_show: 'bg-red-100 text-red-800',
};

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  offered: 'aguardando resposta',
  accepted: 'aceitou',
  declined: 'recusou',
  expired: 'expirou',
};

/** "2030-01-15" + n days as a plain calendar date. */
const addDay = (day: string, count: number): string => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
};

/**
 * Day and times typed by the family (São Paulo time) → the period of the shift.
 * An end that is not after the start means the shift ends the next day (a night shift).
 * Null when a value is missing or malformed.
 */
export const toShiftPeriod = (day: string, start: string, end: string): Period | null => {
  const from = saoPauloDateTime(day, start);
  if (!from) return null;
  let to = saoPauloDateTime(day, end);
  if (!to) return null;
  if (to.getTime() <= from.getTime()) to = saoPauloDateTime(addDay(day, 1), end);
  return to ? { start: from, end: to } : null;
};

/** "2 ofertas: 1 aguardando resposta, 1 recusou" for the offers of one shift. */
export const offersSummary = (offers: ShiftOffer[]): string => {
  if (offers.length === 0) return 'Nenhuma oferta enviada';
  const parts = (['offered', 'accepted', 'declined', 'expired'] as const)
    .map(status => [offers.filter(o => o.status === status).length, OFFER_STATUS_LABELS[status]] as const)
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`);
  return `${offers.length} ${offers.length === 1 ? 'oferta' : 'ofertas'}: ${parts.join(', ')}`;
};
