// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { NotificationRow, NotificationUpdate } from '../../supabase/functions/_shared/notifications.ts';
import type { BookingStatus, PaymentStatus } from '../../supabase/functions/_shared/types.ts';
import {
  handler as webhook, type StoredPayment, type StoredSubscription, type WebhookDeps,
} from '../../supabase/functions/asaas-webhook/handler.ts';
import { handler as dispatch, type NotifyDeps } from '../../supabase/functions/notify-dispatch/handler.ts';
import { baseDeps, BOOKING_ID, fakeFetch, PROVIDER, read } from './helpers.ts';

const TOKEN = 'webhook-token-0123456789abcdef0123456789';

function hook(body: unknown, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers['asaas-access-token'] = token;
  return new Request('http://localhost/functions/v1/asaas-webhook', { method: 'POST', headers, body: JSON.stringify(body) });
}

function webhookDeps(over: {
  processed?: boolean;
  payment?: StoredPayment | null;
  booking?: BookingStatus | null;
  subscription?: StoredSubscription | null;
  transitionError?: Error;
  token?: string;
} = {}) {
  const log = {
    events: [] as unknown[],
    processed: [] as Array<[string, string | null]>,
    paymentUpdates: [] as Array<[string, { status?: PaymentStatus }]>,
    transitions: [] as Array<[string, BookingStatus]>,
    subscriptions: [] as unknown[],
    plans: [] as string[],
    audits: [] as unknown[],
  };
  const deps: WebhookDeps = {
    ...baseDeps,
    webhookToken: 'token' in over ? over.token : TOKEN,
    store: {
      recordEvent: async event => {
        log.events.push(event);
        return { id: 'evrow-1', processed: over.processed ?? false };
      },
      markProcessed: async (id, paymentId) => void log.processed.push([id, paymentId]),
      findPayment: async () =>
        over.payment === undefined
          ? { id: 'payrow-1', status: 'pending', booking_id: BOOKING_ID, provider_id: PROVIDER.id, escrow: false }
          : over.payment,
      updatePayment: async (id, patch) => void log.paymentUpdates.push([id, patch]),
      getBookingStatus: async () => (over.booking === undefined ? 'accepted' : over.booking),
      transitionBooking: async (id, to) => {
        if (over.transitionError) throw over.transitionError;
        log.transitions.push([id, to]);
      },
      findSubscription: async () => over.subscription ?? null,
      updateSubscription: async (id, patch) => void log.subscriptions.push([id, patch]),
      setProviderPlan: async (_id, plan) => void log.plans.push(plan),
      audit: async entry => void log.audits.push(entry),
    },
  };
  return { deps, log };
}

const received = { id: 'evt_1', event: 'PAYMENT_RECEIVED', dateCreated: '2026-10-19 12:00:00', payment: { id: 'pay_1', status: 'RECEIVED', dueDate: '2026-10-19' } };

describe('asaas-webhook', () => {
  it('refuses when the token is not configured or wrong', async () => {
    expect((await read(await webhook(hook(received), webhookDeps({ token: undefined }).deps))).status).toBe(503);
    const wrong = await read(await webhook(hook(received, 'wrong'), webhookDeps().deps));
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('invalid_token');
    expect((await read(await webhook(hook(received, null), webhookDeps().deps))).status).toBe(401);
  });

  it('rejects payloads without id or event', async () => {
    const { deps, log } = webhookDeps();
    expect((await read(await webhook(hook({ event: 'PAYMENT_RECEIVED' }), deps))).status).toBe(400);
    expect(log.events).toEqual([]);
  });

  it('records the event, updates the payment and pays the booking', async () => {
    const { deps, log } = webhookDeps();
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true, event: 'PAYMENT_RECEIVED', payment_status: 'received', booking_status: 'paid' });
    expect(log.events[0]).toEqual({ asaas_event_id: 'evt_1', event_type: 'PAYMENT_RECEIVED', payload: received });
    expect(log.paymentUpdates[0]).toEqual(['payrow-1', { status: 'received', raw: received.payment }]);
    expect(log.transitions).toEqual([[BOOKING_ID, 'paid']]);
    expect(log.processed).toEqual([['evrow-1', 'payrow-1']]);
  });

  it('is idempotent: a processed event id is acknowledged without side effects', async () => {
    const { deps, log } = webhookDeps({ processed: true });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true, duplicate: true });
    expect(log.paymentUpdates).toEqual([]);
    expect(log.transitions).toEqual([]);
  });

  it('stores and ignores unknown events with 200', async () => {
    const { deps, log } = webhookDeps();
    const res = await read(await webhook(hook({ id: 'evt_9', event: 'SOMETHING_NEW', payment: { id: 'pay_1' } }), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true, ignored: 'unknown_event' });
    expect(log.events).toHaveLength(1);
    expect(log.processed).toEqual([['evrow-1', null]]);
    expect(log.paymentUpdates).toEqual([]);
  });

  it('acknowledges events for payments it does not know', async () => {
    const { deps, log } = webhookDeps({ payment: null });
    const res = await read(await webhook(hook(received), deps));
    expect(res.body.data.ignored).toBe('unknown_payment');
    expect(log.processed).toEqual([['evrow-1', null]]);
  });

  it('does not move a received payment back on a late CONFIRMED', async () => {
    const { deps, log } = webhookDeps({
      payment: { id: 'payrow-1', status: 'received', booking_id: BOOKING_ID, provider_id: PROVIDER.id, escrow: false },
      booking: 'paid',
    });
    await webhook(hook({ ...received, id: 'evt_2', event: 'PAYMENT_CONFIRMED' }), deps);
    expect(log.paymentUpdates[0][1].status).toBeUndefined();
    expect(log.transitions).toEqual([]);
  });

  it('records a business-rule refusal of the transition without failing', async () => {
    const { deps, log } = webhookDeps({ transitionError: new Error('invalid_transition') });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data.booking_transition_refused).toBe('invalid_transition');
    expect(log.processed).toHaveLength(1);
  });

  it('returns 500 on infrastructure errors so Asaas retries, leaving the event unprocessed', async () => {
    const { deps, log } = webhookDeps({ transitionError: new Error('connection reset') });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(500);
    expect(log.processed).toEqual([]);
  });

  it('marks refunds without touching the booking', async () => {
    const { deps, log } = webhookDeps({
      payment: { id: 'payrow-1', status: 'received', booking_id: BOOKING_ID, provider_id: PROVIDER.id, escrow: false },
    });
    const res = await read(await webhook(hook({ ...received, id: 'evt_3', event: 'PAYMENT_REFUNDED' }), deps));
    expect(res.body.data.payment_status).toBe('refunded');
    expect(log.transitions).toEqual([]);
  });

  it('activates Pro when a subscription charge is paid and handles overdue and deletion', async () => {
    const sub: StoredSubscription = { provider_id: PROVIDER.id, status: 'past_due', current_period_end: null };
    const paid = webhookDeps({ payment: null, subscription: sub });
    const res = await read(await webhook(hook({ ...received, payment: { id: 'pay_s', subscription: 'sub_1', dueDate: '2026-10-19' } }), paid.deps));
    expect(res.body.data).toMatchObject({ subscription_status: 'active' });
    expect(res.body.data.ignored).toBeUndefined();
    expect(paid.log.subscriptions).toEqual([[PROVIDER.id, { status: 'active', current_period_end: '2026-11-19T23:59:59-03:00' }]]);
    expect(paid.log.plans).toEqual(['pro']);

    const overdue = webhookDeps({ payment: null, subscription: { ...sub, status: 'active' } });
    await webhook(hook({ id: 'evt_4', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_s', subscription: 'sub_1' } }), overdue.deps);
    expect(overdue.log.subscriptions).toEqual([[PROVIDER.id, { status: 'past_due' }]]);
    expect(overdue.log.plans).toEqual([]);

    const deleted = webhookDeps({ payment: null, subscription: { ...sub, status: 'active', current_period_end: '2026-10-01T00:00:00Z' } });
    await webhook(hook({ id: 'evt_5', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_1' } }), deleted.deps);
    expect(deleted.log.plans).toEqual(['free']);
  });
});

describe('notify-dispatch', () => {
  const CRON = 'cron-secret-value';
  const call = (headers: Record<string, string> = { 'x-cron-secret': CRON }, body: unknown = {}) =>
    new Request('http://localhost/functions/v1/notify-dispatch', { method: 'POST', headers, body: JSON.stringify(body) });

  const row = (over: Partial<NotificationRow>): NotificationRow => ({
    id: 'n1', user_id: null, phone: '11987654321', email: 'a@example.com', channel: 'whatsapp',
    template: 'pagamento_recebido', params: { amount_cents: 15000, client_name: 'Ana' }, attempts: 0, ...over,
  });

  function notifyDeps(rows: NotificationRow[], over: Partial<NotifyDeps> = {}, routes: Parameters<typeof fakeFetch>[0] = {}) {
    const updates: Array<[string, NotificationUpdate]> = [];
    const limits: number[] = [];
    const { fetch, calls } = fakeFetch(routes);
    const deps: NotifyDeps = {
      ...baseDeps,
      cronSecret: CRON,
      whatsapp: { token: undefined, phoneNumberId: undefined, graphVersion: 'v26.0' },
      email: { resendApiKey: undefined, from: undefined },
      fetch,
      store: {
        claim: async limit => {
          limits.push(limit);
          return rows;
        },
        update: async (id, patch) => void updates.push([id, patch]),
      },
      ...over,
    };
    return { deps, updates, calls, limits };
  }

  it('requires CRON_SECRET', async () => {
    expect((await read(await dispatch(call(), notifyDeps([], { cronSecret: undefined }).deps))).status).toBe(503);
    expect((await read(await dispatch(call({ 'x-cron-secret': 'nope' }), notifyDeps([]).deps))).status).toBe(401);
    expect((await read(await dispatch(call({ Authorization: `Bearer ${CRON}` }), notifyDeps([]).deps))).status).toBe(200);
  });

  it('marks notifications skipped when no provider is configured', async () => {
    const { deps, updates, calls } = notifyDeps([row({}), row({ id: 'n2', channel: 'email' })]);
    const res = await read(await dispatch(call(), deps));
    expect(res.body.data).toEqual({ claimed: 2, sent: 0, skipped: 2, retried: 0, failed: 0 });
    expect(updates.map(([, u]) => u.error)).toEqual(['whatsapp_not_configured', 'email_not_configured']);
    expect(calls).toHaveLength(0);
  });

  it('sends WhatsApp templates and Resend emails with the right requests', async () => {
    const { deps, updates, calls, limits } = notifyDeps(
      [row({}), row({ id: 'n2', channel: 'email', template: 'proposta_recebida', params: { provider_name: 'Bia', occupation_name: 'Diarista', price_cents: 9000 } })],
      {
        whatsapp: { token: 'wa-token', phoneNumberId: '1234567890', graphVersion: 'v26.0' },
        email: { resendApiKey: 're_key', from: 'WorkEasy <avisos@workeasy.com.br>' },
      },
      {
        'POST /v26.0/1234567890/messages': { body: { messages: [{ id: 'wamid.1' }] } },
        'POST /emails': { body: { id: 'email-1' } },
      },
    );
    const res = await read(await dispatch(call(undefined, { limit: 10 }), deps));
    expect(limits).toEqual([10]);
    expect(res.body.data).toMatchObject({ sent: 2 });
    expect(calls[0].url).toBe('https://graph.facebook.com/v26.0/1234567890/messages');
    expect(calls[0].headers.Authorization).toBe('Bearer wa-token');
    expect(calls[0].body).toMatchObject({ to: '5511987654321', template: { name: 'pagamento_recebido', language: { code: 'pt_BR' } } });
    expect(calls[1].url).toBe('https://api.resend.com/emails');
    expect(calls[1].headers['Idempotency-Key']).toBe('notification-n2');
    expect(calls[1].body).toMatchObject({ to: ['a@example.com'], subject: 'Você recebeu uma proposta' });
    expect(updates.every(([, u]) => u.status === 'sent' && u.attempts === 1)).toBe(true);
  });

  it('retries 5xx, fails 4xx, bad params and unknown templates', async () => {
    const wa = { token: 'wa', phoneNumberId: '1', graphVersion: 'v26.0' };
    let n = 0;
    const { deps, updates } = notifyDeps(
      [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c', params: { amount_cents: 'x' } }), row({ id: 'd', template: 'nao_existe' })],
      { whatsapp: wa },
      {
        'POST /v26.0/1/messages': () => (n++ === 0
          ? { status: 503, body: { error: { message: 'Service unavailable' } } }
          : { status: 400, body: { error: { message: 'Template name does not exist' } } }),
      },
    );
    const res = await read(await dispatch(call(), deps));
    expect(res.body.data).toEqual({ claimed: 4, sent: 0, skipped: 0, retried: 1, failed: 3 });
    expect(updates[0][1]).toMatchObject({ status: 'queued', error: 'http_503: Service unavailable' });
    expect(updates[1][1]).toMatchObject({ status: 'failed', error: 'http_400: Template name does not exist' });
    expect(updates[2][1].error).toMatch(/^invalid_params/);
    expect(updates[3][1].error).toBe('unknown_template: nao_existe');
  });

  it('validates the limit', async () => {
    expect((await read(await dispatch(call(undefined, { limit: 1000 }), notifyDeps([]).deps))).status).toBe(400);
  });
});
