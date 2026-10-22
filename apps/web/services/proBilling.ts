import { AppError } from '../lib/errors';
import { toE164BR } from '../lib/phone';
import type { Tables } from '../lib/database.types';
import { db, invokeFunction, unwrapMaybe } from './client';
import { guard } from './proErrors';
import { parseCpfCnpj } from './proFormat';
import type { PaymentMethod } from './charges';

export type SubscriptionRow = Pick<Tables<'subscriptions'>, 'plan' | 'status' | 'current_period_end' | 'canceled_at'>;

/** Status values of provider_payment_accounts.status (free text, see docs/ARQUITETURA.md). */
export type PaymentAccountStatus = 'creating' | 'active' | 'key_not_stored' | 'key_not_returned' | string;

export interface PaymentAccountRow {
  status: PaymentAccountStatus | null;
  created_at: string | null;
}

/** The Pro subscription row, or null when the provider never subscribed. Entitlement itself is providers.plan. */
export const getMySubscription = (providerId: string): Promise<SubscriptionRow | null> =>
  guard(async () =>
    unwrapMaybe<SubscriptionRow>(
      await db().from('subscriptions').select('plan, status, current_period_end, canceled_at').eq('provider_id', providerId).maybeSingle(),
    ),
  );

/** Status of the receiving account; the identifiers and keys are never read by the app. */
export const getMyPaymentAccount = (providerId: string): Promise<PaymentAccountRow | null> =>
  guard(async () =>
    unwrapMaybe<PaymentAccountRow>(await db().from('provider_payment_accounts').select('status, created_at').eq('provider_id', providerId).maybeSingle()),
  );

/** A whole-number platform setting readable by providers, or null when it cannot be read (no made-up numbers). */
const readSetting = (key: string): Promise<number | null> =>
  guard(async () => {
    const row = unwrapMaybe<{ value: unknown }>(await db().from('platform_settings').select('value').eq('key', key).maybeSingle());
    return typeof row?.value === 'number' && Number.isSafeInteger(row.value) && row.value > 0 ? row.value : null;
  });

/** platform_settings.pro_price_cents, or null when it cannot be read (no made-up price). */
export const getProPriceCents = (): Promise<number | null> => readSetting('pro_price_cents');

/** platform_settings.pro_trial_days; null when unreadable or zero, so no trial is promised. */
export const getProTrialDays = (): Promise<number | null> => readSetting('pro_trial_days');

/** platform_settings.free_proposals_per_month; null when unreadable or no limit is set. */
export const getFreeProposalsPerMonth = (): Promise<number | null> => readSetting('free_proposals_per_month');

export interface SubscribeResult {
  status: string;
  plan: string;
  price_cents: number;
  invoice_url: string | null;
  awaiting_payment: boolean;
  /** End of the free trial when the subscription started one; null otherwise. */
  trial_ends_at?: string | null;
}

/**
 * Subscribes to the monthly Pro plan. A provider that never subscribed starts with a free trial
 * (`trial_ends_at`); otherwise the Pro starts when the first charge is paid, never before.
 */
export const subscribePro = (input: { method: PaymentMethod; cpfCnpj?: string }): Promise<SubscribeResult> =>
  guard(async () => {
    const body: Record<string, unknown> = { action: 'subscribe', method: input.method };
    if (input.cpfCnpj?.trim()) {
      const cpfCnpj = parseCpfCnpj(input.cpfCnpj);
      if (!cpfCnpj) throw new AppError('cpf_cnpj_required', { message: 'Informe um CPF ou CNPJ válido.' });
      body.cpf_cnpj = cpfCnpj;
    }
    return invokeFunction<SubscribeResult>('subscriptions-manage', body);
  });

export interface CancelResult {
  status: 'canceled';
  plan: string;
  /** Until when the Pro stays (the paid period); null when it ends now. */
  pro_until: string | null;
}

export const cancelPro = (): Promise<CancelResult> =>
  guard(async () => invokeFunction<CancelResult>('subscriptions-manage', { action: 'cancel' }));

export interface ReceivingAccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  /** "YYYY-MM-DD", for a CPF. */
  birthDate?: string;
  /** For a CNPJ. */
  companyType?: 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION';
  mobilePhone: string;
  incomeCents: number;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
  postalCode: string;
}

export interface OnboardResult {
  status: string;
  own_charges_enabled: boolean;
  message?: string;
}

/** Creates the provider's receiving account at Asaas with the tax data (asaas-onboard). */
export const activateReceiving = (input: ReceivingAccountInput): Promise<OnboardResult> =>
  guard(async () => {
    const cpfCnpj = parseCpfCnpj(input.cpfCnpj);
    if (!cpfCnpj) throw new AppError('cpf_cnpj_required', { message: 'Informe um CPF ou CNPJ válido.' });
    const phone = toE164BR(input.mobilePhone);
    if (!phone) throw new AppError('invalid_phone');
    const isPerson = cpfCnpj.length === 11;
    if (isPerson && !input.birthDate) throw new AppError('invalid_input', { message: 'Informe a data de nascimento.' });
    if (!isPerson && !input.companyType) throw new AppError('invalid_input', { message: 'Informe o tipo da empresa.' });
    if (!Number.isSafeInteger(input.incomeCents) || input.incomeCents <= 0) {
      throw new AppError('invalid_input', { message: 'Informe a renda ou o faturamento mensal.' });
    }
    const postalCode = input.postalCode.replace(/\D/g, '');
    if (postalCode.length !== 8) throw new AppError('invalid_input', { message: 'Informe o CEP com 8 dígitos.' });
    const body: Record<string, unknown> = {
      name: input.name.trim(),
      email: input.email.trim(),
      cpf_cnpj: cpfCnpj,
      mobile_phone: phone,
      income_value_cents: input.incomeCents,
      address: input.address.trim(),
      address_number: input.addressNumber.trim(),
      province: input.province.trim(),
      postal_code: postalCode,
    };
    if (isPerson) body.birth_date = input.birthDate;
    else body.company_type = input.companyType;
    if (input.complement?.trim()) body.complement = input.complement.trim();
    return invokeFunction<OnboardResult>('asaas-onboard', body);
  });

