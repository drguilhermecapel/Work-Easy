// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, formatDateTimeBR, isIsoDate, rangeStart, saoPauloDate,
} from '../../supabase/functions/_shared/dates.ts';
import { periodEndFrom, planAfterCancel } from '../../supabase/functions/_shared/subscriptions.ts';
import {
  boolean, cpfCnpj, email, int, isoDate, normalizePhoneBR, object, oneOf, optional, parse, phoneBR, postalCode, string, uuid,
} from '../../supabase/functions/_shared/validate.ts';
import { VALID_CNPJ, VALID_CPF } from './helpers.ts';

describe('validators', () => {
  it('validates CPF and CNPJ check digits', () => {
    const check = cpfCnpj();
    expect(check('529.982.247-25', 'doc')).toEqual({ ok: true, value: VALID_CPF });
    expect(check('11.222.333/0001-81', 'doc')).toEqual({ ok: true, value: VALID_CNPJ });
    expect(check('529.982.247-24', 'doc').ok).toBe(false);
    expect(check('111.111.111-11', 'doc').ok).toBe(false);
    expect(check('11.222.333/0001-80', 'doc').ok).toBe(false);
    expect(check(12345678909, 'doc').ok).toBe(false);
  });

  it('normalizes Brazilian phones with DDI 55', () => {
    expect(normalizePhoneBR('(11) 98765-4321')).toBe('5511987654321');
    expect(normalizePhoneBR('+55 11 3333-4444')).toBe('551133334444');
    expect(normalizePhoneBR('5511987654321')).toBe('5511987654321');
    expect(normalizePhoneBR('987654321')).toBeNull();
    expect(normalizePhoneBR('011987654321')).toBeNull();
    expect(phoneBR()('x', 'tel').ok).toBe(false);
  });

  it('validates strings, ints, enums, uuids, emails, CEP and dates', () => {
    expect(string({ min: 3 })('  ab ', 'f').ok).toBe(false);
    expect(string()(' ok ', 'f')).toEqual({ ok: true, value: 'ok' });
    expect(string({ max: 2 })('abc', 'f').ok).toBe(false);
    expect(int({ min: 1 })(0, 'n').ok).toBe(false);
    expect(int()(1.5, 'n').ok).toBe(false);
    expect(boolean()('true', 'b').ok).toBe(false);
    expect(oneOf(['pix', 'boleto'] as const)('pix', 'm')).toEqual({ ok: true, value: 'pix' });
    expect(oneOf(['pix'] as const)('PIX', 'm').ok).toBe(false);
    expect(uuid()('33333333-3333-4333-8333-333333333333', 'id').ok).toBe(true);
    expect(uuid()('1; drop table', 'id').ok).toBe(false);
    expect(email()(' A@B.com ', 'e')).toEqual({ ok: true, value: 'a@b.com' });
    expect(email()('a@b', 'e').ok).toBe(false);
    expect(postalCode()('01310-100', 'cep')).toEqual({ ok: true, value: '01310100' });
    expect(isoDate()('2026-02-30', 'd').ok).toBe(false);
    expect(isoDate()('2026-02-28', 'd').ok).toBe(true);
  });

  it('collects every field error in objects and drops undefined optionals', () => {
    const Body = object({ a: string(), b: optional(int()), c: object({ d: boolean() }) });
    expect(parse(Body, { a: 'x', c: { d: true } })).toEqual({ ok: true, value: { a: 'x', c: { d: true } } });
    const bad = parse(Body, { b: 'x', c: {} });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toEqual(['a: texto obrigatório', 'b: número inteiro obrigatório', 'c.d: verdadeiro ou falso']);
    expect(parse(Body, []).ok).toBe(false);
  });
});

describe('dates', () => {
  it('uses the São Paulo calendar day', () => {
    expect(saoPauloDate(new Date('2026-10-20T02:30:00Z'))).toBe('2026-10-19');
    expect(saoPauloDate(new Date('2026-10-20T03:30:00Z'))).toBe('2026-10-20');
  });

  it('adds days and months, clamping month ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(() => addDays('2026-13-01', 1)).toThrow();
    expect(isIsoDate('2026-1-1')).toBe(false);
  });

  it('formats date and time for messages', () => {
    expect(formatDateTimeBR('2026-10-20T13:00:00Z')).toBe('20/10/2026 às 10:00');
  });

  it('reads the lower bound of a tstzrange', () => {
    expect(rangeStart('["2026-10-20 13:00:00+00","2026-10-20 14:00:00+00")')).toBe('2026-10-20 13:00:00+00');
    expect(rangeStart('nope')).toBeNull();
  });
});

describe('subscription periods', () => {
  it('keeps Pro until the paid period ends after a cancellation', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    expect(planAfterCancel('2026-11-01T00:00:00Z', now)).toBe('pro');
    expect(planAfterCancel('2026-10-01T00:00:00Z', now)).toBe('free');
    expect(planAfterCancel(null, now)).toBe('free');
    expect(planAfterCancel('garbage', now)).toBe('free');
  });

  it('ends the period one month after the due date', () => {
    expect(periodEndFrom('2026-10-19', '2026-01-01')).toBe('2026-11-19T23:59:59-03:00');
    expect(periodEndFrom(undefined, '2026-01-31')).toBe('2026-02-28T23:59:59-03:00');
  });
});
