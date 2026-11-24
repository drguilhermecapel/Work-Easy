// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase } from '../web/fakeSupabase';
import { APP_REQUESTS, CRM_CLIENT_ID, RECEIVING_FORM } from './appRequests.ts';
import { BOOKING_ID, QUOTE_ID } from './helpers.ts';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { createCharge: createOwnCharge } = await import('../../services/charges');
const { createCharge: payBooking } = await import('../../services/payments');
const { subscribePro, cancelPro, activateReceiving } = await import('../../services/proBilling');
const { deleteMyAccount, DELETE_CONFIRMATION } = await import('../../services/account');
const fake = supabase as unknown as FakeSupabase;

/**
 * APP_REQUESTS (appRequests.ts) is what app-requests-handlers.test.ts hands to the real handlers, in
 * vitest and in Deno. This file keeps it honest: each body there is the one the app's service builds
 * today. A change in a service fails here until APP_REQUESTS (and so the Deno run) follows it.
 */
async function sent(name: string, call: () => Promise<unknown>): Promise<unknown> {
  fake.functionsHandlers[name] = () => ({ data: { ok: true, data: {} }, error: null });
  await call();
  expect(fake.functionCalls).toHaveLength(1);
  expect(fake.functionCalls[0].name).toBe(name);
  return fake.functionCalls[0].body;
}

describe('APP_REQUESTS is what the app sends', () => {
  beforeEach(() => fake.reset());

  it('charges-create: own booking', async () => {
    const body = await sent('charges-create', () => createOwnCharge({ target: { kind: 'booking', id: BOOKING_ID }, method: 'pix', dueDate: '2030-01-16' }));
    expect(body).toEqual(APP_REQUESTS.chargeOwnBooking);
  });

  it('charges-create: quote with the CRM client picked (never a `customer`)', async () => {
    const body = await sent('charges-create', () =>
      createOwnCharge({ target: { kind: 'quote', id: QUOTE_ID }, method: 'boleto', providerClientId: CRM_CLIENT_ID, description: ' Pintura da sala ' }),
    );
    expect(body).toEqual(APP_REQUESTS.chargeQuote);
    expect(Object.keys(body as object)).not.toContain('customer');
  });

  it('payments-create', async () => {
    const body = await sent('payments-create', () => payBooking({ bookingId: BOOKING_ID, method: 'pix', cpfCnpj: '529.982.247-25' }));
    expect(body).toEqual(APP_REQUESTS.payBooking);
  });

  it('subscriptions-manage: subscribe and cancel', async () => {
    expect(await sent('subscriptions-manage', () => subscribePro({ method: 'boleto' }))).toEqual(APP_REQUESTS.subscribePro);
    fake.reset();
    expect(await sent('subscriptions-manage', () => cancelPro())).toEqual(APP_REQUESTS.cancelPro);
  });

  it('asaas-onboard', async () => {
    expect(await sent('asaas-onboard', () => activateReceiving(RECEIVING_FORM))).toEqual(APP_REQUESTS.activateReceiving);
  });

  it('account-delete', async () => {
    expect(await sent('account-delete', () => deleteMyAccount(DELETE_CONFIRMATION))).toEqual(APP_REQUESTS.deleteAccount);
  });
});
