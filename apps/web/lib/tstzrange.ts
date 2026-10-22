// Postgres tstzrange as sent to and read from PostgREST/RPC: "[start,end)".

export interface Period {
  start: Date;
  end: Date;
}

/** Half-open range [start, end), the convention of every period in the database. */
export const formatTstzRange = ({ start, end }: Period): string => {
  if (!(end.getTime() > start.getTime())) throw new RangeError('period end must be after start');
  return `[${start.toISOString()},${end.toISOString()})`;
};

const unquote = (value: string): string => value.trim().replace(/^"(.*)"$/, '$1');

/** Parses "[2026-10-20 12:00:00+00,2026-10-20 15:00:00+00)"; null for empty or unbounded ranges. */
export const parseTstzRange = (value: string | null | undefined): Period | null => {
  if (!value) return null;
  const match = value.trim().match(/^[[(](.*),(.*)[\])]$/);
  if (!match) return null;
  const [startText, endText] = [unquote(match[1]), unquote(match[2])];
  if (!startText || !endText) return null;
  // Postgres prints "2026-10-20 12:00:00+00"; Date wants a "T" and a full offset
  const toDate = (text: string) => new Date(text.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  const start = toDate(startText);
  const end = toDate(endText);
  return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? null : { start, end };
};
