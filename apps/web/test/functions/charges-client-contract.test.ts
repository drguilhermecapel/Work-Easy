// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsaasClient } from '../../supabase/functions/_shared/asaas-client.ts';
import { type ChargesCreateDeps, handler as chargesCreate } from '../../supabase/functions/charges-create/handler.ts';
import type { FakeSupabase } from '../web/fakeSupabase';
import { baseDeps, BOOKING_ID, post, PROVIDER, QUOTE_ID, read } from './helpers.ts';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { createCharge } = await import('../../services/charges');
const fake = supabase as unknown as FakeSupabase;

const CLIENT_ID = '6f1c1d6e-1b0f-4a52-9a3c-0f5f6c6f0a11';

/**
 * The app and the function once disagreed on this request (the function took the payer from the
 * CRM and refused a `customer` object while the form kept sending one), and each side's tests only
 * checked its own half. This feeds the exact body the app builds to the real handler.
 *
 * The provider lookup answers "not a provider": a body the handler accepts gets as far as that
 * check (403 not_allowed); a body it rejects stops at the validation (400 invalid_input).
 */
const deps: ChargesCreateDeps = {
  ...baseDeps,
  asaas: {} as AsaasClient,
  session: async () => ({
    user: PROVIDER,
    getProvider: async () => null,
    getBooking: async () => null,
    getQuote: async () => null,
    getProviderClient: async () => null,
  }),
  admin: {} as ChargesCreateDeps['admin'],
};

const bodyOfApp = async (input: Parameters<typeof createCharge>[0]) => {
  fake.functionsHandlers['charges-create'] = () => ({ data: { ok: true, data: {} }, error: null });
  await createCharge(input);
  expect(fake.functionCalls).toHaveLength(1);
  return fake.functionCalls[0].body as Record<string, unknown>;
};

describe('charges-create: the request the app builds is the one the function accepts', () => {
  beforeEach(() => fake.reset());

  it('accepts a booking linked to a CRM client (no client named)', async () => {
    const body = await bodyOfApp({ target: { kind: 'booking', id: BOOKING_ID }, method: 'pix', dueDate: '2030-01-16' });
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.body.error.code).toBe('not_allowed');
  });

  it('accepts a quote charged to a CRM client picked by the provider', async () => {
    const body = await bodyOfApp({ target: { kind: 'quote', id: QUOTE_ID }, method: 'boleto', providerClientId: CLIENT_ID, description: 'x' });
    expect(body).toEqual({ quote_id: QUOTE_ID, method: 'boleto', provider_client_id: CLIENT_ID, description: 'x' });
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.body.error.code).toBe('not_allowed');
  });

  it('never carries the payer data (the function takes it from the CRM and refuses it otherwise)', async () => {
    const body = await bodyOfApp({ target: { kind: 'booking', id: BOOKING_ID }, method: 'pix', providerClientId: CLIENT_ID });
    expect(Object.keys(body)).not.toContain('customer');
    // Control: the old shape is still refused by the function
    const old = await read(await chargesCreate(post('charges-create', { ...body, customer: { cpf_cnpj: '52998224725', name: 'Carlos' } }), deps));
    expect(old.status).toBe(400);
    expect(old.body.error.code).toBe('invalid_input');
  });
});
