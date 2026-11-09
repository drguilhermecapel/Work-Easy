import { describe, expect, it } from 'vitest';
import {
  addDays,
  centsToInput,
  dayRange,
  formatDaysBR,
  formatPeriodBR,
  monthStartSaoPaulo,
  parseCpfCnpj,
  parseReaisToCents,
  toPeriod,
  weekRange,
  weekdayOf,
} from '../../services/proFormat';
import { quoteShareText, quoteShareUrl, quoteTotalCents, quoteWhatsAppUrl } from '../../services/quotes';
import { reviewUrl, reviewWhatsAppUrl } from '../../services/proAgenda';
import { centsToReais, clientsCsv, paymentsCsv, toCsv } from '../../services/proExport';
import { proposalAllowance } from '../../services/proMarketplace';
import { NFSE_HELP, NFSE_ISSUER_URL } from '../../services/proNfse';
import { slugify } from '../../services/providers';
import { canRemoveDocument, computePendencies, requiredSteps, summarizeSteps } from '../../components/pro/pendencies';
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

  it('allows removing a document only while the registration is a draft and the document is unreviewed', () => {
    expect(canRemoveDocument(provider, doc('documento_selfie', 'submitted'))).toBe(true);
    for (const status of ['pending_review', 'approved', 'suspended'] as const) {
      expect(canRemoveDocument({ status }, doc('documento_selfie', 'submitted'))).toBe(false);
    }
    expect(canRemoveDocument(provider, doc('documento_selfie', 'accepted'))).toBe(false);
    expect(canRemoveDocument(provider, doc('documento_selfie', 'rejected', 'Ilegível'))).toBe(false);
  });

  it('asks to submit once every document is in, and has nothing left when approved and complete', () => {
    const documents = (['documento_selfie', 'cadastro_fiscal', 'antecedentes'] as const).map(step => doc(step, 'submitted'));
    const base = { occupations, policies, documents, neighborhoodCount: 2, services: [{ active: true }], availabilityCount: 3 };
    expect(computePendencies({ ...base, provider }).map(item => item.id)).toEqual(['submit']);
    expect(computePendencies({ ...base, provider: { ...provider, status: 'approved' } })).toEqual([]);
  });
});

describe('the São Paulo month', () => {
  it('starts at 00:00 of the first day, São Paulo time', () => {
    expect(monthStartSaoPaulo(new Date('2026-10-22T15:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  it('keeps the old month until São Paulo midnight, not UTC midnight', () => {
    expect(monthStartSaoPaulo(new Date('2026-11-01T02:59:59Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(monthStartSaoPaulo(new Date('2026-11-01T03:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});

describe('free proposal allowance', () => {
  const now = new Date('2026-10-22T15:00:00Z');
  const proposals = [
    { created_at: '2026-10-01T02:59:59Z' }, // 30/09 23:59:59 in São Paulo: last month
    { created_at: '2026-10-01T03:00:00Z' }, // 01/10 00:00 in São Paulo: this month
    { created_at: '2026-10-20T12:00:00Z' },
  ];

  it('counts the proposals created since the first day of the month in São Paulo', () => {
    expect(proposalAllowance({ plan: 'free', limit: 5, proposals, now })).toEqual({ kind: 'limited', limit: 5, used: 2 });
  });

  it('is 0 of N when nothing was sent this month', () => {
    expect(proposalAllowance({ plan: 'free', limit: 5, proposals: [], now })).toEqual({ kind: 'limited', limit: 5, used: 0 });
  });

  it('has no limit on the Pro plan, whatever was sent', () => {
    expect(proposalAllowance({ plan: 'pro', limit: 5, proposals, now })).toEqual({ kind: 'unlimited' });
    expect(proposalAllowance({ plan: 'pro', limit: null, proposals: [], now })).toEqual({ kind: 'unlimited' });
  });

  it('says nothing when the limit is unknown: no number is made up', () => {
    expect(proposalAllowance({ plan: 'free', limit: null, proposals, now })).toBeNull();
  });
});

describe('CSV exports', () => {
  it('starts with a byte order mark and uses ";" and CRLF, as Excel in Brazil expects', () => {
    expect(toCsv(['Nome', 'Valor (R$)'], [['Ana', '150,00']])).toBe('﻿Nome;Valor (R$)\r\nAna;150,00\r\n');
    expect(centsToReais(15000)).toBe('150,00');
    expect(centsToReais(5)).toBe('0,05');
  });

  it('quotes cells that hold the separator, quotes or line breaks', () => {
    const csv = toCsv(['A'], [['x;y'], ['diz "oi"'], ['linha\noutra'], [null], [7]]);
    expect(csv).toContain('\r\n"x;y"\r\n');
    expect(csv).toContain('\r\n"diz ""oi"""\r\n');
    expect(csv).toContain('\r\n"linha\noutra"\r\n');
    expect(csv.endsWith('\r\n\r\n7\r\n')).toBe(true);
  });

  it('defuses cells a spreadsheet would run as a formula', () => {
    const csv = toCsv(['A'], [['=HYPERLINK("http://x")'], ['+5511'], ['-1'], ['@soma'], ['normal']]);
    expect(csv).toContain('\r\n"\'=HYPERLINK(""http://x"")"\r\n');
    expect(csv).toContain("\r\n'+5511\r\n");
    expect(csv).toContain("\r\n'-1\r\n");
    expect(csv).toContain("\r\n'@soma\r\n");
    expect(csv).toContain('\r\nnormal\r\n');
  });

  it('writes the charges with the texts of the screen', () => {
    const csv = paymentsCsv(
      [
        {
          id: 'p1', booking_id: 'b1', quote_id: null, method: 'pix', amount_cents: 15000, platform_fee_cents: 0, status: 'received',
          invoice_url: null, pix_qr_code: null, pix_payload: null, due_date: '2030-01-16', created_at: '2030-01-15T15:00:00Z',
        },
        {
          id: 'p2', booking_id: null, quote_id: 'q1', method: 'boleto', amount_cents: 123456, platform_fee_cents: 1200, status: 'pending',
          invoice_url: null, pix_qr_code: null, pix_payload: null, due_date: null, created_at: '2030-01-16T02:30:00Z',
        },
      ],
      { method: { pix: 'Pix', boleto: 'Boleto' }, status: { received: 'Recebido', pending: 'Aguardando pagamento' } },
    );
    expect(csv).toBe(
      '﻿Criada em;Origem;Forma de pagamento;Valor (R$);Situação;Vencimento;Taxa da plataforma (R$)\r\n' +
        '15/01/2030;Atendimento;Pix;150,00;Recebido;16/01/2030;0,00\r\n' +
        // 02:30 UTC is still the 15th in São Paulo
        '15/01/2030;Orçamento;Boleto;1234,56;Aguardando pagamento;;12,00\r\n',
    );
  });

  it('writes the clients with contact data only, never the private notes', () => {
    const csv = clientsCsv([
      { id: 'c1', client_id: null, name: 'Carlos Dias', phone: '+5511987654321', email: 'carlos@example.com', notes: 'Prefere de manhã', origin: 'own', created_at: '2026-10-01T12:00:00Z' },
      { id: 'c2', client_id: 'u1', name: '=cmd|calc', phone: null, email: null, notes: null, origin: 'platform', created_at: '2026-10-02T12:00:00Z' },
    ]);
    expect(csv).toBe(
      '﻿Nome;Celular;E-mail;Origem;Cadastrado em\r\n' +
        'Carlos Dias;(11) 98765-4321;carlos@example.com;Cliente próprio;01/10/2026\r\n' +
        "'=cmd|calc;;;Veio pelo WorkEasy;02/10/2026\r\n",
    );
    expect(csv).not.toContain('Prefere');
  });
});

describe('review link', () => {
  it('sends the client to the booking page, where the review form is', () => {
    expect(reviewUrl('b-1')).toMatch(/\/atendimentos\/b-1$/);
  });

  it('opens WhatsApp with the message ready and no number, so the provider picks the chat', () => {
    const href = reviewWhatsAppUrl('b-1', 'Marta');
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const text = decodeURIComponent(href.split('?text=')[1]);
    expect(text).toContain('Olá, Marta!');
    expect(text).toContain(reviewUrl('b-1'));
    expect(decodeURIComponent(reviewWhatsAppUrl('b-1', null).split('?text=')[1])).toMatch(/^Olá! /);
  });
});

describe('NFS-e shortcut', () => {
  it('points to the national issuer and says the app does not issue invoices', () => {
    expect(NFSE_ISSUER_URL).toBe('https://www.nfse.gov.br/EmissorNacional');
    expect(NFSE_HELP).toContain('O WorkEasy não emite nota fiscal');
    expect(NFSE_HELP).toContain('MEI');
  });
});
