const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);

/**
 * Index of the calendar day (0 = today) that contains the ISO date `iso`,
 * clamped to `[0, days - 1]`. Missing or invalid input returns 0.
 */
export const dayIndexFromIso = (iso: string | null, days: number, now: Date = new Date()): number => {
  if (!iso) return 0;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.min(Math.max(calendarDaysBetween(now, date), 0), days - 1);
};

/** "Hoje", "Amanhã" or a short weekday + date in pt-BR, relative to `now`. */
export const relativeDayLabel = (date: Date, now: Date = new Date()): string => {
  const diff = calendarDaysBetween(now, date);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
};

export const formatTime = (date: Date): string =>
  date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
