// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DbError } from '../../supabase/functions/_shared/handler-kit.ts';
import type { NotificationRow, NotificationUpdate } from '../../supabase/functions/_shared/notifications.ts';
import { deriveSubaccountToken } from '../../supabase/functions/_shared/secrets.ts';
import type { BookingStatus, PaymentStatus } from '../../supabase/functions/_shared/types.ts';
import {
  handler as webhook, type StoredPayment, type StoredSubscription, type WebhookDeps,
} from '../../supabase/functions/asaas-webhook/handler.ts';
import { handler as dispatch, type NotifyDeps } from '../../supabase/functions/notify-dispatch/handler.ts';
import { asaasWith, baseDeps, BOOKING_ID, fakeFetch, PROVIDER, read } from './helpers.ts';

const FIXED_START = Date.parse('2026-10-19T15:00:00Z');
const TOKEN = 'webhook-token-0123456789abcdef0123456789';
const ROOT_KEY = 'root-key';
const SUB_KEY = 'sub-key';

function hook(body: unknown, token: string | null = TOKEN, acct?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers['asaas-access-token'] = token;
  const url = `http://localhost/functions/v1/asaas-webhook${acct ? `?acct=${acct}` : ''}`;
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

type Remote = { status?: number; body: unknown };

const PAID_REMOTE: Remote = { body: { id: 'pay_1', status: 'RECEIVED', value: 150, dueDate: '2026-10-19', billingType: 'PIX' } };

function webhookDeps(over: {
  processed?: boolean;
  payment?: StoredPayment | null;
  booking?: BookingStatus | null;
  subscription?: StoredSubscription | null;
  transitionError?: Error;
  updateError?: Error;
  token?: string;
  /** What Asaas answers to GET /payments/{id} and GET /subscriptions/{id}; a missing route is a 404. */
  remote?: Record<string, Remote>;
  subKey?: string | null;
  noRootKey?: boolean;
  graceDays?: number;
} = {}) {
  const log = {
    events: [] as Array<{ asaas_event_id: string; event_type: string; payload: unknown }>,
    processed: [] as Array<[string, string | null]>,
    paymentUpdates: [] as Array<[string, { status?: PaymentStatus; raw?: unknown }]>,
    transitions: [] as Array<[string, BookingStatus]>,
    subscriptions: [] as unknown[],
    subscriptionLookups: [] as string[],
    plans: [] as string[],
    audits: [] as Array<{ action: string; data?: Record<string, unknown> }>,
    errors: [] as unknown[],
  };
  const routes: Record<string, Remote> = {};
  for (const [path, answer] of Object.entries(over.remote ?? { 'GET /v3/payments/pay_1': PAID_REMOTE })) routes[path] = answer;
  const { client, calls } = asaasWith(routes);
  const deps: WebhookDeps = {
    ...baseDeps,
    logError: error => void log.errors.push(error),
    webhookToken: 'token' in over ? over.token : TOKEN,
    asaas: over.noRootKey ? null : client,
    subaccountAsaas: async () => (over.subKey === null ? null : client.withApiKey(over.subKey ?? SUB_KEY)),
    proGraceDays: over.graceDays,
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
      updatePayment: async (id, patch) => {
        if (over.updateError) throw over.updateError;
        log.paymentUpdates.push([id, patch]);
      },
      getBookingStatus: async () => (over.booking === undefined ? 'accepted' : over.booking),
      transitionBooking: async (id, to) => {
        if (over.transitionError) throw over.transitionError;
        log.transitions.push([id, to]);
      },
      findSubscription: async id => {
        log.subscriptionLookups.push(id);
        return over.subscription ?? null;
      },
      updateSubscription: async (id, patch) => void log.subscriptions.push([id, patch]),
      setProviderPlan: async (_id, plan) => void log.plans.push(plan),
      audit: async entry => void log.audits.push(entry),
    },
  };
  return { deps, log, calls };
}

const received = {
  id: 'evt_1', event: 'PAYMENT_RECEIVED', dateCreated: '2026-10-19 12:00:00',
  payment: { id: 'pay_1', status: 'RECEIVED', dueDate: '2026-10-19' },
};

const SUB_PAYMENT: Remote = {
  body: { id: 'pay_s', status: 'RECEIVED', subscription: 'sub_1', dueDate: '2026-10-19', billingType: 'PIX' },
};
const subEvent = (event: string, id = 'evt_s') => ({ id, event, payment: { id: 'pay_s', subscription: 'sub_1' } });
const PENDING_SUB: StoredSubscription = { provider_id: PROVIDER.id, status: 'pending', current_period_end: null };

describe('asaas-webhook: access', () => {
  it('refuses when the token is not configured or wrong', async () => {
    expect((await read(await webhook(hook(received), webhookDeps({ token: undefined }).deps))).status).toBe(503);
    const wrong = await read(await webhook(hook(received, 'wrong'), webhookDeps().deps));
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('invalid_token');
    expect((await read(await webhook(hook(received, null), webhookDeps().deps))).status).toBe(401);
  });

  it('answers 503 (Asaas retries) when the root key is missing, since nothing can be verified', async () => {
    const { deps, log } = webhookDeps({ noRootKey: true });
    expect((await read(await webhook(hook(received), deps))).status).toBe(503);
    expect(log.events).toEqual([]);
  });

  it('gives each provider subaccount its own token: the platform token does not work with ?acct', async () => {
    const providerToken = await deriveSubaccountToken(TOKEN, PROVIDER.id);
    expect(providerToken).not.toBe(TOKEN);
    const withPlatformToken = await read(await webhook(hook(received, TOKEN, PROVIDER.id), webhookDeps().deps));
    expect(withPlatformToken.status).toBe(401);
    // a provider's token is not valid for the root account, nor for another provider
    expect((await read(await webhook(hook(received, providerToken), webhookDeps().deps))).status).toBe(401);
    const other = '33333333-3333-4333-8333-333333333333';
    expect((await read(await webhook(hook(received, providerToken, other), webhookDeps().deps))).status).toBe(401);
    expect((await read(await webhook(hook(received, providerToken, 'not-a-uuid'), webhookDeps().deps))).status).toBe(401);
    expect((await read(await webhook(hook(received, providerToken, PROVIDER.id), webhookDeps().deps))).status).toBe(200);
  });
});

describe('asaas-webhook: payload', () => {
  it('acknowledges payloads without id or event with 200 so the sequential queue does not stall', async () => {
    const { deps, log } = webhookDeps();
    for (const body of [{ event: 'PAYMENT_RECEIVED' }, { id: 'x' }, null, 'text']) {
      const res = await read(await webhook(hook(body), deps));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ received: true, ignored: 'invalid_payload' });
    }
    const broken = new Request('http://localhost/functions/v1/asaas-webhook', {
      method: 'POST', headers: { 'asaas-access-token': TOKEN }, body: '{not json',
    });
    const res = await read(await webhook(broken, deps));
    expect(res.status).toBe(200);
    expect(res.body.data.ignored).toBe('invalid_payload');
    expect(log.events).toEqual([]);
    expect(log.errors.length).toBeGreaterThan(0);
  });

  it('stores the event without card data (creditCard, creditCardToken)', async () => {
    const card = { creditCardNumber: '8829', creditCardBrand: 'VISA', creditCardToken: '76496-token' };
    const body = {
      ...received,
      payment: { ...received.payment, creditCard: card },
    };
    const remote: Remote = { body: { ...(PAID_REMOTE.body as object), creditCard: card, creditCardToken: 'x' } };
    const { deps, log } = webhookDeps({ remote: { 'GET /v3/payments/pay_1': remote } });
    await webhook(hook(body), deps);
    expect(JSON.stringify(log.events)).not.toMatch(/creditCard|76496|token/i);
    expect(JSON.stringify(log.paymentUpdates)).not.toMatch(/creditCard|76496|"x"/i);
    expect(log.paymentUpdates[0][1].raw).toMatchObject({ id: 'pay_1', status: 'RECEIVED' });
  });

  it('is idempotent: a processed event id is acknowledged without side effects', async () => {
    const { deps, log, calls } = webhookDeps({ processed: true });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true, duplicate: true });
    expect(log.paymentUpdates).toEqual([]);
    expect(log.transitions).toEqual([]);
    expect(calls).toEqual([]);
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
});

describe('asaas-webhook: payments', () => {
  it('reads the charge in Asaas, records the event, updates the payment and pays the booking', async () => {
    const { deps, log, calls } = webhookDeps();
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true, event: 'PAYMENT_RECEIVED', payment_status: 'received', booking_status: 'paid' });
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname} ${c.headers.access_token}`)).toEqual([`GET /v3/payments/pay_1 ${ROOT_KEY}`]);
    expect(log.events[0]).toEqual({ asaas_event_id: 'evt_1', event_type: 'PAYMENT_RECEIVED', payload: received });
    expect(log.paymentUpdates[0]).toEqual(['payrow-1', { status: 'received', raw: PAID_REMOTE.body }]);
    expect(log.transitions).toEqual([[BOOKING_ID, 'paid']]);
    expect(log.processed).toEqual([['evrow-1', 'payrow-1']]);
  });

  it('does not trust the body: a forged PAYMENT_RECEIVED for a charge Asaas shows as pending changes nothing', async () => {
    const pending: Remote = { body: { id: 'pay_1', status: 'PENDING', dueDate: '2026-10-19' } };
    const { deps, log } = webhookDeps({ remote: { 'GET /v3/payments/pay_1': pending } });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data.ignored).toBe('status_mismatch');
    expect(log.paymentUpdates).toEqual([]);
    expect(log.transitions).toEqual([]);
  });

  it('ignores an event whose charge is not in the account the token belongs to (404)', async () => {
    const { deps, log } = webhookDeps({ remote: {} });
    const res = await read(await webhook(hook({ id: 'evt_d', event: 'PAYMENT_DELETED', payment: { id: 'pay_1' } }), deps));
    expect(res.body.data).toMatchObject({ ignored: 'unverifiable', reason: 'payment_not_in_account' });
    expect(log.paymentUpdates).toEqual([]);
    expect(log.audits.map(a => a.action)).toEqual(['payment_event.unverified']);
    expect(log.processed).toHaveLength(1);
  });

  it('cancels a charge only when Asaas reports it deleted', async () => {
    const deleted: Remote = { body: { id: 'pay_1', status: 'PENDING', deleted: true } };
    const { deps, log } = webhookDeps({ remote: { 'GET /v3/payments/pay_1': deleted } });
    const res = await read(await webhook(hook({ id: 'evt_d', event: 'PAYMENT_DELETED', payment: { id: 'pay_1' } }), deps));
    expect(res.body.data.payment_status).toBe('canceled');
    expect(log.paymentUpdates[0][1].status).toBe('canceled');
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

  it('does not send a received payment back to pending on a late PAYMENT_CREATED or PAYMENT_RESTORED', async () => {
    for (const status of ['received', 'confirmed'] as const) {
      for (const event of ['PAYMENT_CREATED', 'PAYMENT_RESTORED']) {
        const pendingNow: Remote = { body: { id: 'pay_1', status: 'PENDING' } };
        const { deps, log } = webhookDeps({
          payment: { id: 'payrow-1', status, booking_id: BOOKING_ID, provider_id: PROVIDER.id, escrow: false },
          remote: { 'GET /v3/payments/pay_1': pendingNow },
        });
        await webhook(hook({ id: `evt_${event}_${status}`, event, payment: { id: 'pay_1' } }), deps);
        expect(log.paymentUpdates.filter(([, patch]) => patch.status === 'pending')).toEqual([]);
      }
    }
  });

  it('moves a received payment back only for an undone cash receipt that Asaas confirms', async () => {
    const pendingNow: Remote = { body: { id: 'pay_1', status: 'PENDING' } };
    const { deps, log } = webhookDeps({
      payment: { id: 'payrow-1', status: 'received', booking_id: BOOKING_ID, provider_id: PROVIDER.id, escrow: false },
      remote: { 'GET /v3/payments/pay_1': pendingNow },
    });
    await webhook(hook({ id: 'evt_u', event: 'PAYMENT_RECEIVED_IN_CASH_UNDONE', payment: { id: 'pay_1' } }), deps);
    expect(log.paymentUpdates[0][1].status).toBe('pending');
  });

  it('refunds the payment and cancels the paid booking (the refund path)', async () => {
    const refunded: Remote = { body: { id: 'pay_1', status: 'REFUNDED' } };
    const { deps, log } = webhookDeps({
      payment: { id: 'payrow-1', status: 'received', booking_id: BOOKING_ID, provider_id: PROVIDER.id, escrow: false },
      booking: 'paid',
      remote: { 'GET /v3/payments/pay_1': refunded },
    });
    const res = await read(await webhook(hook({ ...received, id: 'evt_3', event: 'PAYMENT_REFUNDED' }), deps));
    expect(res.body.data).toMatchObject({ payment_status: 'refunded', booking_status: 'canceled' });
    expect(log.transitions).toEqual([[BOOKING_ID, 'canceled']]);
  });

  it('records a business-rule refusal of the transition without failing', async () => {
    const { deps, log } = webhookDeps({ transitionError: new Error('invalid_transition') });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data.booking_transition_refused).toBe('invalid_transition');
    expect(log.processed).toHaveLength(1);
  });
});

describe('asaas-webhook: errors and the sequential queue', () => {
  it('returns 500 on transient errors so Asaas retries, leaving the event unprocessed', async () => {
    const { deps, log } = webhookDeps({ transitionError: new Error('connection reset') });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(500);
    expect(log.processed).toEqual([]);
    const db = webhookDeps({ updateError: new DbError('connection timeout', '08006') });
    expect((await read(await webhook(hook(received), db.deps))).status).toBe(500);
    expect(db.log.processed).toEqual([]);
  });

  it('returns 500 when Asaas itself is down while verifying', async () => {
    const down = webhookDeps({ remote: { 'GET /v3/payments/pay_1': { status: 503, body: {} } } });
    expect((await read(await webhook(hook(received), down.deps))).status).toBe(500);
    expect(down.log.processed).toEqual([]);
  });

  it('acknowledges with 200 the errors that would repeat on every retry, recording them', async () => {
    const denied = webhookDeps({ transitionError: new DbError('permission denied for function transition_booking', '42501') });
    const res = await read(await webhook(hook(received), denied.deps));
    expect(res.status).toBe(200);
    expect(res.body.data.failed).toBe('42501');
    expect(denied.log.processed).toHaveLength(1);
    expect(denied.log.audits.map(a => a.action)).toContain('payment_event.failed');

    const rejected = webhookDeps({ remote: { 'GET /v3/payments/pay_1': { status: 400, body: { errors: [{ code: 'invalid', description: 'x' }] } } } });
    const res2 = await read(await webhook(hook(received), rejected.deps));
    expect(res2.status).toBe(200);
    expect(res2.body.data.failed).toBe('asaas_400');
    expect(rejected.log.processed).toHaveLength(1);
  });

  it('acknowledges an event whose subaccount key is missing or rejected, with an audit entry', async () => {
    const providerToken = await deriveSubaccountToken(TOKEN, PROVIDER.id);
    const none = webhookDeps({ subKey: null });
    const res = await read(await webhook(hook(received, providerToken, PROVIDER.id), none.deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ignored: 'unverifiable', reason: 'subaccount_key_missing' });
    expect(none.log.paymentUpdates).toEqual([]);

    const rejected = webhookDeps({ remote: { 'GET /v3/payments/pay_1': { status: 401, body: {} } } });
    const res2 = await read(await webhook(hook(received, providerToken, PROVIDER.id), rejected.deps));
    expect(res2.body.data).toMatchObject({ ignored: 'unverifiable', reason: 'subaccount_key_rejected' });
  });
});

describe('asaas-webhook: provider subaccount', () => {
  it('verifies with the subaccount key and applies the effect to the provider\'s own charge', async () => {
    const providerToken = await deriveSubaccountToken(TOKEN, PROVIDER.id);
    const { deps, log, calls } = webhookDeps({ payment: { id: 'payrow-1', status: 'pending', booking_id: null, provider_id: PROVIDER.id, escrow: false } });
    const res = await read(await webhook(hook(received, providerToken, PROVIDER.id.toUpperCase()), deps));
    expect(res.status).toBe(200);
    expect(res.body.data.payment_status).toBe('received');
    expect(calls[0].headers.access_token).toBe(SUB_KEY);
    expect(log.paymentUpdates).toHaveLength(1);
  });

  it('refuses to touch a charge that belongs to another provider', async () => {
    const providerToken = await deriveSubaccountToken(TOKEN, PROVIDER.id);
    const { deps, log, calls } = webhookDeps({
      payment: { id: 'payrow-9', status: 'pending', booking_id: BOOKING_ID, provider_id: '99999999-9999-4999-8999-999999999999', escrow: false },
    });
    const res = await read(await webhook(hook(received, providerToken, PROVIDER.id), deps));
    expect(res.body.data.ignored).toBe('account_mismatch');
    expect(log.paymentUpdates).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('never lets a subaccount event grant Pro: subscription charges live in the root account', async () => {
    const providerToken = await deriveSubaccountToken(TOKEN, PROVIDER.id);
    const { deps, log } = webhookDeps({
      payment: null, subscription: PENDING_SUB, remote: { 'GET /v3/payments/pay_s': SUB_PAYMENT },
    });
    const res = await read(await webhook(hook(subEvent('PAYMENT_RECEIVED'), providerToken, PROVIDER.id), deps));
    expect(res.body.data.ignored).toBe('unknown_payment');
    expect(log.subscriptions).toEqual([]);
    expect(log.plans).toEqual([]);
  });
});

describe('asaas-webhook: payment received after the booking was canceled', () => {
  const REFUND = 'POST /v3/payments/pay_1/refund';
  const refundOk: Remote = { body: { id: 'pay_1', status: 'REFUNDED' } };
  const cardRemote: Remote = {
    body: { ...(PAID_REMOTE.body as object), creditCard: { creditCardNumber: '8829' }, creditCardToken: 'tok-76496' },
  };

  it('does not reactivate the booking, records the payment as received and refunds it in Asaas', async () => {
    const { deps, log, calls } = webhookDeps({ booking: 'canceled', remote: { 'GET /v3/payments/pay_1': cardRemote, [REFUND]: refundOk } });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ received_after_cancel: true, refund: 'requested', payment_status: 'refunded' });
    expect(log.transitions).toEqual([]);
    expect(log.paymentUpdates.map(([, patch]) => patch.status)).toEqual(['received', 'refunded']);
    expect(JSON.stringify(log.paymentUpdates)).not.toMatch(/creditCard|tok-76496|8829/);
    expect(log.audits.map(a => a.action)).toEqual(['payment.status', 'payment.received_after_cancel', 'payment.refunded_after_cancel']);
    const refund = calls.find(c => c.method === 'POST');
    expect(refund?.url).toContain('/payments/pay_1/refund');
    expect(refund?.headers.access_token).toBe(ROOT_KEY);
    expect(log.processed).toEqual([['evrow-1', 'payrow-1']]);
  });

  it('also covers PAYMENT_CONFIRMED, and refunds with the subaccount key for a provider\'s own charge', async () => {
    const providerToken = await deriveSubaccountToken(TOKEN, PROVIDER.id);
    const confirmed: Remote = { body: { id: 'pay_1', status: 'CONFIRMED', value: 150 } };
    const { deps, calls } = webhookDeps({ booking: 'canceled', remote: { 'GET /v3/payments/pay_1': confirmed, [REFUND]: refundOk } });
    const res = await read(await webhook(hook({ ...received, id: 'evt_c', event: 'PAYMENT_CONFIRMED' }, providerToken, PROVIDER.id), deps));
    expect(res.body.data).toMatchObject({ refund: 'requested' });
    expect(calls.find(c => c.method === 'POST')?.headers.access_token).toBe(SUB_KEY);
  });

  it('keeps the payment received and audits when Asaas refuses the refund (boleto, balance)', async () => {
    const refused: Remote = { status: 400, body: { errors: [{ code: 'invalid_action', description: 'Cobrança não estornável' }] } };
    const { deps, log } = webhookDeps({ booking: 'canceled', remote: { 'GET /v3/payments/pay_1': PAID_REMOTE, [REFUND]: refused } });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ received_after_cancel: true, refund: 'failed', payment_status: 'received' });
    expect(log.paymentUpdates.map(([, patch]) => patch.status)).toEqual(['received']);
    expect(log.transitions).toEqual([]);
    const failed = log.audits.find(a => a.action === 'payment.refund_failed');
    expect(failed?.data).toMatchObject({ code: 'asaas_400', booking_id: BOOKING_ID });
    expect(log.audits.map(a => a.action)).toContain('payment.received_after_cancel');
    expect(log.processed).toHaveLength(1);
  });

  it('does not fail the event when the refund call itself fails (network)', async () => {
    const { deps, log } = webhookDeps({ booking: 'canceled', remote: { 'GET /v3/payments/pay_1': PAID_REMOTE, [REFUND]: { status: 503, body: {} } } });
    const res = await read(await webhook(hook(received), deps));
    expect(res.status).toBe(200);
    expect(res.body.data.refund).toBe('failed');
    expect(log.audits.map(a => a.action)).toContain('payment.refund_failed');
  });

  it('does not refund anything when Asaas does not back the event, or the booking is not canceled', async () => {
    const pending: Remote = { body: { id: 'pay_1', status: 'PENDING' } };
    const forged = webhookDeps({ booking: 'canceled', remote: { 'GET /v3/payments/pay_1': pending } });
    await webhook(hook(received), forged.deps);
    expect(forged.calls.map(c => c.method)).toEqual(['GET']);
    const normal = webhookDeps({ booking: 'accepted' });
    await webhook(hook(received), normal.deps);
    expect(normal.calls.map(c => c.method)).toEqual(['GET']);
    expect(normal.log.transitions).toEqual([[BOOKING_ID, 'paid']]);
  });

  it('leaves the payment of a quote alone (no booking to cancel)', async () => {
    const { deps, calls } = webhookDeps({ booking: 'canceled', payment: { id: 'payrow-1', status: 'pending', booking_id: null, provider_id: PROVIDER.id, escrow: false } });
    await webhook(hook(received), deps);
    expect(calls.map(c => c.method)).toEqual(['GET']);
  });
});

describe('asaas-webhook: Pro subscription', () => {
  it('activates Pro using the subscription id Asaas reports, not the one in the body', async () => {
    const { deps, log } = webhookDeps({
      payment: null, subscription: PENDING_SUB, remote: { 'GET /v3/payments/pay_s': SUB_PAYMENT },
    });
    const forged = { id: 'evt_s', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_s', subscription: 'sub_victim' } };
    const res = await read(await webhook(hook(forged), deps));
    expect(res.body.data).toMatchObject({ subscription_status: 'active', plan: 'pro' });
    expect(log.subscriptionLookups).toEqual(['sub_1']);
    expect(log.subscriptions).toEqual([[PROVIDER.id, { status: 'active', current_period_end: '2026-11-19T23:59:59-03:00' }]]);
    expect(log.plans).toEqual(['pro']);
  });

  it('does not grant Pro for a subscription charge Asaas shows as unpaid', async () => {
    const pending: Remote = { body: { id: 'pay_s', status: 'PENDING', subscription: 'sub_1', dueDate: '2026-10-19' } };
    const { deps, log } = webhookDeps({ payment: null, subscription: PENDING_SUB, remote: { 'GET /v3/payments/pay_s': pending } });
    const res = await read(await webhook(hook(subEvent('PAYMENT_RECEIVED')), deps));
    expect(res.body.data.ignored).toBe('status_mismatch');
    expect(log.plans).toEqual([]);
    expect(log.subscriptions).toEqual([]);
  });

  it('does not reactivate a canceled subscription when a late payment arrives', async () => {
    const canceled: StoredSubscription = { provider_id: PROVIDER.id, status: 'canceled', current_period_end: '2026-09-19T23:59:59-03:00' };
    const { deps, log } = webhookDeps({ payment: null, subscription: canceled, remote: { 'GET /v3/payments/pay_s': SUB_PAYMENT } });
    const res = await read(await webhook(hook(subEvent('PAYMENT_RECEIVED')), deps));
    expect(res.body.data.subscription_status).toBe('canceled');
    expect(log.subscriptions).toEqual([[PROVIDER.id, { current_period_end: '2026-11-19T23:59:59-03:00' }]]);
    expect(JSON.stringify(log.subscriptions)).not.toContain('"active"');
    // the plan follows the paid period (ends after "now" = 2026-10-19), as after a cancellation
    expect(log.plans).toEqual(['pro']);
  });

  it('keeps a never-paid subscription pending when its first charge goes overdue', async () => {
    const overdueRemote: Remote = { body: { id: 'pay_s', status: 'OVERDUE', subscription: 'sub_1', dueDate: '2026-10-18' } };
    const { deps, log } = webhookDeps({ payment: null, subscription: PENDING_SUB, remote: { 'GET /v3/payments/pay_s': overdueRemote } });
    const res = await read(await webhook(hook(subEvent('PAYMENT_OVERDUE', 'evt_o0')), deps));
    expect(res.body.data).toMatchObject({ subscription_status: 'pending', ignored: 'first_payment_overdue' });
    expect(log.subscriptions).toEqual([]);
    expect(log.plans).toEqual([]);
  });

  it('turns a trial into a paid month when its first charge is paid, counted from the due date', async () => {
    const trialing: StoredSubscription = { provider_id: PROVIDER.id, status: 'trialing', current_period_end: '2026-11-18T23:59:59-03:00' };
    const paidAtTrialEnd: Remote = {
      body: { id: 'pay_s', status: 'RECEIVED', subscription: 'sub_1', dueDate: '2026-11-18', billingType: 'PIX' },
    };
    const { deps, log } = webhookDeps({ payment: null, subscription: trialing, remote: { 'GET /v3/payments/pay_s': paidAtTrialEnd } });
    const res = await read(await webhook(hook(subEvent('PAYMENT_RECEIVED', 'evt_t1')), deps));
    expect(res.body.data).toMatchObject({ subscription_status: 'active', plan: 'pro' });
    expect(log.subscriptions).toEqual([[PROVIDER.id, { status: 'active', current_period_end: '2026-12-18T23:59:59-03:00' }]]);
  });

  it('lets a trial nobody paid for lapse: overdue after its end takes Pro away, unlike a never-paid pending one', async () => {
    const overdueRemote: Remote = { body: { id: 'pay_s', status: 'OVERDUE', subscription: 'sub_1', dueDate: '2026-10-17' } };
    const endedTrial: StoredSubscription = { provider_id: PROVIDER.id, status: 'trialing', current_period_end: '2026-10-17T23:59:59-03:00' };
    const { deps, log } = webhookDeps({ payment: null, subscription: endedTrial, remote: { 'GET /v3/payments/pay_s': overdueRemote } });
    const res = await read(await webhook(hook(subEvent('PAYMENT_OVERDUE', 'evt_t2')), deps));
    expect(res.body.data).toMatchObject({ subscription_status: 'past_due', plan: 'free' });
    expect(res.body.data.ignored).toBeUndefined();
    expect(log.plans).toEqual(['free']);
  });

  it('takes Pro away on overdue once the paid period (plus grace) has ended', async () => {
    const overdueRemote: Remote = { body: { id: 'pay_s', status: 'OVERDUE', subscription: 'sub_1', dueDate: '2026-10-01' } };
    const lapsed: StoredSubscription = { provider_id: PROVIDER.id, status: 'active', current_period_end: '2026-10-10T23:59:59-03:00' };
    const { deps, log } = webhookDeps({ payment: null, subscription: lapsed, remote: { 'GET /v3/payments/pay_s': overdueRemote } });
    const res = await read(await webhook(hook(subEvent('PAYMENT_OVERDUE', 'evt_o')), deps));
    expect(res.body.data).toMatchObject({ subscription_status: 'past_due', plan: 'free' });
    expect(log.subscriptions).toEqual([[PROVIDER.id, { status: 'past_due' }]]);
    expect(log.plans).toEqual(['free']);
  });

  it('keeps Pro on overdue inside the paid period or the configured grace days', async () => {
    const overdueRemote: Remote = { body: { id: 'pay_s', status: 'OVERDUE', subscription: 'sub_1' } };
    const inside: StoredSubscription = { provider_id: PROVIDER.id, status: 'active', current_period_end: '2026-10-25T23:59:59-03:00' };
    const a = webhookDeps({ payment: null, subscription: inside, remote: { 'GET /v3/payments/pay_s': overdueRemote } });
    await webhook(hook(subEvent('PAYMENT_OVERDUE', 'evt_o1')), a.deps);
    expect(a.log.plans).toEqual(['pro']);

    const justEnded: StoredSubscription = { provider_id: PROVIDER.id, status: 'active', current_period_end: '2026-10-17T23:59:59-03:00' };
    const noGrace = webhookDeps({ payment: null, subscription: justEnded, remote: { 'GET /v3/payments/pay_s': overdueRemote } });
    await webhook(hook(subEvent('PAYMENT_OVERDUE', 'evt_o2')), noGrace.deps);
    expect(noGrace.log.plans).toEqual(['free']);
    const withGrace = webhookDeps({ payment: null, subscription: justEnded, remote: { 'GET /v3/payments/pay_s': overdueRemote }, graceDays: 5 });
    await webhook(hook(subEvent('PAYMENT_OVERDUE', 'evt_o3')), withGrace.deps);
    expect(withGrace.log.plans).toEqual(['pro']);
  });

  it('ignores a late OVERDUE for a charge that has been paid since', async () => {
    const active: StoredSubscription = { provider_id: PROVIDER.id, status: 'active', current_period_end: '2026-11-19T23:59:59-03:00' };
    const { deps, log } = webhookDeps({ payment: null, subscription: active, remote: { 'GET /v3/payments/pay_s': SUB_PAYMENT } });
    const res = await read(await webhook(hook(subEvent('PAYMENT_OVERDUE', 'evt_o4')), deps));
    expect(res.body.data.ignored).toBe('status_mismatch');
    expect(log.subscriptions).toEqual([]);
    expect(log.plans).toEqual([]);
  });

  it('cancels on SUBSCRIPTION_DELETED only when Asaas no longer has an active subscription', async () => {
    const active: StoredSubscription = { provider_id: PROVIDER.id, status: 'active', current_period_end: '2026-10-01T00:00:00Z' };
    const deleted = { id: 'evt_5', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_1' } };
    const gone = webhookDeps({
      payment: null, subscription: active, remote: { 'GET /v3/subscriptions/sub_1': { body: { id: 'sub_1', status: 'INACTIVE', deleted: true } } },
    });
    await webhook(hook(deleted), gone.deps);
    expect(gone.log.plans).toEqual(['free']);
    expect(gone.log.subscriptions[0]).toEqual([PROVIDER.id, expect.objectContaining({ status: 'canceled' })]);

    const forged = webhookDeps({
      payment: null, subscription: active, remote: { 'GET /v3/subscriptions/sub_1': { body: { id: 'sub_1', status: 'ACTIVE' } } },
    });
    const res = await read(await webhook(hook({ ...deleted, id: 'evt_6' }), forged.deps));
    expect(res.body.data.ignored).toBe('status_mismatch');
    expect(forged.log.plans).toEqual([]);
  });
});

describe('notify-dispatch', () => {
  const CRON = 'cron-secret-value';
  const call = (headers: Record<string, string> = { 'x-cron-secret': CRON }, body: unknown = {}) =>
    new Request('http://localhost/functions/v1/notify-dispatch', { method: 'POST', headers, body: JSON.stringify(body) });

  const row = (over: Partial<NotificationRow>): NotificationRow => ({
    id: 'n1', user_id: null, phone: '11987654321', email: 'a@example.com', channel: 'whatsapp',
    template: 'pagamento_recebido', params: { amount_cents: 15000, client_name: 'Ana' }, attempts: 1, ...over, // attempts as the claim returns it (already counted)
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
    expect(res.body.data).toEqual({ claimed: 2, sent: 0, skipped: 2, retried: 0, failed: 0, released: 0 });
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
    expect(res.body.data).toEqual({ claimed: 4, sent: 0, skipped: 0, retried: 1, failed: 3, released: 0 });
    expect(updates[0][1]).toMatchObject({ status: 'queued', error: 'http_503: Service unavailable' });
    expect(updates[1][1]).toMatchObject({ status: 'failed', error: 'http_400: Template name does not exist' });
    expect(updates[2][1].error).toMatch(/^invalid_params/);
    expect(updates[3][1].error).toBe('unknown_template: nao_existe');
  });

  it('keeps the attempts the claim counted instead of adding one more', async () => {
    const wa = { token: 'wa', phoneNumberId: '1', graphVersion: 'v26.0' };
    const { deps, updates } = notifyDeps([row({ attempts: 4 })], { whatsapp: wa }, {
      'POST /v26.0/1/messages': { status: 503, body: {} },
    });
    await dispatch(call(), deps);
    // 4th attempt of 5: retried once more (the old arithmetic counted 5 and failed it)
    expect(updates[0][1]).toMatchObject({ status: 'queued', attempts: 4 });
  });

  it('returns unsent rows to the queue when the time budget runs out, instead of leaving them in sending', async () => {
    const wa = { token: 'wa', phoneNumberId: '1', graphVersion: 'v26.0' };
    let clock = FIXED_START;
    const { deps, updates, calls } = notifyDeps(
      [row({ id: 'a', attempts: 1 }), row({ id: 'b', attempts: 2 }), row({ id: 'c', attempts: 1 })],
      { whatsapp: wa, budgetMs: 60_000, now: () => new Date(clock) },
      {
        'POST /v26.0/1/messages': () => {
          clock += 61_000; // the first send eats the whole budget
          return { body: { messages: [{ id: 'wamid' }] } };
        },
      },
    );
    const res = await read(await dispatch(call(), deps));
    expect(res.body.data).toMatchObject({ claimed: 3, sent: 1, released: 2 });
    expect(calls).toHaveLength(1);
    expect(updates.map(([id, u]) => [id, u.status, u.attempts])).toEqual([
      ['a', 'sent', 1], ['b', 'queued', 1], ['c', 'queued', 0],
    ]);
  });

  it('caps each request by what is left of the budget', async () => {
    const wa = { token: 'wa', phoneNumberId: '1', graphVersion: 'v26.0' };
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      const { deps: small } = notifyDeps([row({})], { whatsapp: wa, budgetMs: 2_000 }, {
        'POST /v26.0/1/messages': { body: { messages: [{ id: 'wamid' }] } },
      });
      await dispatch(call(), small);
      const { deps: roomy } = notifyDeps([row({})], { whatsapp: wa }, {
        'POST /v26.0/1/messages': { body: { messages: [{ id: 'wamid' }] } },
      });
      await dispatch(call(), roomy);
      // 2 s budget: the request may not outlive it; default budget: the usual 10 s per request
      expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([2_000, 10_000]);
    } finally {
      timeout.mockRestore();
    }
  });

  it('keeps going when one row update fails and counts only the rows it saved', async () => {
    const logged: unknown[] = [];
    const updates: string[] = [];
    const { deps } = notifyDeps([row({ id: 'a' }), row({ id: 'b' })], {
      logError: error => void logged.push(error),
      store: {
        claim: async () => [row({ id: 'a' }), row({ id: 'b' })],
        update: async id => {
          if (id === 'a') throw new Error('database unavailable');
          updates.push(id);
        },
      },
    });
    const res = await read(await dispatch(call(), deps));
    expect(res.status).toBe(200);
    expect(updates).toEqual(['b']);
    expect(res.body.data).toMatchObject({ claimed: 2, skipped: 1 });
    expect(logged).toHaveLength(1);
  });

  it('fails a row with an invalid date param once instead of retrying it', async () => {
    const wa = { token: 'wa', phoneNumberId: '1', graphVersion: 'v26.0' };
    const { deps, updates, calls } = notifyDeps(
      [row({ template: 'lembrete_atendimento', params: { occupation_name: 'Diarista', starts_at: 'ontem', other_party_name: 'Ana' } })],
      { whatsapp: wa },
    );
    await dispatch(call(), deps);
    expect(updates[0][1]).toMatchObject({ status: 'failed' });
    expect(updates[0][1].error).toMatch(/^invalid_params: starts_at/);
    expect(calls).toHaveLength(0);
  });

  it('validates the limit', async () => {
    expect((await read(await dispatch(call(undefined, { limit: 1000 }), notifyDeps([]).deps))).status).toBe(400);
  });
});
