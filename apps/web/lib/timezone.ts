// Every date the user types or reads refers to São Paulo time, whatever the
// time zone of the device. The database counts weekly rules in this zone too.

export const APP_TIME_ZONE = 'America/Sao_Paulo';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const wallClock = (instant: Date): Record<string, number> => {
  const parts: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(instant)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
};

/** Offset of São Paulo from UTC at this instant, in milliseconds (e.g. -3 h). */
const offsetAt = (instant: Date): number => {
  const p = wallClock(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/**
 * "2030-01-15" + "09:00" read as São Paulo wall time → the instant (a Date).
 * Uses the zone rules (Intl), so it stays right if daylight saving time returns.
 * Null for malformed input.
 */
export const saoPauloDateTime = (day: string, time: string): Date | null => {
  const d = DAY.exec(day);
  const t = TIME.exec(time);
  if (!d || !t) return null;
  const [year, month, date] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute, second] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  if (month < 1 || month > 12 || date < 1 || date > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const guess = Date.UTC(year, month - 1, date, hour, minute, second);
  if (new Date(guess).getUTCDate() !== date) return null; // e.g. 2030-02-31
  // Two passes settle the offset also next to a zone transition
  let instant = guess - offsetAt(new Date(guess));
  instant = guess - offsetAt(new Date(instant));
  return new Date(instant);
};

/** Today's date in São Paulo as "YYYY-MM-DD" (for <input type="date" min>). */
export const todayInSaoPaulo = (now: Date = new Date()): string => {
  const p = wallClock(now);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/** True for a plain "YYYY-MM-DD" value (Postgres `date`), as opposed to a timestamp. */
export const isDateOnly = (value: string): boolean => DAY.test(value);

/**
 * Instant after which a value stops being valid: the end of the day in São
 * Paulo for a plain date ("valid until 20/10" includes the whole 20th), the
 * instant itself for a timestamp.
 */
export const validityEnd = (value: string): Date | null => {
  if (isDateOnly(value)) {
    const [year, month, date] = value.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
    return saoPauloDateTime(next, '00:00');
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant;
};

/** "dd/mm/aaaa" in São Paulo; a plain date is shown as written, never shifted by a time zone. */
export const formatDateBR = (value: string): string => {
  const d = DAY.exec(value);
  if (d) return `${d[3]}/${d[2]}/${d[1]}`;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  return instant.toLocaleDateString('pt-BR', { timeZone: APP_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
};
