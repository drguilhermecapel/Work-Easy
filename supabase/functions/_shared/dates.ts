// Calendar helpers in America/Sao_Paulo (the contract's business time zone).

export const TIME_ZONE = 'America/Sao_Paulo';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD of `now` in São Paulo. */
export function saoPauloDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  if (!isIsoDate(date)) throw new Error('date must be YYYY-MM-DD');
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Same day next month, clamped to the month's last day (Jan 31 -> Feb 28/29). */
export function addMonths(date: string, months: number): string {
  if (!isIsoDate(date)) throw new Error('date must be YYYY-MM-DD');
  const [y, m, d] = date.split('-').map(Number);
  const targetMonth = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  const result = new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay)));
  return result.toISOString().slice(0, 10);
}

/** "dd/mm/aaaa às HH:MM" in São Paulo, for messages. */
export function formatDateTimeBR(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new Error('invalid date');
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
}

/** Lower bound of a Postgres tstzrange literal such as `["2026-10-20 13:00:00+00","2026-10-20 14:00:00+00")`. */
export function rangeStart(range: string): string | null {
  const match = /^[[(]"?([^",]+)"?,/.exec(range.trim());
  return match ? match[1] : null;
}
