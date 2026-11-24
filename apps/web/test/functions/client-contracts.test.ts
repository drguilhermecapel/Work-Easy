// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageCodec } from '../../lib/imageMetadata';
import { VERIFICATION_LABELS, PRICE_UNIT_LABELS } from '../../catalog/labels';
import { OCCUPATIONS } from '../../catalog/index';
import { handler as accountDelete, CONFIRMATION, type DeleteDeps } from '../../supabase/functions/account-delete/handler.ts';
import { handler as accountExport, type ExportDeps } from '../../supabase/functions/account-export/handler.ts';
import { handler as asaasOnboard, type OnboardDeps } from '../../supabase/functions/asaas-onboard/handler.ts';
import { handler as careSummary, type CareSummaryDeps } from '../../supabase/functions/care-summary/handler.ts';
import { handler as paymentsCreate, type BookingForPayment, type PaymentsCreateDeps } from '../../supabase/functions/payments-create/handler.ts';
import { handler as paymentsVoid, type VoidDeps } from '../../supabase/functions/payments-void/handler.ts';
import {
  handler as providerDocumentUpload, MESSAGES as UPLOAD_MESSAGES, VERIFICATION_STEPS, type UploadDeps,
} from '../../supabase/functions/provider-document-upload/handler.ts';
import { handler as quoteAssist, type QuoteAssistDeps } from '../../supabase/functions/quote-assist/handler.ts';
import {
  handler as subscriptions, TRIAL_ONBOARDING_MESSAGE, TRIAL_UNBOUND_ACCOUNT_MESSAGE, TRIAL_USED_MESSAGE, type SubscriptionRow, type SubscriptionsDeps,
} from '../../supabase/functions/subscriptions-manage/handler.ts';
import type { ModelResult } from '../../supabase/functions/_shared/ai-model.ts';
import { slug as modelSlug } from '../../supabase/functions/_shared/ai-guard.ts';
import { MAX_REFERENCE_CENTS, QUOTE_UNITS } from '../../supabase/functions/_shared/quote-assist.ts';
import { documentFingerprint } from '../../supabase/functions/_shared/secrets.ts';
import type { FakeSupabase } from '../web/fakeSupabase';
import { serveFunction } from './clientContract.ts';
import { asaasWith, baseDeps, BOOKING_ID, PROVIDER, USER, VALID_CNPJ, VALID_CPF } from './helpers.ts';

// A JPEG for the upload: the browser codec of the app is replaced by one that writes this file
const { CLEAN_JPEG } = vi.hoisted(() => {
  const segment = (marker: number, data: number[]): number[] => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];
  return {
    CLEAN_JPEG: Uint8Array.from([
      0xff, 0xd8, ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]), ...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0xff, 0xd9,
    ]),
  };
});

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

vi.mock('../../lib/imageMetadata', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/imageMetadata')>();
  const codec: ImageCodec = {
    decode: async () => ({ width: 1, height: 1, pixels: {} as CanvasImageSource, close: () => undefined }),
    encode: async (_image, type) => new Blob([CLEAN_JPEG], { type }),
  };
  return { ...actual, stripImageMetadata: (file: File, _codec?: ImageCodec, maxBytes?: number) => actual.stripImageMetadata(file, codec, maxBytes) };
});

const { supabase } = await import('../../lib/supabase');
const { toAppError } = await import('../../lib/errors');
const { createCharge } = await import('../../services/payments');
const { voidOpenCharges, CHARGE_VOID_NOTICE } = await import('../../services/bookings');
const { subscribePro, cancelPro, activateReceiving } = await import('../../services/proBilling');
const { exportMyData, deleteMyAccount, DELETE_CONFIRMATION } = await import('../../services/account');
const { uploadProviderDocument } = await import('../../services/providers');
const { suggestQuote, summarizeWeek, QUOTE_ASSIST_LIMITS } = await import('../../services/aiAssist');
const { createCharge: createOwnCharge } = await import('../../services/charges');
const fake = supabase as unknown as FakeSupabase;

/**
 * The app and the functions once disagreed on a request (charges-create refused the `customer` object the
 * form kept sending) and each side's tests only checked its own half. Each test here calls the REAL service
 * of the app, hands the request it builds to the REAL handler of the function (test doubles only for the
 * database, Asaas and the model) and lets the app read what the handler answered.
 *
 * Functions the app does not call have no test here: request-assist (no screen yet), notify-dispatch and
 * background-check-purge (cron), asaas-webhook (Asaas) and asaas-webhooks-sync (admin, by hand).
 * The error codes of every function are checked against lib/errors.ts in client-error-codes.test.ts.
 */

/** What the app sent in its only call, besides the method and headers. */
const sentBody = (): Record<string, unknown> => {
  expect(fake.functionCalls).toHaveLength(1);
  return fake.functionCalls[0].body as Record<string, unknown>;
};

const FUNCTIONS = join(__dirname, '../../supabase/functions');

/**
 * The fields a function names in its body schema (`const Body = object({ ... })`), read from its source. The
 * handlers ignore a field they do not name, so a field the app renamed would be accepted and dropped without
 * a sound. Each test below compares the WHOLE body the app sent (toEqual) and then checks that every field of
 * it is named by the function: a rename on either side fails.
 */
const schemaKeys = (file: string, name = 'Body'): string[] => {
  const source = readFileSync(join(FUNCTIONS, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const declaration = new RegExp(`const ${name}\\b[^=\\n]*= object\\(\\{`).exec(source);
  expect(declaration, `${name} in ${file}`).not.toBeNull();
  let depth = 1;
  let top = '';
  for (let index = (declaration?.index ?? 0) + (declaration?.[0].length ?? 0); depth > 0 && index < source.length; index++) {
    const char = source[index];
    if ('{[('.includes(char)) depth++;
    else if ('}])'.includes(char)) depth--;
    else if (depth === 1) top += char;
  }
  return [...top.matchAll(/([a-z_]+)\s*:/g)].map(match => match[1]);
};

/** Every field of what the app sent is one the function names. */
const expectNamedBy = (body: Record<string, unknown>, file: string, name?: string) => {
  const named = schemaKeys(file, name);
  for (const key of Object.keys(body)) expect(named, `"${key}" is not a field of ${file}`).toContain(key);
};

/** The method and headers of the only call: every function takes a POST, and the app sets no header of its own. */
const sentOptions = () => {
  expect(fake.functionOptions).toHaveLength(1);
  return fake.functionOptions[0];
};

beforeEach(() => fake.reset());

// ---- payments-create (client pays a platform booking) ----------------------------------------------

const BOOKING: BookingForPayment = {
  id: BOOKING_ID, client_id: USER.id, provider_id: PROVIDER.id, occupation_slug: 'eletricista', status: 'accepted', origin: 'platform',
  price_cents: 15000, platform_fee_cents: 0,
};

function paymentsDeps(over: { customerId?: string | null; booking?: Partial<BookingForPayment> } = {}) {
  const { client, calls } = asaasWith({
    'POST /v3/customers': { body: { id: 'cus_1', name: 'Ana' } },
    'POST /v3/payments': {
      body: { id: 'pay_1', status: 'PENDING', value: 150, dueDate: '2026-10-20', billingType: 'PIX', invoiceUrl: 'https://sandbox.asaas.com/i/1' },
    },
    'GET /v3/payments/pay_1/pixQrCode': { body: { encodedImage: 'iVBOR', payload: '000201pix', expirationDate: '2026-10-21 00:00:00' } },
  });
  const deps: PaymentsCreateDeps = {
    ...baseDeps,
    asaas: client,
    session: async () => ({ user: USER, getBooking: async () => ({ ...BOOKING, ...over.booking }) }),
    admin: {
      hasPaidPayment: async () => false,
      findOpenPayment: async () => null,
      getProviderWallet: async () => 'wal_provider',
      getCustomerId: async () => (over.customerId === undefined ? 'cus_1' : over.customerId),
      saveCustomerId: async () => undefined,
      getProfile: async () => ({ full_name: 'Ana Cliente', phone: '11987654321' }),
      insertPayment: async () => ({ id: 'payment-row-1' }),
      markPaymentCanceled: async () => undefined,
      audit: async () => undefined,
    },
  };
  return { deps, calls };
}

const servePaymentsCreate = (over: Parameters<typeof paymentsDeps>[0] = {}) => {
  const { deps, calls } = paymentsDeps(over);
  serveFunction(fake, 'payments-create', request => paymentsCreate(request, deps));
  return calls;
};

describe('payments-create: what createCharge sends and reads', () => {
  it('sends a POST with the booking and the method, and the handler takes it', async () => {
    servePaymentsCreate();
    const charge = await createCharge({ bookingId: BOOKING_ID, method: 'pix' });

    expect(sentBody()).toEqual({ booking_id: BOOKING_ID, method: 'pix' });
    expect(sentOptions()).toEqual({ method: 'POST', headers: undefined });
    // The fields the payment screens read (PaymentPanel: invoice_url, pix.payload, pix.qr_code_base64) are in the answer
    expect(charge).toMatchObject({
      payment_id: 'payment-row-1', method: 'pix', status: 'pending', amount_cents: 15000, invoice_url: 'https://sandbox.asaas.com/i/1',
      pix: { payload: '000201pix', qr_code_base64: 'iVBOR' }, reused: false,
    });
    expect(charge.due_date).toEqual(expect.any(String));
  });

  it('takes every method the payment screen offers', async () => {
    for (const method of ['pix', 'credit_card', 'boleto'] as const) {
      fake.reset();
      servePaymentsCreate();
      const charge = await createCharge({ bookingId: BOOKING_ID, method });
      expect(charge.method, method).toBe(method);
      expect(charge.pix === null, method).toBe(method !== 'pix');
    }
  });

  it('takes the CPF the form typed (digits only) for the first payment, and refuses a first payment without it', async () => {
    const calls = servePaymentsCreate({ customerId: null });
    await createCharge({ bookingId: BOOKING_ID, method: 'pix', cpfCnpj: '529.982.247-25' });
    expect(sentBody()).toEqual({ booking_id: BOOKING_ID, method: 'pix', cpf_cnpj: VALID_CPF });
    expectNamedBy(sentBody(), 'payments-create/handler.ts');
    expect(calls.find(call => call.url.endsWith('/customers'))?.body).toMatchObject({ cpfCnpj: VALID_CPF });

    fake.reset();
    servePaymentsCreate({ customerId: null });
    // The screen opens the CPF field on this code
    await expect(createCharge({ bookingId: BOOKING_ID, method: 'pix' })).rejects.toMatchObject({ code: 'cpf_cnpj_required' });
  });

  it('shows a refusal of the handler with a sentence of the app, not the generic one of its HTTP status', async () => {
    servePaymentsCreate({ booking: { status: 'pending' } });
    await expect(createCharge({ bookingId: BOOKING_ID, method: 'pix' })).rejects.toMatchObject({
      message: 'Só atendimentos aceitos pelo profissional podem ser pagos.',
    });
  });
});

// ---- payments-void (after a booking is canceled) ----------------------------------------------------

function voidDeps(status: string): VoidDeps {
  return {
    ...baseDeps,
    asaas: asaasWith({}).client,
    session: async () => ({
      user: USER,
      getBooking: async () => ({ id: BOOKING_ID, client_id: USER.id, provider_id: PROVIDER.id, status, origin: 'platform' }),
    }),
    admin: { listPendingCharges: async () => [], getSubaccountApiKey: async () => null, markPaymentCanceled: async () => undefined, audit: async () => undefined },
  };
}

describe('payments-void: what voidOpenCharges sends and reads', () => {
  it('sends the booking and the handler answers 200, so the app has nothing to warn about', async () => {
    serveFunction(fake, 'payments-void', request => paymentsVoid(request, voidDeps('canceled')));
    // voidOpenCharges never throws: a body the handler refused would come back as the notice
    expect(await voidOpenCharges(BOOKING_ID)).toBeNull();
    expect(sentBody()).toEqual({ booking_id: BOOKING_ID });
    expectNamedBy(sentBody(), 'payments-void/handler.ts');
    expect(sentOptions()).toEqual({ method: 'POST', headers: undefined });
  });

  it('warns when the handler refuses (the booking is not canceled yet)', async () => {
    serveFunction(fake, 'payments-void', request => paymentsVoid(request, voidDeps('accepted')));
    expect(await voidOpenCharges(BOOKING_ID)).toBe(CHARGE_VOID_NOTICE);
  });
});

// ---- subscriptions-manage (provider's Pro plan) -----------------------------------------------------

const APPROVED = {
  id: PROVIDER.id, plan: 'free', status: 'approved',
  occupations: [{ occupation_slug: 'eletricista', approved: true, registry_status: 'not_required' }],
};
const PLATFORM_SECRET = 'platform-token-0123456789abcdef0123456789';

async function subscriptionsDeps(
  over: { current?: SubscriptionRow | null; trialDays?: number; claimedHashes?: string[]; onboarded?: boolean; unboundAccount?: boolean } = {},
) {
  const accountHash = await documentFingerprint(PLATFORM_SECRET, VALID_CPF);
  const claimed = over.claimedHashes ?? [];
  const { client, calls } = asaasWith({
    'POST /v3/subscriptions': { body: { id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-10-19' } },
    'GET /v3/subscriptions/sub_1/payments': { body: { data: [{ id: 'pay_s1', invoiceUrl: 'https://sandbox.asaas.com/i/s1' }] } },
    'DELETE /v3/subscriptions/sub_1': { body: { deleted: true, id: 'sub_1' } },
  });
  const deps: SubscriptionsDeps = {
    ...baseDeps,
    asaas: client,
    documentSecret: PLATFORM_SECRET,
    session: async () => ({ user: PROVIDER, getProvider: async () => APPROVED }),
    admin: {
      getSubscription: async () => over.current ?? null,
      saveSubscription: async () => undefined,
      claimSubscription: async () => true,
      setProviderPlan: async () => undefined,
      isPaymentOnboardingComplete: async () => over.onboarded !== false,
      getPaymentCpfHash: async () => (over.unboundAccount ? null : accountHash),
      claimTrial: async hash => !claimed.includes(hash),
      releaseTrial: async () => undefined,
      getProPriceCents: async () => 4900,
      getTrialDays: async () => over.trialDays ?? 0,
      getCustomerId: async () => 'cus_p',
      saveCustomerId: async () => undefined,
      getProfile: async () => ({ full_name: 'Ana', phone: null }),
      audit: async () => undefined,
    },
  };
  return { deps, calls, accountHash };
}

const serveSubscriptions = async (over: Parameters<typeof subscriptionsDeps>[0] = {}) => {
  const built = await subscriptionsDeps(over);
  serveFunction(fake, 'subscriptions-manage', request => subscriptions(request, built.deps));
  return built;
};

describe('subscriptions-manage: what subscribePro and cancelPro send and read', () => {
  it('subscribes with the method of the form and reads the fields the Assinatura screen shows', async () => {
    await serveSubscriptions();
    const result = await subscribePro({ method: 'boleto' });

    expect(sentBody()).toEqual({ action: 'subscribe', method: 'boleto' });
    expect(sentOptions()).toEqual({ method: 'POST', headers: undefined });
    expect(result).toMatchObject({ status: 'pending', plan: 'free', price_cents: 4900, invoice_url: 'https://sandbox.asaas.com/i/s1', awaiting_payment: true });
    expect(result.trial_ends_at).toBeNull();
  });

  it('takes every payment method of the form', async () => {
    for (const method of ['pix', 'credit_card', 'boleto'] as const) {
      fake.reset();
      await serveSubscriptions();
      await expect(subscribePro({ method }), method).resolves.toMatchObject({ status: 'pending' });
    }
  });

  it('starts the free trial with the CPF typed with punctuation, and reads the end of the trial', async () => {
    await serveSubscriptions({ trialDays: 7 });
    const result = await subscribePro({ method: 'pix', cpfCnpj: '529.982.247-25' });

    expect(sentBody()).toEqual({ action: 'subscribe', method: 'pix', cpf_cnpj: VALID_CPF });
    expectNamedBy(sentBody(), 'subscriptions-manage/handler.ts');
    expect(result).toMatchObject({ status: 'trialing', plan: 'pro', awaiting_payment: false });
    expect(result.trial_ends_at).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59-03:00$/);
  });

  it('cancels with {action: "cancel"} and reads the date the Pro stays until', async () => {
    const current: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'active', asaas_subscription_id: 'sub_1', current_period_end: '2026-11-19T23:59:59-03:00', canceled_at: null,
    };
    await serveSubscriptions({ current });
    const result = await cancelPro();

    expect(sentBody()).toEqual({ action: 'cancel' });
    expectNamedBy(sentBody(), 'subscriptions-manage/handler.ts');
    expect(result).toEqual({ status: 'canceled', plan: 'pro', pro_until: '2026-11-19T23:59:59-03:00' });
  });

  it('shows the sentence of a refused trial instead of "this record already exists"', async () => {
    const { accountHash } = await serveSubscriptions({ trialDays: 7 });
    fake.reset();
    await serveSubscriptions({ trialDays: 7, claimedHashes: [accountHash] });
    const error = await subscribePro({ method: 'pix', cpfCnpj: VALID_CPF }).catch((err: unknown) => toAppError(err));
    expect(error).toMatchObject({ message: TRIAL_USED_MESSAGE });
  });

  // The server has two reasons for the same code and a sentence for each: the app shows the one it sent
  it('shows the sentence of the server when the trial needs the receiving account (two reasons, one code)', async () => {
    await serveSubscriptions({ trialDays: 7, onboarded: false });
    const notFinished = await subscribePro({ method: 'pix', cpfCnpj: VALID_CPF }).catch((err: unknown) => err);
    expect(notFinished).toMatchObject({ message: TRIAL_ONBOARDING_MESSAGE });

    fake.reset();
    await serveSubscriptions({ trialDays: 7, unboundAccount: true });
    const unbound = await subscribePro({ method: 'pix', cpfCnpj: VALID_CPF }).catch((err: unknown) => err);
    expect(unbound).toMatchObject({ message: TRIAL_UNBOUND_ACCOUNT_MESSAGE });
    expect(TRIAL_ONBOARDING_MESSAGE).not.toBe(TRIAL_UNBOUND_ACCOUNT_MESSAGE);
  });

  it('says there is nothing to cancel, in the app words', async () => {
    await serveSubscriptions();
    await expect(cancelPro()).rejects.toMatchObject({ code: 'no_subscription' });
  });
});

// ---- asaas-onboard (provider opens the receiving account) -------------------------------------------

function onboardDeps() {
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
  return { deps, calls };
}

const PERSON = {
  name: 'Ana Souza', email: 'Ana@Example.com', cpfCnpj: '529.982.247-25', birthDate: '1990-05-20', mobilePhone: '(11) 98765-4321', incomeCents: 500000,
  address: 'Rua Teste', addressNumber: '100', province: 'Pinheiros', postalCode: '05422-000',
};

/** The account the handler asked Asaas to create: proof that a field of the request was used, not just accepted. */
const serveOnboard = () => {
  const { deps, calls } = onboardDeps();
  serveFunction(fake, 'asaas-onboard', request => asaasOnboard(request, deps));
  return () => calls.find(call => call.method === 'POST' && call.url.endsWith('/accounts'))?.body as Record<string, unknown>;
};

describe('asaas-onboard: what activateReceiving sends and reads', () => {
  let createdAccount: ReturnType<typeof serveOnboard>;
  beforeEach(() => {
    createdAccount = serveOnboard();
  });

  it('opens the account of a person (CPF, birth date) and reads what the Assinatura screen shows', async () => {
    const result = await activateReceiving(PERSON);

    expect(sentBody()).toEqual({
      name: 'Ana Souza', email: 'Ana@Example.com', cpf_cnpj: VALID_CPF, mobile_phone: '+5511987654321', income_value_cents: 500000, address: 'Rua Teste',
      address_number: '100', province: 'Pinheiros', postal_code: '05422000', birth_date: '1990-05-20',
    });
    expectNamedBy(sentBody(), 'asaas-onboard/handler.ts');
    expect(createdAccount()).toMatchObject({ birthDate: '1990-05-20', cpfCnpj: VALID_CPF });
    expect(sentOptions()).toEqual({ method: 'POST', headers: undefined });
    expect(result).toMatchObject({ status: 'active', own_charges_enabled: true });
  });

  it('opens the account of a company (CNPJ, company type, complement)', async () => {
    const result = await activateReceiving({
      ...PERSON, name: 'Ana Reformas', cpfCnpj: '11.222.333/0001-81', birthDate: undefined, companyType: 'MEI', complement: 'Sala 2',
    });

    // The whole body, so that a renamed optional field (complement, company_type) cannot pass unseen
    expect(sentBody()).toEqual({
      name: 'Ana Reformas', email: 'Ana@Example.com', cpf_cnpj: VALID_CNPJ, mobile_phone: '+5511987654321', income_value_cents: 500000, address: 'Rua Teste',
      address_number: '100', complement: 'Sala 2', province: 'Pinheiros', postal_code: '05422000', company_type: 'MEI',
    });
    expectNamedBy(sentBody(), 'asaas-onboard/handler.ts');
    // ...and the function used them: the account asked of Asaas carries the complement and the company type
    expect(createdAccount()).toMatchObject({ complement: 'Sala 2', companyType: 'MEI', cpfCnpj: VALID_CNPJ });
    expect(createdAccount()).not.toHaveProperty('birthDate');
    expect(result.own_charges_enabled).toBe(true);
  });

  it('takes every company type of the form', async () => {
    for (const companyType of ['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'] as const) {
      fake.reset();
      const created = serveOnboard();
      await expect(activateReceiving({ ...PERSON, cpfCnpj: VALID_CNPJ, birthDate: undefined, companyType }), companyType).resolves.toMatchObject({ status: 'active' });
      expect(created(), companyType).toMatchObject({ companyType });
    }
  });

  it('takes a landline number and the shortest values the form lets through', async () => {
    await expect(
      activateReceiving({ ...PERSON, name: 'Ana', mobilePhone: '(11) 3456-7890', address: 'Rua', province: 'Sé', addressNumber: 'S', incomeCents: 1 }),
    ).resolves.toMatchObject({ status: 'active' });
  });
});

// ---- account-export / account-delete (LGPD) ----------------------------------------------------------

function exportDeps(failing: string[] = []): ExportDeps {
  return {
    ...baseDeps,
    session: async () => ({
      user: USER,
      selectOwned: async table => {
        if (failing.includes(table)) throw new Error('table unavailable');
        return table === 'profiles' ? [{ id: USER.id, full_name: 'Maria' }] : [];
      },
      selectIn: async () => [],
    }),
    admin: { recordRequest: async () => undefined },
  };
}

describe('account-export: what exportMyData sends and reads', () => {
  it('asks with an empty POST and gets the document the Conta screen downloads', async () => {
    serveFunction(fake, 'account-export', request => accountExport(request, exportDeps()));
    const document = (await exportMyData()) as Record<string, unknown>;

    expect(sentBody()).toEqual({});
    expect(sentOptions()).toEqual({ method: 'POST', headers: undefined });
    expect(document).toMatchObject({ format: 'workeasy-lgpd-export', version: 1, user: { id: USER.id } });
    // The screen warns when this list is not empty: it must always be a list
    expect(document.unavailable).toEqual([]);
  });

  it('lists the tables it could not read where the Conta screen looks for them', async () => {
    serveFunction(fake, 'account-export', request => accountExport(request, exportDeps(['quotes'])));
    expect(((await exportMyData()) as { unavailable: string[] }).unavailable).toEqual(['quotes']);
  });
});

function deleteDeps(over: { blocking?: number; authFails?: boolean } = {}): DeleteDeps {
  return {
    ...baseDeps,
    asaas: null,
    session: async () => ({ user: USER }),
    admin: {
      countBlockingBookings: async () => over.blocking ?? 0,
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
      anonymizeUser: async () => undefined,
      deleteAuthUser: async () => {
        if (over.authFails) throw new Error('auth unavailable');
      },
      audit: async () => undefined,
    },
  };
}

describe('account-delete: what deleteMyAccount sends and reads', () => {
  it('sends the word the handler waits for', async () => {
    serveFunction(fake, 'account-delete', request => accountDelete(request, deleteDeps()));
    await expect(deleteMyAccount(DELETE_CONFIRMATION)).resolves.toBeUndefined();

    expect(sentBody()).toEqual({ confirm: CONFIRMATION });
    expectNamedBy(sentBody(), 'account-delete/handler.ts');
    expect(sentOptions()).toEqual({ method: 'POST', headers: undefined });
    expect(DELETE_CONFIRMATION).toBe(CONFIRMATION);
  });

  it('tells a blocked deletion (a booking in progress) in the app words', async () => {
    serveFunction(fake, 'account-delete', request => accountDelete(request, deleteDeps({ blocking: 1 })));
    await expect(deleteMyAccount(DELETE_CONFIRMATION)).rejects.toMatchObject({ code: 'active_bookings' });
  });

  it('tells a login that could not be removed in the app words', async () => {
    serveFunction(fake, 'account-delete', request => accountDelete(request, deleteDeps({ authFails: true })));
    await expect(deleteMyAccount(DELETE_CONFIRMATION)).rejects.toMatchObject({ code: 'auth_delete_failed' });
  });
});

// ---- provider-document-upload (multipart form) -------------------------------------------------------

interface UploadOver {
  files?: number;
  provider?: boolean;
}

function uploadDeps(over: UploadOver = {}) {
  const stored: Array<{ path: string; contentType: string; bytes: Uint8Array }> = [];
  const deps: UploadDeps = {
    ...baseDeps,
    randomId: () => 'abcdef12',
    session: async () => ({ user: PROVIDER, providerAccount: async () => ({ hasProviderRow: over.provider !== false, profile: { deletedAt: null } }) }),
    storage: {
      countFiles: async (_folder, limit) => Math.min(over.files ?? 0, limit),
      put: async (path, bytes, contentType) => void stored.push({ path, contentType, bytes }),
      remove: async () => undefined,
    },
    records: {
      insert: async row => ({
        id: 'doc-1', step: row.step, storage_path: row.storage_path, status: 'submitted', rejection_reason: null, expires_at: null, created_at: '2026-11-18T12:00:00Z',
      }),
    },
  };
  return { deps, stored };
}

const serveUpload = (over: UploadOver = {}) => {
  const built = uploadDeps(over);
  serveFunction(fake, 'provider-document-upload', request => providerDocumentUpload(request, built.deps));
  return built;
};

const PDF = () => new File(['%PDF-1.4 conteudo'], 'registro.pdf', { type: 'application/pdf' });

describe('provider-document-upload: what uploadProviderDocument sends and reads', () => {
  it('names the same steps as the function', () => {
    expect(Object.keys(VERIFICATION_LABELS).sort()).toEqual([...VERIFICATION_STEPS].sort());
  });

  it('sends step and file as a form, leaving the content type to fetch, and reads the row it stored', async () => {
    const { stored } = serveUpload();
    const row = await uploadProviderDocument({ step: 'registro_profissional', file: PDF() });

    const form = sentBody() as unknown as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect([...form.keys()].sort()).toEqual(['file', 'step']);
    // A hand-written multipart Content-Type would lose the boundary
    expect(sentOptions()).toEqual({ method: undefined, headers: undefined });
    expect(stored).toHaveLength(1);
    expect(stored[0].contentType).toBe('application/pdf');
    // The row is what the document list reads (ProviderDocumentRow)
    expect(row).toMatchObject({ id: 'doc-1', step: 'registro_profissional', status: 'submitted', rejection_reason: null, expires_at: null });
    expect(row.storage_path).toBe(stored[0].path);
    expect(row.created_at).toEqual(expect.any(String));
  });

  it('takes every step of the verification', async () => {
    for (const step of Object.keys(VERIFICATION_LABELS) as Array<keyof typeof VERIFICATION_LABELS>) {
      fake.reset();
      serveUpload();
      await expect(uploadProviderDocument({ step, file: PDF() }), step).resolves.toMatchObject({ step });
    }
  });

  it('sends a photo the browser prepared with the type its bytes have (the function checks them)', async () => {
    const { stored } = serveUpload();
    await uploadProviderDocument({ step: 'documento_selfie', file: new File([CLEAN_JPEG], 'selfie.jpg', { type: 'image/jpeg' }) });

    expect(stored[0].contentType).toBe('image/jpeg');
    expect(stored[0].path).toMatch(/\.jpg$/);
  });

  it('shows the sentence the function sent with a refusal', async () => {
    serveUpload({ files: 60 });
    await expect(uploadProviderDocument({ step: 'cnh', file: PDF() })).rejects.toMatchObject({ message: UPLOAD_MESSAGES.limit });

    fake.reset();
    serveUpload({ provider: false });
    await expect(uploadProviderDocument({ step: 'cnh', file: PDF() })).rejects.toMatchObject({ message: UPLOAD_MESSAGES.notProvider });
  });
});

// ---- quote-assist (provider) -------------------------------------------------------------------------

const quoteDeps = (result: ModelResult | null, over: { consent?: boolean } = {}): QuoteAssistDeps => ({
  ...baseDeps,
  model: 'test-model',
  hourlyLimit: 10,
  usage: { consented: async () => over.consent !== false, take: async () => true },
  classify: result ? async () => result : null,
  admin: { audit: async () => undefined },
  session: async () => ({ user: PROVIDER, getOccupation: async slug => ({ slug, name: 'Pintor', priceUnits: [] }) }),
});

/** The model points the first item to reference price p1 (only valid when the request carried one) or to none. */
const quoteAnswer = (firstRef: string): ModelResult => ({
  kind: 'ok',
  text: JSON.stringify({
    intro: 'Olá! Segue a proposta para a pintura da sala e do corredor.',
    items: [
      { description: 'Pintura de parede, duas demãos', quantity: 40, unit: 'm2', price_ref: firstRef },
      { description: 'Tinta e material', quantity: 1, unit: 'unidade', price_ref: 'nenhum' },
    ],
  }),
});
const QUOTE_ANSWER = quoteAnswer('nenhum');

const serveQuote = (result: ModelResult | null = QUOTE_ANSWER, over: Parameters<typeof quoteDeps>[1] = {}) =>
  serveFunction(fake, 'quote-assist', request => quoteAssist(request, quoteDeps(result, over)));

const DESCRIPTION = 'Pintar a sala e o corredor, uns 40 m² de parede, duas demãos';

describe('quote-assist: what suggestQuote sends and reads', () => {
  it('sends description, occupation and reference prices, and the app accepts the draft', async () => {
    serveQuote(quoteAnswer('p1'));
    const suggestion = await suggestQuote({
      description: `  ${DESCRIPTION}  `,
      occupationSlug: 'pintor',
      referencePrices: [{ label: 'Pintura de parede', unit_price_cents: 3500, unit: 'm2' }],
    });

    expect(sentBody()).toEqual({
      description: DESCRIPTION, occupation_slug: 'pintor', reference_prices: [{ label: 'Pintura de parede', unit_price_cents: 3500, unit: 'm2' }],
    });
    expectNamedBy(sentBody(), '_shared/quote-assist.ts', 'QuoteAssistBody');
    for (const reference of sentBody().reference_prices as Array<Record<string, unknown>>) {
      expectNamedBy(reference, '_shared/quote-assist.ts', 'referencePrice');
    }
    expect(sentOptions()).toEqual({ method: 'POST', headers: undefined });
    expect(suggestion.items).toEqual([
      { description: 'Pintura de parede, duas demãos', quantity: 40, unit: 'm2', unit_price_cents: 3500 },
      { description: 'Tinta e material', quantity: 1, unit: 'unidade', unit_price_cents: null },
    ]);
    expect(suggestion.intro).toContain('Olá');
    expect(suggestion.notice).toEqual(expect.any(String));
  });

  it('takes the limits the form states: shortest and longest text, 20 references with the longest label', async () => {
    serveQuote();
    await suggestQuote({ description: 'x'.repeat(QUOTE_ASSIST_LIMITS.descriptionMin) });
    fake.reset();
    serveQuote();
    await suggestQuote({
      description: 'y'.repeat(QUOTE_ASSIST_LIMITS.descriptionMax),
      referencePrices: Array.from({ length: QUOTE_ASSIST_LIMITS.referencePrices + 5 }, (_, index) => ({
        label: `${index}`.padEnd(QUOTE_ASSIST_LIMITS.labelMax + 20, 'z'), unit_price_cents: 1000,
      })),
    });
    expect((sentBody().reference_prices as unknown[]).length).toBe(QUOTE_ASSIST_LIMITS.referencePrices);
  });

  it('names units and occupations the function knows', () => {
    // Every unit of the catalog is a unit the function accepts in a reference price
    for (const unit of Object.keys(PRICE_UNIT_LABELS)) expect(QUOTE_UNITS as readonly string[], unit).toContain(unit);
    // ...and the function proposes no unit the app does not know (the draft shows "(por m²)" from the catalog labels)
    expect(QUOTE_UNITS.filter(unit => unit !== 'unidade').sort()).toEqual(Object.keys(PRICE_UNIT_LABELS).sort());
    // Every occupation the app can send is a slug the function accepts
    for (const occupation of OCCUPATIONS) {
      expect(modelSlug()(occupation.slug, 'occupation_slug'), occupation.slug).toEqual({ ok: true, value: occupation.slug });
    }
  });

  it('sends each unit of the catalog in a reference price', async () => {
    serveQuote();
    const units = Object.keys(PRICE_UNIT_LABELS) as Array<keyof typeof PRICE_UNIT_LABELS>;
    await suggestQuote({ description: DESCRIPTION, referencePrices: units.map(unit => ({ label: unit, unit_price_cents: 100, unit })) });
    expect((sentBody().reference_prices as unknown[]).length).toBe(Math.min(units.length, QUOTE_ASSIST_LIMITS.referencePrices));
  });

  it('states the same price limit as the function and never sends a reference price above it', async () => {
    expect(QUOTE_ASSIST_LIMITS.referencePriceMaxCents).toBe(MAX_REFERENCE_CENTS);

    // At the limit the function accepts the request; one cent above, it would refuse the whole request as a generic invalid_input
    serveQuote(quoteAnswer('p1'));
    const atLimit = await suggestQuote({
      description: DESCRIPTION, referencePrices: [{ label: 'Projeto', unit_price_cents: MAX_REFERENCE_CENTS, unit: 'projeto' }],
    });
    expect(atLimit.items[0].unit_price_cents).toBe(MAX_REFERENCE_CENTS);

    fake.reset();
    serveQuote();
    const above = await suggestQuote({
      description: DESCRIPTION,
      referencePrices: [
        { label: 'Obra grande', unit_price_cents: MAX_REFERENCE_CENTS + 1, unit: 'projeto' },
        { label: 'Pintura de parede', unit_price_cents: 3500, unit: 'm2' },
      ],
    });
    // The expensive service is left out (the provider types that price); the other one still goes
    expect(sentBody().reference_prices).toEqual([{ label: 'Pintura de parede', unit_price_cents: 3500, unit: 'm2' }]);
    expect(above.items.map(item => item.unit_price_cents)).toEqual([null, null]);

    // Only an expensive one: the request carries no reference_prices at all
    fake.reset();
    serveQuote();
    await suggestQuote({ description: DESCRIPTION, referencePrices: [{ label: 'Obra grande', unit_price_cents: MAX_REFERENCE_CENTS + 1 }] });
    expect(sentBody()).toEqual({ description: DESCRIPTION });
    expectNamedBy(sentBody(), '_shared/quote-assist.ts', 'QuoteAssistBody');
  });

  it('adds the instead-sentence to what the function refuses', async () => {
    serveQuote({ kind: 'refusal' });
    await expect(suggestQuote({ description: DESCRIPTION })).rejects.toMatchObject({ message: expect.stringContaining('Monte os itens manualmente.') });

    fake.reset();
    serveQuote(QUOTE_ANSWER, { consent: false });
    await expect(suggestQuote({ description: DESCRIPTION })).rejects.toMatchObject({ message: expect.stringContaining('concordância') });
  });
});

// ---- charges-create (provider charges an own client) ---------------------------------------------------
// The handler needs a database of bookings, quotes and CRM clients; its acceptance of a request is covered by
// charges-client-contract.test.ts. What this adds: the optional fields (provider_client_id, due_date,
// description) are compared whole and against the fields the function names, since the handler ignores a
// field it does not know and a renamed one would pass.

describe('charges-create: every optional field createCharge sends is one the function names', () => {
  const serveRecorder = () => {
    fake.functionsHandlers['charges-create'] = () => ({ data: { ok: true, data: {} }, error: null });
  };
  const QUOTE_ID = '66666666-6666-4666-8666-666666666666';
  const CRM_CLIENT_ID = '77777777-7777-4777-8777-777777777777';

  it('sends a quote charge with the client, the due date and the description', async () => {
    serveRecorder();
    await createOwnCharge({
      target: { kind: 'quote', id: QUOTE_ID }, method: 'boleto', providerClientId: CRM_CLIENT_ID, dueDate: '2030-01-16', description: '  Pintura da sala  ',
    });
    expect(sentBody()).toEqual({
      quote_id: QUOTE_ID, method: 'boleto', provider_client_id: CRM_CLIENT_ID, due_date: '2030-01-16', description: 'Pintura da sala',
    });
    expectNamedBy(sentBody(), 'charges-create/handler.ts');
  });

  it('sends a booking charge with its own id field', async () => {
    serveRecorder();
    await createOwnCharge({ target: { kind: 'booking', id: BOOKING_ID }, method: 'pix' });
    expect(sentBody()).toEqual({ booking_id: BOOKING_ID, method: 'pix' });
    expectNamedBy(sentBody(), 'charges-create/handler.ts');
  });

  it('reads the fields of the schema correctly (a control for the reader of the source)', () => {
    expect(schemaKeys('charges-create/handler.ts').sort()).toEqual(['booking_id', 'description', 'due_date', 'method', 'provider_client_id', 'quote_id']);
    expect(schemaKeys('asaas-onboard/handler.ts')).toContain('complement');
    expect(schemaKeys('subscriptions-manage/handler.ts').sort()).toEqual(['action', 'cpf_cnpj', 'method']);
  });
});

// ---- care-summary (family) ---------------------------------------------------------------------------

const HOUSE = '55555555-5555-4555-8555-555555555555';

function summaryDeps(result: ModelResult | null, over: { owner?: string; reports?: boolean } = {}): CareSummaryDeps {
  const start = new Date(Date.UTC(2026, 9, 18, 11));
  return {
    ...baseDeps,
    model: 'test-model',
    hourlyLimit: 10,
    usage: { consented: async () => true, take: async () => true },
    classify: result ? async () => result : null,
    admin: { audit: async () => undefined },
    session: async () => ({
      user: USER,
      getHousehold: async id => ({ id, owner_id: over.owner ?? USER.id }),
      loadWeek: async () => ({
        ownerName: 'Maria Família',
        recipients: [{ id: 'rec-1', first_name: 'Lúcia' }],
        caregivers: [{ id: 'cg-1', names: ['Ana Cuidadora'] }],
        shifts:
          over.reports === false
            ? []
            : [{ id: 's1', start, end: new Date(start.getTime() + 12 * 3_600_000), status: 'completed', care_recipient_id: 'rec-1', provider_id: 'cg-1' }],
        reports:
          over.reports === false ? [] : [{ shift_id: 's1', meals: 'Almoço: arroz e frango.', activities: 'Passeou no jardim.', mood: 'animada', notes: null }],
      }),
    }),
  };
}

const SUMMARY_ANSWER: ModelResult = {
  kind: 'ok',
  text: JSON.stringify({
    overview: 'Houve 1 plantão com relatório e a rotina seguiu tranquila.',
    activities: ['[PESSOA_CUIDADA] passeou no jardim.'],
    routine: ['Almoço com arroz e frango.'],
    follow_up: ['Perguntar como foi o passeio.'],
    mentions_health: false,
  }),
};

describe('care-summary: what summarizeWeek sends and reads', () => {
  it('sends the house and the app accepts the summary', async () => {
    serveFunction(fake, 'care-summary', request => careSummary(request, summaryDeps(SUMMARY_ANSWER)));
    const week = await summarizeWeek(HOUSE);

    expect(sentBody()).toEqual({ household_id: HOUSE });
    expectNamedBy(sentBody(), 'care-summary/handler.ts');
    expect(sentOptions()).toEqual({ method: 'POST', headers: undefined });
    expect(week.summary).toMatchObject({ overview: expect.any(String), activities: expect.any(Array), routine: expect.any(Array), follow_up: expect.any(Array) });
    expect(week).toMatchObject({ shifts: 1, reports_used: 1, mentions_health: false, health_notice: null });
  });

  it('accepts the answer for a week with nothing to summarize (no summary, no model call)', async () => {
    serveFunction(fake, 'care-summary', request => careSummary(request, summaryDeps(SUMMARY_ANSWER, { reports: false })));
    const week = await summarizeWeek(HOUSE);
    expect(week.summary).toBeNull();
  });

  it('says a house of someone else is not allowed, in the app words', async () => {
    serveFunction(fake, 'care-summary', request => careSummary(request, summaryDeps(SUMMARY_ANSWER, { owner: PROVIDER.id })));
    await expect(summarizeWeek(HOUSE)).rejects.toMatchObject({ code: 'not_allowed' });
  });
});
