// asaas-onboard (prestador): creates the provider's Asaas subaccount
// (POST /v3/accounts) with the fiscal data sent by the app, stores the
// walletId and puts the subaccount API key in Supabase Vault. The key is
// never returned to the app.
//
// Asaas returns the key only once, so everything after createAccount is
// written to survive a failure: the Vault write is retried, the account is
// saved even if it still fails (status key_not_stored, which later calls
// report instead of a misleading already_onboarded), and a claim row keeps two
// simultaneous calls from creating two subaccounts for the same provider.

import type { AsaasClient, AsaasWebhookConfig, CreateAccountInput } from '../_shared/asaas-client.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, callAsaas, corsOf, validated,
} from '../_shared/handler-kit.ts';
import { errors, readJson, route } from '../_shared/http.ts';
import { centsToReais } from '../_shared/money.ts';
import { deriveSubaccountToken } from '../_shared/secrets.ts';
import { email, int, isoDate, object, oneOf, optional, phoneBR, postalCode, string, cpfCnpj } from '../_shared/validate.ts';

export interface PaymentAccount {
  provider_id: string;
  asaas_account_id: string | null;
  asaas_wallet_id: string | null;
  api_key_secret_id: string | null;
  status: string | null;
}

export interface OnboardDeps extends BaseDeps {
  asaas: AsaasClient | null;
  /** `${SUPABASE_URL}/functions/v1/asaas-webhook`, to register the subaccount webhook. */
  webhookUrl: string | null;
  webhookToken?: string;
  session(req: Request): Promise<{ user: AuthUser; getProvider(): Promise<{ id: string; display_name: string | null } | null> } | null>;
  /** Pause between Vault attempts; defaults to setTimeout (tests pass a no-op). */
  sleep?(ms: number): Promise<void>;
  admin: {
    getPaymentAccount(providerId: string): Promise<PaymentAccount | null>;
    /**
     * Reserves the onboarding of one provider (a row with status `creating`).
     * False when another call holds it; a claim older than a few minutes is
     * taken over.
     */
    claimOnboarding(providerId: string): Promise<boolean>;
    /** Drops the claim after Asaas refused the account (nothing was created). */
    releaseOnboarding(providerId: string): Promise<void>;
    /** Stores the subaccount key in Vault (store_provider_payment_secret), returning the secret id. */
    storeSecret(providerId: string, secret: string): Promise<string>;
    savePaymentAccount(row: PaymentAccount): Promise<void>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({
  name: string({ min: 3, max: 120 }),
  email: email(),
  cpf_cnpj: cpfCnpj(),
  birth_date: optional(isoDate()),
  company_type: optional(oneOf(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'] as const)),
  mobile_phone: phoneBR(),
  income_value_cents: int({ min: 1 }),
  address: string({ min: 2, max: 200 }),
  address_number: string({ min: 1, max: 20 }),
  complement: optional(string({ max: 100 })),
  province: string({ min: 2, max: 100 }),
  postal_code: postalCode(),
});

/** Payment events forwarded from the subaccount to asaas-webhook. */
export const SUBACCOUNT_WEBHOOK_EVENTS = [
  'PAYMENT_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED',
  'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
];

/** Statuses of an account whose Asaas key was lost: the subaccount exists but cannot be used. */
export const KEY_LOST_STATUSES = ['key_not_stored', 'key_not_returned'];

const VAULT_ATTEMPTS = 3;

/**
 * Webhook registered in the provider's subaccount. The URL names the provider
 * (`?acct=`) and the token is derived for that provider only (see
 * deriveSubaccountToken), so what the provider can read in their own Asaas
 * panel never works as the platform token.
 */
export async function subaccountWebhook(
  url: string | null,
  platformToken: string | undefined,
  providerId: string,
  notifyEmail: string,
): Promise<AsaasWebhookConfig[] | undefined> {
  if (!url || !platformToken) return undefined;
  const authToken = await deriveSubaccountToken(platformToken, providerId); // 64 hex characters: inside Asaas' 32-255
  const withAccount = new URL(url);
  withAccount.searchParams.set('acct', providerId);
  return [{
    name: 'WorkEasy',
    url: withAccount.toString(),
    email: notifyEmail,
    enabled: true,
    interrupted: false,
    sendType: 'SEQUENTIALLY',
    apiVersion: 3,
    authToken,
    events: SUBACCOUNT_WEBHOOK_EVENTS,
  }];
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function handler(req: Request, deps: OnboardDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const asaas = deps.asaas;
    if (!asaas) throw errors.paymentsNotConfigured();
    const input = validated(Body, await readJson(req));

    const provider = await session.getProvider();
    if (!provider || provider.id !== session.user.id) throw errors.notAllowed('Cadastre-se como prestador antes de ativar o recebimento.');

    const isPerson = input.cpf_cnpj.length === 11;
    if (isPerson && !input.birth_date) throw errors.invalidInput(['birth_date: obrigatório para CPF']);
    if (!isPerson && !input.company_type) throw errors.invalidInput(['company_type: obrigatório para CNPJ']);

    const existing = await deps.admin.getPaymentAccount(provider.id);
    if (existing?.asaas_wallet_id) {
      if (existing.status && KEY_LOST_STATUSES.includes(existing.status)) {
        throw errors.conflict(
          'payment_key_missing',
          'A conta de recebimento foi criada, mas a chave de cobrança não foi guardada. Fale com o suporte para concluir a ativação.',
        );
      }
      throw errors.conflict('already_onboarded', 'O recebimento pelo Asaas já está ativado para este prestador.');
    }
    const account: CreateAccountInput = {
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpf_cnpj,
      mobilePhone: input.mobile_phone.slice(2),
      incomeValue: centsToReais(input.income_value_cents),
      address: input.address,
      addressNumber: input.address_number,
      province: input.province,
      postalCode: input.postal_code,
    };
    if (input.complement) account.complement = input.complement;
    if (isPerson) account.birthDate = input.birth_date;
    else account.companyType = input.company_type;
    const webhooks = await subaccountWebhook(deps.webhookUrl, deps.webhookToken, provider.id, input.email);
    if (webhooks) account.webhooks = webhooks;

    if (!(await deps.admin.claimOnboarding(provider.id))) {
      throw errors.conflict('onboarding_in_progress', 'A ativação do recebimento já está em andamento. Aguarde alguns instantes.');
    }

    let created;
    try {
      created = await callAsaas(() => asaas.createAccount(account));
    } catch (error) {
      // Nothing exists in Asaas: free the claim so the provider can try again
      await deps.admin.releaseOnboarding(provider.id).catch(deps.logError);
      throw error;
    }

    // The account exists from here on and Asaas will not show the key again
    let secretId: string | null = null;
    let status = 'active';
    if (created.apiKey) {
      secretId = await storeKey(deps, provider.id, created.apiKey);
      if (!secretId) status = 'key_not_stored';
    } else {
      status = 'key_not_returned';
    }
    await deps.admin.savePaymentAccount({
      provider_id: provider.id,
      asaas_account_id: created.id,
      asaas_wallet_id: created.walletId,
      api_key_secret_id: secretId,
      status,
    });
    await auditSafely(deps, {
      actor_id: provider.id,
      action: 'payment_account.create',
      entity: 'provider_payment_accounts',
      entity_id: provider.id,
      data: { asaas_account_id: created.id, status, webhook_registered: Boolean(webhooks) },
    });

    return {
      status: 201,
      data: {
        account_id: created.id,
        wallet_id: created.walletId,
        status,
        webhook_registered: Boolean(webhooks),
        own_charges_enabled: secretId !== null,
        ...(secretId === null
          ? { message: 'Conta criada, mas a chave de cobrança não foi guardada. Fale com o suporte para concluir a ativação.' }
          : {}),
      },
    };
  });
}

/** Vault write with a few attempts; null (never throws) so the account is still saved. */
async function storeKey(deps: OnboardDeps, providerId: string, apiKey: string): Promise<string | null> {
  const sleep = deps.sleep ?? wait;
  for (let attempt = 1; attempt <= VAULT_ATTEMPTS; attempt++) {
    try {
      return await deps.admin.storeSecret(providerId, apiKey);
    } catch (error) {
      deps.logError(error);
      if (attempt < VAULT_ATTEMPTS) await sleep(250 * attempt);
    }
  }
  return null;
}
