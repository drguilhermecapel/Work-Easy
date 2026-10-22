import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { allowedNext, canStillDispute } = await import('../../services/bookings');
const { availableSlots, bookDirect, searchProviders } = await import('../../services/discovery');
const { createCharge } = await import('../../services/payments');
const { createReview } = await import('../../services/reviews');
const { getQuoteByToken, isQuoteToken, lineTotalCents, respondQuote } = await import('../../services/publicQuotes');
const fake = supabase as unknown as FakeSupabase;

describe('booking transitions by role', () => {
  it('follows docs/ARQUITETURA.md', () => {
    expect(allowedNext('provider', 'requested')).toEqual(['accepted', 'canceled']);
    expect(allowedNext('provider', 'paid')).toEqual(['in_progress']);
    expect(allowedNext('provider', 'in_progress')).toEqual(['completed']);
    expect(allowedNext('client', 'requested')).toEqual(['canceled']);
    expect(allowedNext('client', 'completed')).toEqual(['released', 'disputed']);
    expect(allowedNext('client', 'in_progress')).toEqual([]);
    expect(allowedNext('client', 'released')).toEqual([]);
    expect(allowedNext(null, 'requested')).toEqual([]);
  });

  it('closes the dispute 7 days after the end of the period', () => {
    const end = new Date('2030-01-15T17:00:00Z');
    const booking = { when: { start: new Date('2030-01-15T16:00:00Z'), end } };
    expect(canStillDispute(booking, end.getTime() + 7 * 86_400_000)).toBe(true);
    expect(canStillDispute(booking, end.getTime() + 7 * 86_400_000 + 1)).toBe(false);
    expect(canStillDispute({ when: null }, 0)).toBe(false);
  });
});

describe('discovery service', () => {
  beforeEach(() => fake.reset());

  it('parses the slots of available_slots', async () => {
    fake.rpcs.available_slots = () => ({
      data: ['["2030-01-15 12:00:00+00","2030-01-15 13:00:00+00")', 'lixo'],
      error: null,
    });
    const slots = await availableSlots('prov-1', '2030-01-15', 60);
    expect(slots).toHaveLength(1);
    expect(slots[0].start.toISOString()).toBe('2030-01-15T12:00:00.000Z');
    expect(slots[0].end.toISOString()).toBe('2030-01-15T13:00:00.000Z');
  });

  it('treats a missing answer as no results', async () => {
    expect(await searchProviders({ occupation: 'diarista' })).toEqual([]);
    expect(await availableSlots('prov-1', '2030-01-15', 60)).toEqual([]);
  });

  it('refuses an empty period before calling the database', async () => {
    const at = new Date('2030-01-15T12:00:00Z');
    await expect(bookDirect({ providerId: 'p', serviceId: 's', period: { start: at, end: at } })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(fake.rpcCalls).toEqual([]);
  });
});

describe('payments service', () => {
  beforeEach(() => fake.reset());

  it('keeps the functions error codes apart from their HTTP status', async () => {
    fake.functionsHandlers['payments-create'] = () => ({
      data: { ok: false, error: { code: 'booking_not_payable', message: 'x' } },
      error: null,
    });
    await expect(createCharge({ bookingId: 'b', method: 'pix' })).rejects.toThrow('Só atendimentos aceitos pelo profissional podem ser pagos.');
  });

  it('reads the code from the HTTP response of a failed invoke', async () => {
    const response = new Response(JSON.stringify({ ok: false, error: { code: 'provider_payment_account_missing', message: 'x' } }), { status: 409 });
    fake.functionsHandlers['payments-create'] = () => ({ data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context: response } });
    await expect(createCharge({ bookingId: 'b', method: 'pix' })).rejects.toThrow('ainda não ativou o recebimento pelo app');
  });

  it('never sends card data: only the booking, the method and the document', async () => {
    fake.functionsHandlers['payments-create'] = () => ({ data: { ok: true, data: { payment_id: 'p' } }, error: null });
    await createCharge({ bookingId: 'b', method: 'credit_card', cpfCnpj: '529.982.247-25' });
    expect(fake.functionCalls[0].body).toEqual({ booking_id: 'b', method: 'credit_card', cpf_cnpj: '52998224725' });
  });
});

describe('reviews service', () => {
  beforeEach(() => fake.reset());

  it('checks the rating and the comment before inserting', async () => {
    await expect(createReview({ bookingId: 'b', clientId: 'c', rating: 0 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(createReview({ bookingId: 'b', clientId: 'c', rating: 6 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(createReview({ bookingId: 'b', clientId: 'c', rating: 4.5 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(createReview({ bookingId: 'b', clientId: 'c', rating: 5, comment: 'x'.repeat(1001) })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(fake.tableCalls).toEqual([]);
  });
});

describe('public quotes service', () => {
  beforeEach(() => fake.reset());

  it('only accepts uuid tokens', () => {
    expect(isQuoteToken('8f3c1a2e-5b7d-4e19-9c60-1d2e3f4a5b6c')).toBe(true);
    expect(isQuoteToken('1; drop table quotes')).toBe(false);
  });

  it('does not call the database for a malformed token', async () => {
    expect(await getQuoteByToken('abc')).toBeNull();
    await expect(respondQuote('abc', true)).rejects.toMatchObject({ code: 'not_found' });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('totals a line with a fractional quantity in cents', () => {
    expect(lineTotalCents({ description: 'x', quantity: 1.5, unit_price_cents: 3333 })).toBe(5000);
    // same rounding as the database (numeric): 2.675 x 100 is 267.5 -> 268, not 267 as floating point gives
    expect(lineTotalCents({ description: 'x', quantity: 2.675, unit_price_cents: 100 })).toBe(268);
  });
});
