// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyEscrow, bookingTransition, eventEffect, nextPaymentStatus, parseWebhookEvent, redactAsaasPayload, remoteConfirms,
  remoteConfirmsSubscription,
} from '../../supabase/functions/_shared/asaas-events.ts';
import { bearerToken, deriveSubaccountToken, isUuid, secretMatches, timingSafeEqual } from '../../supabase/functions/_shared/secrets.ts';

describe('eventEffect', () => {
  it('maps receipt and confirmation to payment status and the paid transition', () => {
    expect(eventEffect('PAYMENT_RECEIVED')).toMatchObject({ known: true, paymentStatus: 'received', bookingTo: 'paid' });
    expect(eventEffect('PAYMENT_CONFIRMED')).toMatchObject({ known: true, paymentStatus: 'confirmed', bookingTo: 'paid' });
  });

  it('maps refunds, deletions, failures and chargebacks', () => {
    // paid -> canceled is the refund path the database gives the service role
    expect(eventEffect('PAYMENT_REFUNDED')).toMatchObject({ paymentStatus: 'refunded', bookingTo: 'canceled' });
    expect(eventEffect('PAYMENT_DELETED').paymentStatus).toBe('canceled');
    expect(eventEffect('PAYMENT_REPROVED_BY_RISK_ANALYSIS').paymentStatus).toBe('failed');
    expect(eventEffect('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED').paymentStatus).toBe('failed');
    expect(eventEffect('PAYMENT_CHARGEBACK_REQUESTED')).toMatchObject({ paymentStatus: null, bookingTo: 'disputed' });
  });

  it('maps subscription effects', () => {
    expect(eventEffect('PAYMENT_RECEIVED').subscription).toEqual({ status: 'active', extendPeriod: true });
    expect(eventEffect('PAYMENT_OVERDUE').subscription).toEqual({ status: 'past_due', extendPeriod: false });
    expect(eventEffect('SUBSCRIPTION_DELETED').subscription?.status).toBe('canceled');
  });

  it('gives creation and update events no effect, so a late one cannot undo a payment', () => {
    for (const name of ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS']) {
      expect(eventEffect(name)).toMatchObject({ known: true, paymentStatus: null, bookingTo: null });
    }
    expect(eventEffect('PAYMENT_RECEIVED_IN_CASH_UNDONE')).toMatchObject({ paymentStatus: 'pending', revert: true });
    expect(eventEffect('PAYMENT_RESTORED')).toMatchObject({ paymentStatus: 'pending' });
    expect(eventEffect('PAYMENT_RESTORED').revert).toBeUndefined();
  });

  it('knows informational events without effects', () => {
    expect(eventEffect('PAYMENT_CHECKOUT_VIEWED')).toEqual({ known: true, paymentStatus: null, bookingTo: null, subscription: null });
  });

  it('marks unknown events as unknown with no effect', () => {
    expect(eventEffect('PAYMENT_SOMETHING_NEW')).toEqual({ known: false, paymentStatus: null, bookingTo: null, subscription: null });
    expect(eventEffect('')).toMatchObject({ known: false });
    expect(eventEffect('__proto__')).toMatchObject({ known: false });
    expect(eventEffect('constructor')).toMatchObject({ known: false });
  });
});

describe('nextPaymentStatus', () => {
  it('moves forward on the happy path', () => {
    expect(nextPaymentStatus('pending', 'confirmed')).toBe('confirmed');
    expect(nextPaymentStatus('confirmed', 'received')).toBe('received');
    expect(nextPaymentStatus('pending', 'received')).toBe('received');
  });

  it('never moves backwards on out-of-order delivery', () => {
    expect(nextPaymentStatus('received', 'confirmed')).toBeNull();
    expect(nextPaymentStatus('received', 'received')).toBeNull();
    expect(nextPaymentStatus('pending', 'pending')).toBeNull();
    expect(nextPaymentStatus('pending', null)).toBeNull();
  });

  it('treats refunded as terminal and refunds from any state', () => {
    expect(nextPaymentStatus('received', 'refunded')).toBe('refunded');
    expect(nextPaymentStatus('refunded', 'received')).toBeNull();
    expect(nextPaymentStatus('refunded', 'pending')).toBeNull();
  });

  it('fails or cancels only unpaid charges, and restores deleted ones', () => {
    expect(nextPaymentStatus('pending', 'failed')).toBe('failed');
    expect(nextPaymentStatus('received', 'canceled')).toBeNull();
    expect(nextPaymentStatus('canceled', 'pending')).toBe('pending'); // PAYMENT_RESTORED
    expect(nextPaymentStatus('failed', 'pending')).toBe('pending');
    expect(nextPaymentStatus('held', 'pending')).toBeNull();
  });

  it('never sends a paid payment back to pending, except an undone cash receipt', () => {
    // PAYMENT_CREATED / PAYMENT_RESTORED arriving after the payment (out of order)
    for (const paid of ['confirmed', 'received', 'held', 'released'] as const) {
      expect(nextPaymentStatus(paid, 'pending')).toBeNull();
    }
    expect(nextPaymentStatus('received', 'pending', true)).toBe('pending');
    expect(nextPaymentStatus('confirmed', 'pending', true)).toBe('pending');
    expect(nextPaymentStatus('held', 'pending', true)).toBeNull();
    expect(nextPaymentStatus('pending', 'pending', true)).toBeNull();
    expect(nextPaymentStatus('canceled', 'pending', true)).toBeNull();
  });
});

describe('remoteConfirms', () => {
  const paid = { status: 'RECEIVED' };

  it('applies a payment only when Asaas reports it paid now', () => {
    expect(remoteConfirms(eventEffect('PAYMENT_RECEIVED'), paid)).toBe(true);
    expect(remoteConfirms(eventEffect('PAYMENT_CONFIRMED'), { status: 'CONFIRMED' })).toBe(true);
    expect(remoteConfirms(eventEffect('PAYMENT_RECEIVED'), { status: 'PENDING' })).toBe(false);
    expect(remoteConfirms(eventEffect('PAYMENT_RECEIVED'), null)).toBe(false);
    expect(remoteConfirms(eventEffect('PAYMENT_RECEIVED'), { status: 'RECEIVED', deleted: true })).toBe(false);
  });

  it('confirms cancellation, refund, restore and chargeback against the remote state', () => {
    expect(remoteConfirms(eventEffect('PAYMENT_DELETED'), { status: 'PENDING', deleted: true })).toBe(true);
    expect(remoteConfirms(eventEffect('PAYMENT_DELETED'), { status: 'PENDING' })).toBe(false);
    expect(remoteConfirms(eventEffect('PAYMENT_REFUNDED'), { status: 'REFUNDED' })).toBe(true);
    expect(remoteConfirms(eventEffect('PAYMENT_REFUNDED'), paid)).toBe(false);
    expect(remoteConfirms(eventEffect('PAYMENT_RESTORED'), { status: 'PENDING' })).toBe(true);
    expect(remoteConfirms(eventEffect('PAYMENT_RESTORED'), paid)).toBe(false);
    expect(remoteConfirms(eventEffect('PAYMENT_CHARGEBACK_REQUESTED'), { status: 'CHARGEBACK_REQUESTED' })).toBe(true);
    expect(remoteConfirms(eventEffect('PAYMENT_CHARGEBACK_REQUESTED'), paid)).toBe(false);
  });

  it('checks subscription effects against the remote charge', () => {
    expect(remoteConfirmsSubscription(eventEffect('PAYMENT_RECEIVED'), paid)).toBe(true);
    expect(remoteConfirmsSubscription(eventEffect('PAYMENT_RECEIVED'), { status: 'PENDING' })).toBe(false);
    expect(remoteConfirmsSubscription(eventEffect('PAYMENT_OVERDUE'), { status: 'OVERDUE' })).toBe(true);
    // a late OVERDUE for a charge that was paid since
    expect(remoteConfirmsSubscription(eventEffect('PAYMENT_OVERDUE'), paid)).toBe(false);
    expect(remoteConfirmsSubscription(eventEffect('PAYMENT_RECEIVED'), null)).toBe(false);
  });
});

describe('redactAsaasPayload', () => {
  it('drops card data at any depth and keeps the rest', () => {
    const payment = {
      id: 'pay_1', status: 'CONFIRMED', value: 10,
      creditCard: { creditCardNumber: '8829', creditCardBrand: 'VISA', creditCardToken: '76496-token' },
      creditCardToken: 'top-level-token',
      history: [{ creditCardHolderInfo: { cpfCnpj: '1' }, ok: true }],
    };
    const body = { id: 'evt_1', event: 'PAYMENT_CONFIRMED', payment };
    const clean = redactAsaasPayload(body);
    expect(clean).toEqual({
      id: 'evt_1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', status: 'CONFIRMED', value: 10, history: [{ ok: true }] },
    });
    expect(JSON.stringify(clean)).not.toMatch(/token|creditCard|8829/i);
    // the input is not mutated
    expect(payment.creditCard.creditCardToken).toBe('76496-token');
    expect(redactAsaasPayload(null)).toBeNull();
    expect(redactAsaasPayload('x')).toBe('x');
  });
});

describe('applyEscrow and bookingTransition', () => {
  it('holds received money when escrow is on', () => {
    expect(applyEscrow('received', true)).toBe('held');
    expect(applyEscrow('received', false)).toBe('received');
    expect(applyEscrow('refunded', true)).toBe('refunded');
  });

  it('pays only accepted bookings and disputes any open one', () => {
    expect(bookingTransition('accepted', 'paid')).toBe('paid');
    expect(bookingTransition('paid', 'paid')).toBeNull();
    expect(bookingTransition('in_progress', 'paid')).toBeNull();
    expect(bookingTransition('completed', 'disputed')).toBe('disputed');
    expect(bookingTransition('canceled', 'disputed')).toBeNull();
    expect(bookingTransition('accepted', null)).toBeNull();
  });
});

describe('parseWebhookEvent', () => {
  it('requires id and event', () => {
    expect(parseWebhookEvent(null)).toBeNull();
    expect(parseWebhookEvent({ event: 'PAYMENT_RECEIVED' })).toBeNull();
    expect(parseWebhookEvent({ id: 'evt_1' })).toBeNull();
    expect(parseWebhookEvent('x')).toBeNull();
  });

  it('keeps payment and subscription objects when they have an id', () => {
    const event = parseWebhookEvent({
      id: 'evt_1', event: 'PAYMENT_RECEIVED', dateCreated: '2026-10-19 10:00:00',
      payment: { id: 'pay_1', value: 10 }, subscription: { status: 'ACTIVE' },
    });
    expect(event).toEqual({
      id: 'evt_1', event: 'PAYMENT_RECEIVED', dateCreated: '2026-10-19 10:00:00', payment: { id: 'pay_1', value: 10 },
    });
  });
});

describe('secrets', () => {
  it('compares in constant time and only matches equal strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abd', 'abc')).toBe(false);
    expect(timingSafeEqual('ab', 'abc')).toBe(false);
    expect(timingSafeEqual('abcd', 'abc')).toBe(false);
    expect(timingSafeEqual('', 'abc')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(false);
    expect(timingSafeEqual('ção', 'ção')).toBe(true);
  });

  it('never matches when the secret is not configured', () => {
    expect(secretMatches('x', undefined)).toBe(false);
    expect(secretMatches(null, 'x')).toBe(false);
    expect(secretMatches('token-certo', 'token-certo')).toBe(true);
    expect(secretMatches('token-errado', 'token-certo')).toBe(false);
  });

  it('derives one webhook token per provider, different from the platform token', async () => {
    const platform = 'platform-token-0123456789abcdef0123456789';
    const a = '22222222-2222-4222-8222-222222222222';
    const b = '33333333-3333-4333-8333-333333333333';
    const tokenA = await deriveSubaccountToken(platform, a);
    expect(tokenA).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenA).not.toBe(platform);
    expect(tokenA).not.toBe(await deriveSubaccountToken(platform, b));
    expect(tokenA).toBe(await deriveSubaccountToken(platform, a.toUpperCase()));
    expect(tokenA).not.toBe(await deriveSubaccountToken('other-platform-token-0123456789abcdef', a));
    await expect(deriveSubaccountToken(platform, 'not-a-uuid')).rejects.toThrow();
    await expect(deriveSubaccountToken('', a)).rejects.toThrow();
    expect(isUuid(a)).toBe(true);
    expect(isUuid('x')).toBe(false);
  });

  it('extracts bearer tokens', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer   x ')).toBe('x');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
