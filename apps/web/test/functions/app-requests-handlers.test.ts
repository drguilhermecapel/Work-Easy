// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { handler as accountDelete, type DeleteDeps } from '../../supabase/functions/account-delete/handler.ts';
import { handler as asaasOnboard, type OnboardDeps } from '../../supabase/functions/asaas-onboard/handler.ts';
import { type ChargesCreateDeps, handler as chargesCreate } from '../../supabase/functions/charges-create/handler.ts';
import { handler as paymentsCreate, type PaymentsCreateDeps } from '../../supabase/functions/payments-create/handler.ts';
import { handler as subscriptions, type SubscriptionRow, type SubscriptionsDeps } from '../../supabase/functions/subscriptions-manage/handler.ts';
import { APP_REQUESTS, CRM_CLIENT_ID } from './appRequests.ts';
import { asaasWith, baseDeps, BOOKING_ID, post, PROVIDER, QUOTE_ID, read, USER, VALID_CNPJ, VALID_CPF } from './helpers.ts';

/**
 * The bodies the app sends (APP_REQUESTS, checked against the app's services in app-requests.test.ts)
 * handed to the real handlers, with doubles for the database and Asaas. This file runs in vitest and in
 * Deno (`npm run test:deno`), so it shows the same bodies accepted in the runtime that serves the functions.
 */

const PLATFORM_SECRET = 'platform-token-0123456789abcdef0123456789';
const APPROVED = {
  id: PROVIDER.id, plan: 'pro', status: 'approved',
  occupations: [{ occupation_slug: 'diarista', approved: true, registry_status: 'not_required' }],
};
const ASAAS_PAYMENT = { id: 'pay_1', status: 'PENDING', value: 150, dueDate: '2030-01-16', billingType: 'PIX', invoiceUrl: 'https://sandbox.asaas.com/i/1' };

function chargesDeps() {
  const inserted: unknown[] = [];
  const { client, calls } = asaasWith({
    'POST /v3/customers': { body: { id: 'cus_sub', name: 'Dona Maria' } },
    'POST /v3/payments': { body: ASAAS_PAYMENT },
    'GET /v3/payments/pay_1/pixQrCode': { body: { encodedImage: 'iVBOR', payload: '000201pix', expirationDate: '2030-01-17 00:00:00' } },
  });
  const deps: ChargesCreateDeps = {
    ...baseDeps,
    asaas: client,
    session: async () => ({
      user: PROVIDER,
      getProvider: async () => APPROVED,
      getBooking: async () => ({
        id: BOOKING_ID, provider_id: PROVIDER.id, client_id: null, provider_client_id: CRM_CLIENT_ID,
        occupation_slug: 'diarista', status: 'completed', origin: 'own', price_cents: 15000,
      }),
      getQuote: async () => ({ id: QUOTE_ID, provider_id: PROVIDER.id, provider_client_id: null, title: 'Pintura', total_cents: 250050, status: 'accepted' }),
      getProviderClient: async () => ({
        provider_id: PROVIDER.id, name: 'Dona Maria', phone: '11987654321', email: 'maria@example.com', cpf_cnpj: VALID_CNPJ, client_id: null,
      }),
    }),
    admin: {
      getSubaccountApiKey: async () => 'sub-key',
      hasPaidCharge: async () => false,
      findOpenCharge: async () => null,
      insertPayment: async row => {
        inserted.push(row);
        return { id: 'charge-1' };
      },
      markPaymentCanceled: async () => undefined,
      audit: async () => undefined,
    },
  };
  return { deps, calls, inserted };
}

describe('charges-create takes the bodies the app sends', () => {
  it('own booking linked to a CRM client', async () => {
    const { deps, calls, inserted } = chargesDeps();
    const res = await read(await chargesCreate(post('charges-create', APP_REQUESTS.chargeOwnBooking), deps));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ payment_id: 'charge-1', method: 'pix', amount_cents: 15000 });
    // The payer comes from the CRM record, in the provider's subaccount
    expect(calls[0].body).toMatchObject({ name: 'Dona Maria', cpfCnpj: VALID_CNPJ });
    expect(calls.every(call => call.headers.access_token === 'sub-key')).toBe(true);
    expect(inserted).toHaveLength(1);
  });

  it('accepted quote with the CRM client the provider picked', async () => {
    const { deps, inserted } = chargesDeps();
    const res = await read(await chargesCreate(post('charges-create', APP_REQUESTS.chargeQuote), deps));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ payment_id: 'charge-1', amount_cents: 250050 });
    expect(inserted).toHaveLength(1);
  });

  it('refuses the old body with `customer`, before Asaas or the database', async () => {
    const { deps, calls, inserted } = chargesDeps();
    const body = { ...APP_REQUESTS.chargeQuote, customer: { cpf_cnpj: VALID_CPF, name: 'Carlos' } };
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
    expect(calls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });
});

describe('payments-create takes the body the app sends', () => {
  it('first payment of a platform booking, with the CPF of the form', async () => {
    const { client, calls } = asaasWith({
      'POST /v3/customers': { body: { id: 'cus_1', name: 'Ana' } },
      'POST /v3/payments': { body: ASAAS_PAYMENT },
      'GET /v3/payments/pay_1/pixQrCode': { body: { encodedImage: 'iVBOR', payload: '000201pix', expirationDate: '2030-01-17 00:00:00' } },
    });
    const deps: PaymentsCreateDeps = {
      ...baseDeps,
      asaas: client,
      session: async () => ({
        user: USER,
        getBooking: async () => ({
          id: BOOKING_ID, client_id: USER.id, provider_id: PROVIDER.id, occupation_slug: 'eletricista', status: 'accepted', origin: 'platform',
          price_cents: 15000, platform_fee_cents: 0,
        }),
      }),
      admin: {
        hasPaidPayment: async () => false,
        findOpenPayment: async () => null,
        getProviderWallet: async () => 'wal_provider',
        getCustomerId: async () => null,
        saveCustomerId: async () => undefined,
        getProfile: async () => ({ full_name: 'Ana Cliente', phone: '11987654321' }),
        insertPayment: async () => ({ id: 'payment-row-1' }),
        markPaymentCanceled: async () => undefined,
        audit: async () => undefined,
      },
    };
    const res = await read(await paymentsCreate(post('payments-create', APP_REQUESTS.payBooking), deps));
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ payment_id: 'payment-row-1', method: 'pix', pix: { payload: '000201pix' } });
    expect(calls.find(call => call.url.endsWith('/customers'))?.body).toMatchObject({ cpfCnpj: VALID_CPF });
  });
});

describe('subscriptions-manage takes the bodies the app sends', () => {
  const deps = (current: SubscriptionRow | null): SubscriptionsDeps => ({
    ...baseDeps,
    asaas: asaasWith({
      'POST /v3/subscriptions': { body: { id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-10-19' } },
      'GET /v3/subscriptions/sub_1/payments': { body: { data: [{ id: 'pay_s1', invoiceUrl: 'https://sandbox.asaas.com/i/s1' }] } },
      'DELETE /v3/subscriptions/sub_1': { body: { deleted: true, id: 'sub_1' } },
    }).client,
    documentSecret: PLATFORM_SECRET,
    session: async () => ({ user: PROVIDER, getProvider: async () => ({ ...APPROVED, plan: current ? 'pro' : 'free' }) }),
    admin: {
      proSalesAllowed: async () => true,
      getSubscription: async () => current,
      saveSubscription: async () => undefined,
      claimSubscription: async () => true,
      setProviderPlan: async () => undefined,
      isPaymentOnboardingComplete: async () => true,
      getPaymentCpfHash: async () => null,
      claimTrial: async () => true,
      releaseTrial: async () => undefined,
      getProPriceCents: async () => 4900,
      getTrialDays: async () => 0,
      getCustomerId: async () => 'cus_p',
      saveCustomerId: async () => undefined,
      getProfile: async () => ({ full_name: 'Ana', phone: null }),
      audit: async () => undefined,
    },
  });

  it('subscribe', async () => {
    const res = await read(await subscriptions(post('subscriptions-manage', APP_REQUESTS.subscribePro), deps(null)));
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ status: 'pending', price_cents: 4900, invoice_url: 'https://sandbox.asaas.com/i/s1' });
  });

  it('cancel', async () => {
    const current: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'active', asaas_subscription_id: 'sub_1', current_period_end: '2026-11-19T23:59:59-03:00', canceled_at: null,
    };
    const res = await read(await subscriptions(post('subscriptions-manage', APP_REQUESTS.cancelPro), deps(current)));
    expect(res.body).toEqual({ ok: true, data: { status: 'canceled', plan: 'pro', pro_until: '2026-11-19T23:59:59-03:00' } });
  });
});

describe('asaas-onboard takes the body the app sends', () => {
  it('opens the receiving account of a person', async () => {
    const { client, calls } = asaasWith({ 'POST /v3/accounts': { body: { id: 'acc_1', walletId: 'wal_1', apiKey: '$aact_sub' } } });
    const deps: OnboardDeps = {
      ...baseDeps,
      asaas: client,
      webhookUrl: 'https://proj.supabase.co/functions/v1/asaas-webhook',
      webhookToken: PLATFORM_SECRET,
      trialDocumentSecret: PLATFORM_SECRET,
      sleep: async () => undefined,
      session: async () => ({ user: PROVIDER, getProvider: async () => APPROVED }),
      admin: {
        getPaymentAccount: async () => null,
        claimOnboarding: async () => true,
        releaseOnboarding: async () => undefined,
        storeSecret: async () => 'secret-uuid',
        savePaymentAccount: async () => undefined,
        audit: async () => undefined,
      },
    };
    const res = await read(await asaasOnboard(post('asaas-onboard', APP_REQUESTS.activateReceiving), deps));
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ status: 'active', own_charges_enabled: true });
    expect(calls.find(call => call.url.endsWith('/accounts'))?.body).toMatchObject({ cpfCnpj: VALID_CPF, birthDate: '1990-05-20' });
  });
});

describe('account-delete takes the body the app sends', () => {
  it('erases the account', async () => {
    const steps: string[] = [];
    const deps: DeleteDeps = {
      ...baseDeps,
      asaas: null,
      session: async () => ({ user: USER }),
      admin: {
        countBlockingBookings: async () => 0,
        getActiveSubscriptionId: async () => null,
        markSubscriptionCanceled: async () => undefined,
        listOpenCharges: async () => [],
        markPaymentCanceled: async () => undefined,
        getSubaccountApiKey: async () => null,
        openSupportTask: async () => undefined,
        removeDocuments: async () => 0,
        cancelShifts: async () => 0,
        cancelUnpaidAcceptedBookings: async () => 0,
        createRequest: async () => 'request-1',
        updateRequest: async () => undefined,
        anonymizeUser: async () => void steps.push('anonymize'),
        deleteAuthUser: async () => void steps.push('delete-auth'),
        audit: async () => undefined,
      },
    };
    const res = await read(await accountDelete(post('account-delete', APP_REQUESTS.deleteAccount), deps));
    expect(res.body.ok).toBe(true);
    expect(steps).toEqual(['anonymize', 'delete-auth']);
  });
});
