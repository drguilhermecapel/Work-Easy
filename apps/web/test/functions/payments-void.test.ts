// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../supabase/functions/_shared/handler-kit.ts';
import { handler, type BookingForVoid, type VoidDeps } from '../../supabase/functions/payments-void/handler.ts';
import { asaasWith, baseDeps, BOOKING_ID, post, PROVIDER, read, USER } from './helpers.ts';

const BOOKING: BookingForVoid = { id: BOOKING_ID, client_id: USER.id, provider_id: PROVIDER.id, status: 'canceled', origin: 'platform' };

const del = (id: string) => `DELETE /v3/payments/${id}`;
const get = (id: string) => `GET /v3/payments/${id}`;

function voidDeps(over: {
  booking?: BookingForVoid | null;
  user?: typeof USER;
  charges?: Array<{ id: string; asaas_payment_id: string }>;
  routes?: Parameters<typeof asaasWith>[0];
  apiKey?: string | null;
  noAsaas?: boolean;
  noSession?: boolean;
} = {}) {
  const canceled: string[] = [];
  const audits: AuditEntry[] = [];
  const { client, calls } = asaasWith(over.routes ?? { [del('pay_1')]: { body: { deleted: true, id: 'pay_1' } } });
  const deps: VoidDeps = {
    ...baseDeps,
    asaas: over.noAsaas ? null : client,
    session: async () =>
      over.noSession
        ? null
        : { user: over.user ?? USER, getBooking: async () => (over.booking === undefined ? BOOKING : over.booking) },
    admin: {
      listPendingCharges: async () => over.charges ?? [{ id: 'row-1', asaas_payment_id: 'pay_1' }],
      getSubaccountApiKey: async () => (over.apiKey === undefined ? 'sub-key' : over.apiKey),
      markPaymentCanceled: async id => void canceled.push(id),
      audit: async entry => void audits.push(entry),
    },
  };
  return { deps, calls, canceled, audits };
}

const call = async (deps: VoidDeps, body: unknown = { booking_id: BOOKING_ID }) =>
  read(await handler(post('payments-void', body), deps));

describe('payments-void', () => {
  it('needs a session, the Asaas credential and a valid body', async () => {
    expect((await call(voidDeps({ noSession: true }).deps)).status).toBe(401);
    const none = await call(voidDeps({ noAsaas: true }).deps);
    expect(none.status).toBe(503);
    expect(none.body.error.code).toBe('payments_not_configured');
    const bad = await call(voidDeps().deps, { booking_id: 'x' });
    expect(bad.status).toBe(400);
  });

  it('only serves a participant of an existing, canceled booking', async () => {
    expect((await call(voidDeps({ booking: null }).deps)).status).toBe(404);
    const stranger = await call(voidDeps({ user: { ...USER, id: '99999999-9999-4999-8999-999999999999' } }).deps);
    expect(stranger.status).toBe(403);
    const notCanceled = await call(voidDeps({ booking: { ...BOOKING, status: 'accepted' } }).deps);
    expect(notCanceled.status).toBe(409);
    expect(notCanceled.body.error.code).toBe('booking_not_canceled');
    // the provider takes part too
    expect((await call(voidDeps({ user: PROVIDER }).deps)).status).toBe(200);
  });

  it('removes the open charge in the platform account, marks it canceled and audits', async () => {
    const { deps, calls, canceled, audits } = voidDeps();
    const res = await call(deps);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ booking_id: BOOKING_ID, canceled: 1, awaiting_confirmation: 0 });
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['DELETE /v3/payments/pay_1']);
    expect(calls[0].headers.access_token).toBe('root-key');
    expect(canceled).toEqual(['row-1']);
    expect(audits[0]).toMatchObject({ action: 'payment.void', entity_id: 'row-1', actor_id: USER.id });
  });

  it('uses the provider subaccount key for an own booking, and says so when there is none', async () => {
    const own = voidDeps({ booking: { ...BOOKING, origin: 'own' }, user: PROVIDER });
    expect((await call(own.deps)).status).toBe(200);
    expect(own.calls[0].headers.access_token).toBe('sub-key');
    const noKey = voidDeps({ booking: { ...BOOKING, origin: 'own' }, user: PROVIDER, apiKey: null });
    const res = await call(noKey.deps);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('payment_key_missing');
    expect(noKey.calls).toEqual([]);
  });

  it('is idempotent: no open charge is a 200 with zeros and no Asaas call', async () => {
    const { deps, calls } = voidDeps({ charges: [] });
    const res = await call(deps);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ booking_id: BOOKING_ID, canceled: 0, awaiting_confirmation: 0 });
    expect(calls).toEqual([]);
  });

  it('counts a charge Asaas no longer has (404, or already deleted) as done', async () => {
    const gone = voidDeps({
      charges: [{ id: 'r1', asaas_payment_id: 'pay_1' }, { id: 'r2', asaas_payment_id: 'pay_2' }],
      routes: {
        [del('pay_1')]: { status: 404, body: { errors: [] } },
        [del('pay_2')]: { status: 400, body: { errors: [{ code: 'x', description: 'já removida' }] } },
        [get('pay_2')]: { body: { id: 'pay_2', status: 'PENDING', deleted: true } },
      },
    });
    const res = await call(gone.deps);
    expect(res.body.data).toMatchObject({ canceled: 2, awaiting_confirmation: 0 });
    expect(gone.canceled).toEqual(['r1', 'r2']);
  });

  it('leaves a charge that was paid meanwhile pending for the webhook (which refunds it)', async () => {
    const { deps, canceled, audits } = voidDeps({
      routes: {
        [del('pay_1')]: { status: 400, body: { errors: [{ code: 'x', description: 'Cobrança já recebida' }] } },
        [get('pay_1')]: { body: { id: 'pay_1', status: 'RECEIVED' } },
      },
    });
    const res = await call(deps);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ canceled: 0, awaiting_confirmation: 1 });
    expect(canceled).toEqual([]);
    expect(audits.map(a => a.action)).toEqual(['payment.void_paid']);
  });

  it('answers an error when a charge could not be removed, after trying the others', async () => {
    const { deps, canceled } = voidDeps({
      charges: [{ id: 'r1', asaas_payment_id: 'pay_1' }, { id: 'r2', asaas_payment_id: 'pay_2' }],
      routes: {
        [del('pay_1')]: { status: 503, body: {} },
        [del('pay_2')]: { body: { deleted: true, id: 'pay_2' } },
      },
    });
    const res = await call(deps);
    expect(res.status).toBe(502);
    expect(canceled).toEqual(['r2']);
  });

  it('does not fail only because the audit entry failed', async () => {
    const { deps } = voidDeps();
    deps.admin.audit = async () => {
      throw new Error('audit_log unavailable');
    };
    expect((await call(deps)).status).toBe(200);
  });
});
