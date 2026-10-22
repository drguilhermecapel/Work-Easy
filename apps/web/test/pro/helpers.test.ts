import { describe, expect, it } from 'vitest';
import {
  addDays,
  centsToInput,
  dayRange,
  formatDaysBR,
  formatPeriodBR,
  parseCpfCnpj,
  parseReaisToCents,
  toPeriod,
  weekRange,
  weekdayOf,
} from '../../services/proFormat';
import { quoteShareText, quoteShareUrl, quoteTotalCents, quoteWhatsAppUrl } from '../../services/quotes';
import { slugify } from '../../services/providers';
import { computePendencies, requiredSteps, summarizeSteps } from '../../components/pro/pendencies';
import { AppError } from '../../lib/errors';
import type { VerificationStep } from '../../catalog/types';

describe('money typed in reais', () => {
  it('turns what people type into integer cents', () => {
    expect(parseReaisToCents('150')).toBe(15000);
    expect(parseReaisToCents('150,5')).toBe(15050);
    expect(parseReaisToCents('1.234,56')).toBe(123456);
    expect(parseReaisToCents('R$ 99,90')).toBe(9990);
    expect(parseReaisToCents('0,01')).toBe(1);
  });

  it('refuses what it would have to guess', () => {
    for (const text of ['', 'abc', '-5', '10,999', '1.5', '150.00', '1,2,3']) expect(parseReaisToCents(text)).toBeNull();
  });

  it('fills an input from cents', () => {
    expect(centsToInput(15000)).toBe('150,00');
    expect(centsToInput(5)).toBe('0,05');
  });
});

describe('São Paulo days and weeks', () => {
  it('knows the weekday and adds days across a month end', () => {
    expect(weekdayOf('2026-10-22')).toBe(4); // Thursday
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-22', -3)).toBe('2026-10-19');
  });

  it('builds a day as [00:00, next 00:00) in São Paulo time', () => {
    const { start, end } = dayRange('2026-10-22');
    expect(start.toISOString()).toBe('2026-10-22T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-23T03:00:00.000Z');
  });

  it('builds the ISO week from Monday, also when the day is a Sunday', () => {
    expect(weekRange('2026-10-22').start.toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(weekRange('2026-10-22').end.toISOString()).toBe('2026-10-26T03:00:00.000Z');
    expect(weekRange('2026-10-25').start.toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(weekRange('2026-10-19').start.toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });

  it('reads typed times as São Paulo time and rejects an end before the start', () => {
    const period = toPeriod('2030-01-15', '09:00', '11:30');
    expect(period.start.toISOString()).toBe('2030-01-15T12:00:00.000Z');
    expect(period.end.toISOString()).toBe('2030-01-15T14:30:00.000Z');
    expect(() => toPeriod('2030-01-15', '11:00', '09:00')).toThrow(AppError);
    expect(() => toPeriod('', '09:00', '10:00')).toThrow(AppError);
  });

  it('shows periods and whole days in São Paulo time', () => {
    expect(formatPeriodBR(toPeriod('2030-01-15', '09:00', '11:30'))).toBe('15/01/2030, 09:00 às 11:30');
    const days = { start: dayRange('2030-01-15').start, end: dayRange('2030-01-17').end };
    expect(formatDaysBR(days)).toBe('15/01/2030 a 17/01/2030');
    expect(formatDaysBR(dayRange('2030-01-15'))).toBe('15/01/2030');
  });
});

describe('CPF and CNPJ', () => {
  it('accepts valid numbers, with or without punctuation', () => {
    expect(parseCpfCnpj('529.982.247-25')).toBe('52998224725');
    expect(parseCpfCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('rejects wrong check digits and repeated digits', () => {
    expect(parseCpfCnpj('529.982.247-24')).toBeNull();
    expect(parseCpfCnpj('111.111.111-11')).toBeNull();
    expect(parseCpfCnpj('123')).toBeNull();
  });
});

describe('quotes', () => {
  const items = [
    { description: 'Pintura', quantity: 2.5, unit_price_cents: 8000 },
    { description: 'Tinta', quantity: 1, unit_price_cents: 12050 },
  ];
  const quote = { title: 'Pintura da sala', client_name: 'Carlos', client_phone: '+5511987654321', total_cents: 32050, public_token: 'tok-1' };

  it('previews the total like the server: quantity x unit price, rounded per item', () => {
    expect(quoteTotalCents(items)).toBe(32050);
    expect(quoteTotalCents([{ description: 'x', quantity: 0.333, unit_price_cents: 100 }])).toBe(33);
    expect(quoteTotalCents([])).toBe(0);
    // the database rounds exact decimals: 2.675 x 1.00 is 267.5 cents there, 267.49999999999994 in floating point
    expect(quoteTotalCents([{ description: 'x', quantity: 2.675, unit_price_cents: 100 }])).toBe(268);
    expect(quoteTotalCents([{ description: 'x', quantity: 1.005, unit_price_cents: 100 }])).toBe(101);
    expect(quoteTotalCents([{ description: 'x', quantity: 3, unit_price_cents: 0 }])).toBe(0);
  });

  it('shares the public link and a WhatsApp text', () => {
    expect(quoteShareUrl('tok-1')).toMatch(/\/orcamento\/tok-1$/);
    expect(quoteShareText(quote)).toContain('Pintura da sala');
    expect(quoteShareText(quote)).toContain('R$');
    const url = quoteWhatsAppUrl(quote);
    expect(url).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
    expect(decodeURIComponent(url)).toContain('/orcamento/tok-1');
    // Without a phone the user picks the contact
    expect(quoteWhatsAppUrl({ ...quote, client_phone: null })).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

describe('page address', () => {
  it('suggests a valid slug from the name', () => {
    expect(slugify('Ana Souza — Eletricista')).toBe('ana-souza-eletricista');
    expect(slugify('  João & Cia  ')).toBe('joao-cia');
    expect(slugify('')).toBe('');
  });
});

describe('registration pendencies', () => {
  const policy = {
    slug: 'diarista',
    verification: ['documento_selfie', 'cadastro_fiscal', 'antecedentes'] as const,
    priceUnits: ['dia' as const],
    laborLock: true,
    regulated: false,
    registryName: '',
    regulatorBody: '',
    requiresRegistry: false,
  };
  const policies = { diarista: { ...policy, verification: [...policy.verification] } };
  const occupations = [{ occupation_slug: 'diarista', is_primary: true, registry_number: null, registry_uf: null, registry_status: 'not_required' as const, approved: false }];
  const provider = {
    id: 'p',
    display_name: 'Ana',
    slug: 'ana',
    bio: null,
    avatar_path: null,
    status: 'draft' as const,
    plan: 'free' as const,
    base_neighborhood_id: null,
    accepts_platform_requests: true,
    created_at: '2026-10-01T00:00:00Z',
  };
  const doc = (step: VerificationStep, status: 'submitted' | 'accepted' | 'rejected', reason: string | null = null) => ({
    id: `${step}-${status}`,
    step,
    storage_path: `p/${step}.pdf`,
    status,
    rejection_reason: reason,
    expires_at: null,
    created_at: '2026-10-02T00:00:00Z',
  });

  it('lists the steps of the policies of all occupations once', () => {
    const steps = requiredSteps([...occupations, { occupation_slug: 'outra' }], { ...policies, outra: { ...policy, slug: 'outra', verification: ['cnh', 'documento_selfie'] } });
    expect(steps).toEqual(['documento_selfie', 'cadastro_fiscal', 'antecedentes', 'cnh']);
  });

  it('ranks accepted over submitted over rejected, as the database counts them', () => {
    const summary = summarizeSteps(
      ['documento_selfie', 'cadastro_fiscal', 'antecedentes', 'cnh'],
      [doc('documento_selfie', 'rejected', 'Foto escura'), doc('documento_selfie', 'submitted'), doc('cadastro_fiscal', 'rejected', 'Ilegível'), doc('antecedentes', 'accepted')],
    );
    expect(summary.map(item => item.state)).toEqual(['submitted', 'rejected', 'accepted', 'missing']);
    expect(summary[1].rejectionReason).toBe('Ilegível');
  });

  it('points to what is missing, with the reason of a rejection', () => {
    const list = computePendencies({
      provider,
      occupations,
      policies,
      documents: [doc('documento_selfie', 'submitted'), doc('cadastro_fiscal', 'rejected', 'Ilegível')],
      neighborhoodCount: 0,
      services: [],
      availabilityCount: 0,
    });
    const text = list.map(item => item.text).join('\n');
    expect(text).toContain('Envie os documentos: Certidão de antecedentes criminais');
    expect(text).toContain('Documento recusado (CPF ou CNPJ');
    expect(text).toContain('Ilegível');
    expect(text).toContain('bairros');
    expect(text).toContain('serviço');
    expect(text).toContain('dias e horários');
    expect(text).not.toContain('Envie o cadastro para análise');
  });

  it('asks to submit once every document is in, and has nothing left when approved and complete', () => {
    const documents = (['documento_selfie', 'cadastro_fiscal', 'antecedentes'] as const).map(step => doc(step, 'submitted'));
    const base = { occupations, policies, documents, neighborhoodCount: 2, services: [{ active: true }], availabilityCount: 3 };
    expect(computePendencies({ ...base, provider }).map(item => item.id)).toEqual(['submit']);
    expect(computePendencies({ ...base, provider: { ...provider, status: 'approved' } })).toEqual([]);
  });
});
