import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, dayIndexFromIso, relativeDayLabel } from '../utils/date';

const now = new Date(2026, 9, 19, 10, 0); // 19 Oct 2026, 10:00 local

describe('calendarDaysBetween', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(calendarDaysBetween(now, new Date(2026, 9, 19, 23, 59))).toBe(0);
    expect(calendarDaysBetween(now, new Date(2026, 9, 20, 0, 1))).toBe(1);
    expect(calendarDaysBetween(now, new Date(2026, 9, 18, 23, 0))).toBe(-1);
  });

  it('does not confuse the same day of another year with today', () => {
    expect(calendarDaysBetween(now, new Date(2027, 9, 19, 10, 0))).toBe(365);
  });
});

describe('relativeDayLabel', () => {
  it('labels today and tomorrow', () => {
    expect(relativeDayLabel(new Date(2026, 9, 19, 15, 0), now)).toBe('Hoje');
    expect(relativeDayLabel(new Date(2026, 9, 20, 8, 0), now)).toBe('Amanhã');
  });

  it('shows a date for anything further away instead of "Amanhã"', () => {
    const label = relativeDayLabel(new Date(2026, 9, 21, 8, 0), now);
    expect(label).not.toBe('Amanhã');
    expect(label).toContain('21/10');
  });

  it('does not call the same date next year "Hoje"', () => {
    expect(relativeDayLabel(new Date(2027, 9, 19, 15, 0), now)).not.toBe('Hoje');
  });
});

describe('dayIndexFromIso', () => {
  it('maps a slot to its calendar day and clamps to the visible range', () => {
    expect(dayIndexFromIso(new Date(2026, 9, 20, 9, 0).toISOString(), 4, now)).toBe(1);
    expect(dayIndexFromIso(new Date(2026, 9, 30, 9, 0).toISOString(), 4, now)).toBe(3);
    expect(dayIndexFromIso(new Date(2026, 9, 1, 9, 0).toISOString(), 4, now)).toBe(0);
  });

  it('falls back to today for missing or invalid input', () => {
    expect(dayIndexFromIso(null, 4, now)).toBe(0);
    expect(dayIndexFromIso('not-a-date', 4, now)).toBe(0);
  });
});
