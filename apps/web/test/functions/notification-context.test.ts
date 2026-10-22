// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { handler as dispatch, type NotifyDeps } from '../../supabase/functions/notify-dispatch/handler.ts';
import { type LookupDb, notificationContext } from '../../supabase/functions/_shared/notification-context.ts';
import { type NotificationRow, type NotificationUpdate, resolveParams } from '../../supabase/functions/_shared/notifications.ts';
import { baseDeps, fakeFetch, post } from './helpers.ts';

// Rows as the triggers of 08_notifications.sql / 09_care.sql write them
const CLIENT = 'c0000000-0000-4000-8000-000000000001';
const PROVIDER_ID = 'a0000000-0000-4000-8000-000000000002';

const TABLES: Record<string, Record<string, Record<string, unknown>>> = {
  occupations: { eletricista: { name: 'Eletricista' } },
  requests: { r1: { occupation_slug: 'eletricista' } },
  bookings: {
    b1: { client_id: CLIENT, provider_id: PROVIDER_ID, provider_client_id: null, occupation_slug: 'eletricista' },
    b2: { client_id: null, provider_id: PROVIDER_ID, provider_client_id: 'pc1', occupation_slug: 'eletricista' },
  },
  profiles: { [CLIENT]: { full_name: 'Ana Souza' } },
  providers: { [PROVIDER_ID]: { display_name: 'Beto Elétrica' } },
  provider_clients: { pc1: { name: 'Dona Lúcia' } },
  payments: { p1: { payer_id: CLIENT, booking_id: 'b1', quote_id: null }, p2: { payer_id: null, booking_id: 'b2', quote_id: null }, p3: { payer_id: null, booking_id: null, quote_id: 'q1' } },
  quotes: { q1: { client_name: 'Sr. Paulo' } },
  shifts: { s1: { household_id: 'h1' } },
  households: { h1: { neighborhood_id: 'n1' } },
  neighborhoods: { n1: { name: 'Pinheiros' } },
};

const db: LookupDb = { one: async (table, _select, _column, value) => TABLES[table]?.[value] ?? null };

describe('notification context', () => {
  it('completes proposta_recebida with the occupation of the request', async () => {
    expect(await notificationContext({ template: 'proposta_recebida', user_id: CLIENT, params: { request_id: 'r1' } }, db))
      .toEqual({ occupation_name: 'Eletricista' });
  });

  it('names the other party from the point of view of each recipient', async () => {
    const params = { booking_id: 'b1', starts_at: '2026-10-20T13:00:00Z', occupation_slug: 'eletricista', provider_name: 'Beto Elétrica' };
    expect(await notificationContext({ template: 'atendimento_confirmado', user_id: CLIENT, params }, db))
      .toEqual({ occupation_name: 'Eletricista', other_party_name: 'Beto Elétrica' });
    expect(await notificationContext({ template: 'lembrete_atendimento', user_id: PROVIDER_ID, params }, db))
      .toEqual({ occupation_name: 'Eletricista', other_party_name: 'Ana Souza' });
    // own client without an account: the provider's CRM name
    expect(await notificationContext({ template: 'atendimento_confirmado', user_id: PROVIDER_ID, params: { ...params, booking_id: 'b2' } }, db))
      .toEqual({ occupation_name: 'Eletricista', other_party_name: 'Dona Lúcia' });
  });

  it('finds the payer by account, quote or CRM entry', async () => {
    const ask = (payment_id: string) => notificationContext({ template: 'pagamento_recebido', user_id: PROVIDER_ID, params: { payment_id } }, db);
    expect(await ask('p1')).toEqual({ client_name: 'Ana Souza' });
    expect(await ask('p2')).toEqual({ client_name: 'Dona Lúcia' });
    expect(await ask('p3')).toEqual({ client_name: 'Sr. Paulo' });
  });

  it('finds the neighborhood of the shift and leaves out what does not exist', async () => {
    expect(await notificationContext({ template: 'plantao_oferecido', user_id: PROVIDER_ID, params: { shift_id: 's1' } }, db))
      .toEqual({ neighborhood_name: 'Pinheiros' });
    expect(await notificationContext({ template: 'plantao_oferecido', user_id: PROVIDER_ID, params: { shift_id: 'gone' } }, db)).toEqual({});
    expect(await notificationContext({ template: 'orcamento_respondido', user_id: PROVIDER_ID, params: {} }, db)).toEqual({});
  });
});

describe('resolveParams', () => {
  it('maps the quote trigger names to the template names and prefers params over context', () => {
    expect(resolveParams('orcamento_respondido', { title: 'Pintura', status: 'accepted', client_name: 'x' }))
      .toEqual({ quote_title: 'Pintura', response: 'accepted' });
    expect(resolveParams('pagamento_recebido', { amount_cents: 100, client_name: 'Da trigger' }, { client_name: 'Do banco' }))
      .toEqual({ amount_cents: 100, client_name: 'Da trigger' });
    expect(resolveParams('pagamento_recebido', [100, 'Ana'])).toEqual([100, 'Ana']);
  });
});

describe('notify-dispatch with the parameters the database triggers write', () => {
  const wa = { token: 'wa', phoneNumberId: '1', graphVersion: 'v26.0' };
  const row = (over: Partial<NotificationRow>): NotificationRow => ({
    id: 'n1', user_id: PROVIDER_ID, phone: '11987654321', email: null, channel: 'whatsapp', template: 'pagamento_recebido',
    params: {}, attempts: 1, ...over,
  });

  async function run(rows: NotificationRow[]) {
    const updates: Array<[string, NotificationUpdate]> = [];
    const { fetch, calls } = fakeFetch({ 'POST /v26.0/1/messages': { body: { messages: [{ id: 'wamid' }] } } });
    const deps: NotifyDeps = {
      ...baseDeps,
      cronSecret: 'secret',
      whatsapp: wa,
      email: { resendApiKey: undefined, from: undefined },
      fetch,
      store: {
        claim: async () => rows,
        update: async (id, patch) => void updates.push([id, patch]),
        context: r => notificationContext(r, db),
      },
    };
    await dispatch(post('notify-dispatch', {}, { 'x-cron-secret': 'secret' }), deps);
    return { updates, calls };
  }

  const texts = (call: { body: unknown }) =>
    (call.body as { template: { components: Array<{ parameters: Array<{ text: string }> }> } }).template.components[0].parameters.map(p => p.text);

  it('sends every template from trigger-shaped params instead of failing them as invalid_params', async () => {
    const { updates, calls } = await run([
      row({ id: 'a', user_id: CLIENT, template: 'proposta_recebida', params: { request_id: 'r1', proposal_id: 'x', provider_name: 'Beto', price_cents: 15000 } }),
      row({ id: 'b', user_id: PROVIDER_ID, template: 'atendimento_confirmado', params: { booking_id: 'b1', starts_at: '2026-10-20T13:00:00Z', occupation_slug: 'eletricista', provider_name: 'Beto Elétrica' } }),
      row({ id: 'c', user_id: CLIENT, template: 'lembrete_atendimento', params: { booking_id: 'b1', starts_at: '2026-10-20T13:00:00Z', occupation_slug: 'eletricista', provider_name: 'Beto Elétrica' } }),
      row({ id: 'd', template: 'pagamento_recebido', params: { payment_id: 'p1', booking_id: 'b1', quote_id: null, amount_cents: 15000 } }),
      row({ id: 'e', template: 'orcamento_respondido', params: { quote_id: 'q1', title: 'Pintura', status: 'declined', client_name: 'Sr. Paulo', total_cents: 5000 } }),
      row({ id: 'f', template: 'plantao_oferecido', params: { shift_id: 's1', starts_at: '2026-10-21T11:00:00Z', ends_at: '2026-10-21T19:00:00Z', payout_cents: 20000 } }),
    ]);
    expect(updates.map(([id, u]) => [id, u.status, u.error])).toEqual([
      ['a', 'sent', null], ['b', 'sent', null], ['c', 'sent', null], ['d', 'sent', null], ['e', 'sent', null], ['f', 'sent', null],
    ]);
    expect(texts(calls[0])).toEqual(['Beto', 'Eletricista', 'R$ 150,00']);
    expect(texts(calls[1])).toEqual(['Eletricista', '20/10/2026 às 10:00', 'Ana Souza']);
    expect(texts(calls[2])).toEqual(['Eletricista', '20/10/2026 às 10:00', 'Beto Elétrica']);
    expect(texts(calls[3])).toEqual(['R$ 150,00', 'Ana Souza']);
    expect(texts(calls[4])).toEqual(['Pintura', 'recusado']);
    expect(texts(calls[5])).toEqual(['21/10/2026 às 08:00', 'Pinheiros']);
  });

  it('fails once, without retrying, when the entity the params point to is gone', async () => {
    const { updates, calls } = await run([row({ template: 'plantao_oferecido', params: { shift_id: 'gone', starts_at: '2026-10-21T11:00:00Z' } })]);
    expect(calls).toHaveLength(0);
    expect(updates[0][1]).toMatchObject({ status: 'failed' });
    expect(updates[0][1].error).toMatch(/^invalid_params: missing param neighborhood_name/);
  });

  it('retries when the lookup itself fails (database unavailable)', async () => {
    const updates: Array<[string, NotificationUpdate]> = [];
    const { fetch } = fakeFetch({});
    const deps: NotifyDeps = {
      ...baseDeps,
      cronSecret: 'secret',
      whatsapp: wa,
      email: { resendApiKey: undefined, from: undefined },
      fetch,
      store: {
        claim: async () => [row({ template: 'plantao_oferecido', params: { shift_id: 's1', starts_at: '2026-10-21T11:00:00Z' } })],
        update: async (id, patch) => void updates.push([id, patch]),
        context: async () => { throw new Error('database unavailable'); },
      },
    };
    await dispatch(post('notify-dispatch', {}, { 'x-cron-secret': 'secret' }), deps);
    expect(updates[0][1]).toMatchObject({ status: 'queued', error: 'internal' });
  });
});
