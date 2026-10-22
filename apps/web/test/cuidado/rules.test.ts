import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError, toAppError } from '../../lib/errors';
import {
  careCode,
  careError,
  checkinWindow,
  findHealthTerm,
} from '../../services/care';
import { offersSummary, parseReaisToCents, toShiftPeriod } from '../../components/cuidado/format';

const dbRule = (message: string) => ({ code: 'P0001', message, details: null, hint: null });

describe('health data guard', () => {
  it.each([
    ['Toma o remédio das 8h', 'remédio'],
    ['Faz uso de medicamento controlado', 'medicamento'],
    ['Diagnóstico de Alzheimer', 'diagnóstico'],
    ['tomar 500 mg de manhã', 'dose'],
    ['Aplicar INSULINA antes do almoço', 'insulina'],
    ['Teve febre ontem', 'febre'],
    ['pressão alta', 'pressão arterial'],
    ['precisa levar o exame', 'exame'],
    ['CID-10 F03', 'CID'],
  ])('stops %j', (text, term) => {
    expect(findHealthTerm(text)).toBe(term);
  });

  it.each(['Gosta de rádio de manhã', 'Almoçou bem e fez caminhada no jardim', 'Humor: animada', 'Falar com o Cid na portaria', 'Mora na Rua das Flores'])(
    'lets %j through',
    text => {
      expect(findHealthTerm(text)).toBeNull();
    },
  );

  it('looks at every text and ignores empty ones', () => {
    expect(findHealthTerm(null, undefined, '', 'tudo bem', 'sintomas leves')).toBe('sintoma');
    expect(findHealthTerm(null, '')).toBeNull();
  });
});

describe('care errors', () => {
  it('translates the rules lib/errors does not know', () => {
    expect(careError(dbRule('checkin_window')).message).toMatch(/2 horas antes a 2 horas depois do início/);
    expect(careError(dbRule('offer_limit')).message).toMatch(/no máximo 10 cuidadores por plantão e 30 ofertas novas por dia/);
  });

  it('lets an operation say what a rule means for it', () => {
    const error = careError(dbRule('not_allowed'), { not_allowed: 'Só o cuidador designado.' });
    expect(error.message).toBe('Só o cuidador designado.');
    expect(error.code).toBe('not_allowed');
  });

  it('keeps the shared sentence of rules it has no override for, and labor_lock untouched', () => {
    expect(careError(dbRule('invalid_transition')).message).toBe(toAppError(dbRule('invalid_transition')).message);
    const lock = careError(dbRule('labor_lock'), { not_allowed: 'x' });
    expect(lock.code).toBe('labor_lock');
    expect(lock.message).toBe(toAppError(dbRule('labor_lock')).message);
  });

  it('reads the raw code, also when it is followed by detail', () => {
    expect(careCode(dbRule('checkin_window'))).toBe('checkin_window');
    expect(careCode(dbRule('labor_lock: 3 days'))).toBe('labor_lock');
    expect(careCode(new AppError('offline'))).toBeNull();
  });
});

describe('check-in window (mirrors check_in)', () => {
  const period = { start: new Date('2030-01-15T11:00:00Z'), end: new Date('2030-01-15T23:00:00Z') };
  const at = (iso: string) => new Date(iso);

  it('is open from 2 hours before to 2 hours after the start for the check-in', () => {
    expect(checkinWindow(period, 'in', at('2030-01-15T09:00:00Z')).state).toBe('open');
    expect(checkinWindow(period, 'in', at('2030-01-15T08:59:59Z')).state).toBe('early');
    expect(checkinWindow(period, 'in', at('2030-01-15T13:00:00Z')).state).toBe('open');
    expect(checkinWindow(period, 'in', at('2030-01-15T13:00:01Z')).state).toBe('late');
  });

  it('is anchored on the end for the check-out', () => {
    const window = checkinWindow(period, 'out', at('2030-01-15T22:00:00Z'));
    expect(window.state).toBe('open');
    expect(window.opensAt.toISOString()).toBe('2030-01-15T21:00:00.000Z');
    expect(window.closesAt.toISOString()).toBe('2030-01-16T01:00:00.000Z');
    expect(checkinWindow(period, 'out', at('2030-01-15T20:59:00Z')).state).toBe('early');
  });
});

describe('shift period typed in São Paulo time', () => {
  // The device is far from Brasília: the typed times must still be São Paulo time
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Tokyo';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('turns 08:00-20:00 into 11:00-23:00 UTC', () => {
    const period = toShiftPeriod('2030-01-15', '08:00', '20:00');
    expect(period?.start.toISOString()).toBe('2030-01-15T11:00:00.000Z');
    expect(period?.end.toISOString()).toBe('2030-01-15T23:00:00.000Z');
  });

  it('ends a night shift on the next day', () => {
    const period = toShiftPeriod('2030-01-15', '19:00', '07:00');
    expect(period?.start.toISOString()).toBe('2030-01-15T22:00:00.000Z');
    expect(period?.end.toISOString()).toBe('2030-01-16T10:00:00.000Z');
  });

  it('rejects missing or malformed values', () => {
    expect(toShiftPeriod('', '08:00', '20:00')).toBeNull();
    expect(toShiftPeriod('2030-01-15', '', '20:00')).toBeNull();
    expect(toShiftPeriod('2030-02-31', '08:00', '20:00')).toBeNull();
  });
});

describe('values and summaries', () => {
  it('reads reais as cents without rounding a typo', () => {
    expect(parseReaisToCents('280')).toBe(28000);
    expect(parseReaisToCents('R$ 1.234,50')).toBe(123450);
    expect(parseReaisToCents('280,555')).toBeNull();
    expect(parseReaisToCents('-5')).toBeNull();
    expect(parseReaisToCents('')).toBeNull();
  });

  it('summarizes the offers of a shift', () => {
    const offer = (status: 'offered' | 'accepted' | 'declined' | 'expired', n: number) => ({
      shift_id: 's',
      provider_id: `p${n}`,
      status,
      created_at: '',
    });
    expect(offersSummary([])).toBe('Nenhuma oferta enviada');
    expect(offersSummary([offer('offered', 1)])).toBe('1 oferta: 1 aguardando resposta');
    expect(offersSummary([offer('offered', 1), offer('declined', 2), offer('expired', 3)])).toBe(
      '3 ofertas: 1 aguardando resposta, 1 recusou, 1 expirou',
    );
  });
});
