import { addMonths, isIsoDate } from './dates.ts';
import type { PlanCode } from './types.ts';

/** After a cancellation the provider keeps Pro until the paid period ends. */
export function planAfterCancel(currentPeriodEnd: string | null, now: Date): PlanCode {
  if (!currentPeriodEnd) return 'free';
  const end = new Date(currentPeriodEnd);
  return Number.isNaN(end.getTime()) || end.getTime() <= now.getTime() ? 'free' : 'pro';
}

/** Paid monthly cycle starting at the charge's due date (end of the day in São Paulo, UTC-3). */
export function periodEndFrom(dueDate: string | undefined, fallbackToday: string): string {
  const start = dueDate && isIsoDate(dueDate) ? dueDate : fallbackToday;
  return `${addMonths(start, 1)}T23:59:59-03:00`;
}

const DAY_MS = 86_400_000;

/** Overdue charge: Pro stays only until the paid period plus `graceDays` ends. */
export function planWhileOverdue(currentPeriodEnd: string | null, now: Date, graceDays: number): PlanCode {
  if (!currentPeriodEnd) return 'free';
  const end = new Date(currentPeriodEnd).getTime();
  if (Number.isNaN(end)) return 'free';
  return end + Math.max(0, graceDays) * DAY_MS > now.getTime() ? 'pro' : 'free';
}

/** The later of two period ends (a late event for an old cycle never shortens the period). */
export function laterPeriodEnd(current: string | null, candidate: string): string {
  if (!current) return candidate;
  const a = new Date(current).getTime();
  const b = new Date(candidate).getTime();
  if (Number.isNaN(a)) return candidate;
  return b > a ? candidate : current;
}
