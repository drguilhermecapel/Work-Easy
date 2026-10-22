// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyEscrow, bookingTransition, eventEffect, nextPaymentStatus, parseWebhookEvent,
} from '../../supabase/functions/_shared/asaas-events.ts';
import { bearerToken, secretMatches, timingSafeEqual } from '../../supabase/functions/_shared/secrets.ts';

describe('eventEffect', () => {
  it('maps receipt and confirmation to payment status and the paid transition', () => {
    expect(eventEffect('PAYMENT_RECEIVED')).toMatchObject({ known: true, paymentStatus: 'received', bookingTo: 'paid' });
    expect(eventEffect('PAYMENT_CONFIRMED')).toMatchObject({ known: true, paymentStatus: 'confirmed', bookingTo: 'paid' });
  });

  it('maps refunds, deletions, failures and chargebacks', () => {
    expect(eventEffect('PAYMENT_REFUNDED')).toMatchObject({ paymentStatus: 'refunded', bookingTo: null });
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
    expect(nextPaymentStatus('canceled', 'pending')).toBe('pending');
    expect(nextPaymentStatus('received', 'pending')).toBe('pending'); // cash receipt undone
    expect(nextPaymentStatus('held', 'pending')).toBeNull();
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

  it('extracts bearer tokens', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer   x ')).toBe('x');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
