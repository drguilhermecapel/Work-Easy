// @vitest-environment node
// End-to-end money flow with state: payments-create, payments-void and asaas-webhook share one
// in-memory database (unique pending charge per booking, booking transition matrix) and one
// Asaas double that remembers each charge (paid, deleted, refunded).
import { describe, expect, it } from 'vitest';
import { AsaasClient } from '../../supabase/functions/_shared/asaas-client.ts';
import { bookingTransition } from '../../supabase/functions/_shared/asaas-events.ts';
import { DbError, type AuditEntry } from '../../supabase/functions/_shared/handler-kit.ts';
import type { BookingStatus, PaymentStatus } from '../../supabase/functions/_shared/types.ts';
import { handler as webhook, type WebhookDeps } from '../../supabase/functions/asaas-webhook/handler.ts';
import {
  handler as paymentsCreate, type NewPayment, type PaymentRecord, type PaymentsCreateDeps,
} from '../../supabase/functions/payments-create/handler.ts';
import { handler as paymentsVoid, type VoidDeps } from '../../supabase/functions/payments-void/handler.ts';
import { baseDeps, BOOKING_ID, post, PROVIDER, read, USER, VALID_CPF } from './helpers.ts';

const TOKEN = 'webhook-token-0123456789abcdef0123456789';
const PAID = new Set(['RECEIVED', 'CONFIRMED']);

interface Charge {
  id: string;
  status: string;
  deleted: boolean;
  billingType: string;
  value: number;
  dueDate: string;
  refunds: number;
}

function world(opts: { bookingStatus?: BookingStatus } = {}) {
  const charges = new Map<string, Charge>();
  let seq = 0;
  const asaasCalls: string[] = [];
  const asaasFetch = async (input: string, init: RequestInit = {}) => {
    const path = new URL(input).pathname.replace('/v3', '');
    const method = init.method ?? 'GET';
    asaasCalls.push(`${method} ${path}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (method === 'POST' && path === '/customers') return json(200, { id: 'cus_1' });
    if (method === 'POST' && path === '/payments') {
      const body = JSON.parse(init.body as string);
      const id = `pay_${++seq}`;
      charges.set(id, { id, status: 'PENDING', deleted: false, billingType: body.billingType, value: body.value, dueDate: body.dueDate, refunds: 0 });
      return json(200, { id, status: 'PENDING', value: body.value, dueDate: body.dueDate, billingType: body.billingType, invoiceUrl: `https://i/${id}` });
    }
    const m = /^\/payments\/([^/]+)(\/[a-zA-Z]+)?$/.exec(path);
    if (!m) return json(404, { errors: [{ code: 'nf', description: path }] });
    const charge = charges.get(m[1]);
    if (!charge) return json(404, { errors: [{ code: 'nf', description: 'x' }] });
    if (method === 'GET' && m[2] === '/pixQrCode') return json(200, { encodedImage: 'img', payload: 'pix', expirationDate: '' });
    if (method === 'GET') return json(200, { ...charge });
    if (method === 'DELETE') {
      if (PAID.has(charge.status) || charge.status === 'REFUNDED') return json(400, { errors: [{ code: 'invalid_action', description: 'paid' }] });
      charge.deleted = true;
      return json(200, { deleted: true, id: charge.id });
    }
    if (method === 'POST' && m[2] === '/refund') {
      if (!PAID.has(charge.status) || charge.billingType === 'BOLETO') return json(400, { errors: [{ code: 'invalid_action', description: 'cannot refund' }] });
      charge.status = 'REFUNDED';
      charge.refunds++;
      return json(200, { ...charge });
    }
    return json(404, { errors: [] });
  };
  const asaas = new AsaasClient({ apiKey: 'root', baseUrl: 'https://api-sandbox.asaas.com/v3', fetch: asaasFetch as never });

  // Database
  const bookingRow = { status: opts.bookingStatus ?? ('accepted' as BookingStatus) };
  const payments: Array<NewPayment & { id: string; status: PaymentStatus }> = [];
  const audits: AuditEntry[] = [];
  const logged: unknown[] = [];
  const processedEvents = new Set<string>();
  const view = (p: (typeof payments)[number]): PaymentRecord => ({
    id: p.id, asaas_payment_id: p.asaas_payment_id, method: p.method, status: p.status, amount_cents: p.amount_cents,
    invoice_url: p.invoice_url, pix_qr_code: p.pix_qr_code, pix_payload: p.pix_payload, due_date: p.due_date,
  });
  const PAIDS = ['received', 'confirmed', 'held', 'released'];

  const createDeps: PaymentsCreateDeps = {
    ...baseDeps,
    logError: e => void logged.push(e),
    asaas,
    session: async () => ({
      user: USER,
      getBooking: async () => ({
        id: BOOKING_ID, client_id: USER.id, provider_id: PROVIDER.id, occupation_slug: 'eletricista',
        status: bookingRow.status, origin: 'platform', price_cents: 15000, platform_fee_cents: 0,
      }),
    }),
    admin: {
      hasPaidPayment: async () => payments.some(p => PAIDS.includes(p.status)),
      findOpenPayment: async () => {
        const open = payments.filter(p => p.status === 'pending').at(-1);
        return open ? view(open) : null;
      },
      getProviderWallet: async () => 'wal_1',
      getCustomerId: async () => null,
      saveCustomerId: async () => {},
      getProfile: async () => ({ full_name: 'Ana', phone: null }),
      insertPayment: async row => {
        // the partial unique index
        await Promise.resolve();
        if (payments.some(p => p.status === 'pending')) throw new DbError('duplicate', '23505');
        const saved = { ...row, id: `row_${payments.length + 1}`, status: row.status };
        payments.push(saved);
        return { id: saved.id };
      },
      markPaymentCanceled: async id => {
        const p = payments.find(x => x.id === id)!;
        p.status = 'canceled';
      },
      audit: async e => void audits.push(e),
    },
  };

  const voidDeps: VoidDeps = {
    ...baseDeps,
    logError: e => void logged.push(e),
    asaas,
    session: async () => ({
      user: USER,
      getBooking: async () => ({ id: BOOKING_ID, client_id: USER.id, provider_id: PROVIDER.id, status: bookingRow.status, origin: 'platform' }),
    }),
    admin: {
      listPendingCharges: async () =>
        payments.filter(p => p.status === 'pending').map(p => ({ id: p.id, asaas_payment_id: p.asaas_payment_id })),
      getSubaccountApiKey: async () => 'sub',
      markPaymentCanceled: async id => {
        payments.find(x => x.id === id)!.status = 'canceled';
      },
      audit: async e => void audits.push(e),
    },
  };

  const hookDeps: WebhookDeps = {
    ...baseDeps,
    logError: e => void logged.push(e),
    webhookToken: TOKEN,
    asaas,
    subaccountAsaas: async () => asaas,
    store: {
      recordEvent: async e => {
        const dup = processedEvents.has(e.asaas_event_id);
        return { id: `ev_${e.asaas_event_id}`, processed: dup };
      },
      markProcessed: async id => void processedEvents.add(id.replace(/^ev_/, '')),
      findPayment: async asaasId => {
        const p = payments.find(x => x.asaas_payment_id === asaasId);
        return p ? { id: p.id, status: p.status, booking_id: p.booking_id, provider_id: p.provider_id, escrow: p.escrow } : null;
      },
      updatePayment: async (id, patch) => {
        const p = payments.find(x => x.id === id)!;
        if (patch.status) p.status = patch.status;
      },
      getBookingStatus: async () => bookingRow.status,
      transitionBooking: async (_id, to) => {
        // the database matrix for the service role
        const ok =
          (bookingRow.status === 'accepted' && to === 'paid') ||
          (bookingRow.status === 'paid' && (to === 'released' || to === 'canceled')) ||
          (to === 'disputed' && bookingRow.status !== 'disputed');
        if (!ok) throw new DbError('invalid_transition', 'P0001');
        bookingRow.status = to;
      },
      findSubscription: async () => null,
      updateSubscription: async () => {},
      setProviderPlan: async () => {},
      audit: async e => void audits.push(e),
    },
  };

  let evt = 0;
  const send = async (event: string, asaasPaymentId: string, id = `evt_${++evt}`) =>
    read(
      await webhook(
        new Request('http://localhost/functions/v1/asaas-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'asaas-access-token': TOKEN },
          body: JSON.stringify({ id, event, payment: { id: asaasPaymentId } }),
        }),
        hookDeps,
      ),
    );
  const create = async (method: 'pix' | 'credit_card' | 'boleto' = 'pix') =>
    read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method, cpf_cnpj: VALID_CPF }), createDeps));
  const voidIt = async () => read(await paymentsVoid(post('payments-void', { booking_id: BOOKING_ID }), voidDeps));
  const cancelBooking = () => {
    if (bookingRow.status !== 'accepted' && bookingRow.status !== 'requested') throw new Error('participants cannot cancel');
    bookingRow.status = 'canceled';
  };
  const payRemote = (id: string, status = 'RECEIVED') => {
    charges.get(id)!.status = status;
  };
  const refunds = () => [...charges.values()].reduce((n, c) => n + c.refunds, 0);
  const liveCharges = () => [...charges.values()].filter(c => !c.deleted);
  return { charges, payments, bookingRow, audits, logged, asaasCalls, send, create, voidIt, cancelBooking, payRemote, refunds, liveCharges };
}

describe('money flow end to end (stateful doubles)', () => {
  it('two simultaneous clicks on "pay" leave one pending payment and one live charge in Asaas', async () => {
    const w = world();
    const [a, b] = await Promise.all([w.create('pix'), w.create('pix')]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.payment_id).toBe(b.body.data.payment_id);
    expect(w.payments.filter(p => p.status === 'pending')).toHaveLength(1);
    expect(w.liveCharges()).toHaveLength(1);
  });

  it('a click after the item was paid is refused before Asaas, also while the booking has not moved yet', async () => {
    const w = world();
    const first = await w.create('pix');
    expect(first.status).toBe(201);
    // paid and recorded, but the booking is still accepted (webhook half-way)
    w.payRemote('pay_1');
    w.payments[0].status = 'received';
    const calls = w.asaasCalls.length;
    const again = await w.create('credit_card');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_paid');
    expect(w.asaasCalls.length).toBe(calls);
    // once the booking moved, the booking state refuses it
    await w.send('PAYMENT_RECEIVED', 'pay_1');
    expect(w.bookingRow.status).toBe('paid');
    expect((await w.create('pix')).status).toBe(409);
    expect(w.liveCharges()).toHaveLength(1);
  });

  it('pay -> cancel (void ran) -> Asaas has deleted the charge: a late "received" event changes nothing', async () => {
    const w = world();
    await w.create('pix');
    w.cancelBooking();
    expect((await w.voidIt()).body.data).toMatchObject({ canceled: 1 });
    expect(w.payments[0].status).toBe('canceled');
    const res = await w.send('PAYMENT_RECEIVED', 'pay_1');
    expect(res.body.data.ignored).toBe('status_mismatch');
    expect(w.payments[0].status).toBe('canceled');
    expect(w.bookingRow.status).toBe('canceled');
    expect(w.refunds()).toBe(0);
    // and the canceled booking cannot be charged again
    const again = await w.create('pix');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('booking_not_payable');
  });

  it('pay -> cancel -> paid in the race window: void leaves it, the webhook refunds once, duplicates do not refund again', async () => {
    const w = world();
    await w.create('pix');
    w.payRemote('pay_1'); // paid at the bank before the void reached Asaas
    w.cancelBooking();
    const v = await w.voidIt();
    expect(v.body.data).toMatchObject({ canceled: 0, awaiting_confirmation: 1 });
    expect(w.payments[0].status).toBe('pending');

    const r1 = await w.send('PAYMENT_RECEIVED', 'pay_1');
    expect(r1.body.data).toMatchObject({ received_after_cancel: true, refund: 'requested', payment_status: 'refunded' });
    expect(w.payments[0].status).toBe('refunded');
    expect(w.bookingRow.status).toBe('canceled');
    expect(w.refunds()).toBe(1);

    // same event id again, a different received event, the refund notice: no second refund, coherent state
    expect((await w.send('PAYMENT_RECEIVED', 'pay_1', 'evt_1')).body.data.duplicate).toBe(true);
    await w.send('PAYMENT_RECEIVED', 'pay_1', 'evt_other');
    await w.send('PAYMENT_CONFIRMED', 'pay_1', 'evt_other2');
    await w.send('PAYMENT_REFUNDED', 'pay_1', 'evt_ref');
    expect(w.refunds()).toBe(1);
    expect(w.payments[0].status).toBe('refunded');
    expect(w.bookingRow.status).toBe('canceled');
  });

  it('card: CONFIRMED after cancel refunds; the later RECEIVED does not resurrect anything', async () => {
    const w = world();
    await w.create('credit_card');
    w.payRemote('pay_1', 'CONFIRMED');
    w.cancelBooking();
    await w.voidIt();
    const r = await w.send('PAYMENT_CONFIRMED', 'pay_1');
    expect(r.body.data.refund).toBe('requested');
    const late = await w.send('PAYMENT_RECEIVED', 'pay_1');
    expect(late.body.data.ignored).toBe('status_mismatch');
    expect(w.payments[0].status).toBe('refunded');
    expect(w.refunds()).toBe(1);
  });

  it('boleto paid after cancel: refund refused by Asaas, payment stays received and the audit flags it', async () => {
    const w = world();
    await w.create('boleto');
    w.payRemote('pay_1');
    w.cancelBooking();
    await w.voidIt();
    const r = await w.send('PAYMENT_RECEIVED', 'pay_1');
    expect(r.body.data.refund).toBe('failed');
    expect(w.payments[0].status).toBe('received');
    expect(w.bookingRow.status).toBe('canceled');
    const actions = w.audits.map(a => a.action);
    expect(actions).toContain('payment.received_after_cancel');
    expect(actions).toContain('payment.refund_failed');
  });

  it('void is refused while the booking is not canceled, and is idempotent afterwards', async () => {
    const w = world();
    await w.create('pix');
    const early = await w.voidIt();
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('booking_not_canceled');
    expect(w.payments[0].status).toBe('pending');
    w.cancelBooking();
    await w.voidIt();
    const second = await w.voidIt();
    expect(second.body.data).toMatchObject({ canceled: 0, awaiting_confirmation: 0 });
  });

  it('a paid booking cannot be canceled by a participant, so a paid item never loses its money silently', () => {
    expect(bookingTransition('accepted', 'paid')).toBe('paid');
    const w = world({ bookingStatus: 'paid' });
    expect(() => w.cancelBooking()).toThrow();
  });
});
