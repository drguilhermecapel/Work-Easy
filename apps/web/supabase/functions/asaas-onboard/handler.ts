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

import { AsaasError, type AsaasAccountSummary, type AsaasClient, type AsaasWebhookConfig, type CreateAccountInput } from '../_shared/asaas-client.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, callAsaas, corsOf, toHttpError, validated,
} from '../_shared/handler-kit.ts';
import { errors, readJson, route } from '../_shared/http.ts';
import { centsToReais } from '../_shared/money.ts';
import { type ProviderApproval, requireApprovedProvider } from '../_shared/provider-approval.ts';
import { deriveSubaccountToken, documentFingerprint } from '../_shared/secrets.ts';
import { SUBACCOUNT_WEBHOOK_EVENTS, subaccountWebhookUrl } from '../_shared/subaccount-webhook.ts';
import { email, int, isoDate, object, oneOf, onlyDigits, optional, phoneBR, postalCode, string, cpfCnpj } from '../_shared/validate.ts';

export interface PaymentAccount {
  provider_id: string;
  asaas_account_id: string | null;
  asaas_wallet_id: string | null;
  api_key_secret_id: string | null;
  status: string | null;
  /** documentFingerprint of the CPF/CNPJ Asaas validated; null when no platform token is configured. */
  cpf_hash?: string | null;
}

export interface OnboardDeps extends BaseDeps {
  asaas: AsaasClient | null;
  /** `${SUPABASE_URL}/functions/v1/asaas-webhook`, to register the subaccount webhook. */
  webhookUrl: string | null;
  webhookToken?: string;
  /** Key of the CPF/CNPJ fingerprint used by the free trial (TRIAL_DOCUMENT_SECRET). */
  trialDocumentSecret?: string;
  session(req: Request): Promise<{
    user: AuthUser;
    getProvider(): Promise<(ProviderApproval & { id: string; plan: string }) | null>;
  } | null>;
  /** Pause between Vault attempts; defaults to setTimeout (tests pass a no-op). */
  sleep?(ms: number): Promise<void>;
  admin: {
    getPaymentAccount(providerId: string): Promise<PaymentAccount | null>;
    /**
     * Reserves the onboarding of one provider (a row with status `creating`).
     * False when another call holds it; a claim older than a few minutes is
     * taken over, which answers `'resumed'`: the dead run may already have
     * created the subaccount in Asaas. True is a fresh claim.
     */
    claimOnboarding(providerId: string): Promise<boolean | 'resumed'>;
    /** Whether the Asaas account already belongs to another provider's row (a CPF reused by two logins). */
    accountLinkedToOther?(asaasAccountId: string, providerId: string): Promise<boolean>;
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

export { SUBACCOUNT_WEBHOOK_EVENTS };

/** Statuses of an account whose Asaas key was lost: the subaccount exists but cannot be used. */
export const KEY_LOST_STATUSES = ['key_not_stored', 'key_not_returned'];

const VAULT_ATTEMPTS = 3;
const SAVE_ATTEMPTS = 3;

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
  return [{
    name: 'WorkEasy',
    url: subaccountWebhookUrl(url, providerId),
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
    // The receiving account (and the card, Pix and boleto charges on it) waits for the admin's approval
    requireApprovedProvider(provider);

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
    // Computed before createAccount: the key Asaas returns once must not be lost to an error here.
    // The free trial later needs the same CPF/CNPJ (subscriptions-manage).
    const cpfHash = deps.trialDocumentSecret ? await documentFingerprint(deps.trialDocumentSecret, input.cpf_cnpj) : null;

    const claim = await deps.admin.claimOnboarding(provider.id);
    if (!claim) {
      throw errors.conflict('onboarding_in_progress', 'A ativação do recebimento já está em andamento. Aguarde alguns instantes.');
    }

    // A claim taken over from a dead run: that run may have created the subaccount (and lost its
    // key) before dying, so look for it before creating another. A failed lookup stops here WITHOUT
    // releasing the claim: releasing would let the next try start as a fresh claim and create blindly.
    let created: { id: string; walletId: string; apiKey: string | null } | null = null;
    let recovered = false;
    if (claim === 'resumed') {
      const found = await findAccount(asaas, input.cpf_cnpj);
      if (found.length > 1) return await ambiguous(deps, provider.id, found.length);
      if (found.length === 1) {
        await ensureNotLinkedToOther(deps, provider.id, found[0].id);
        created = await recoverKey(deps, asaas, found[0]);
        recovered = true;
      }
    }

    if (!created) {
      try {
        created = await asaas.createAccount(account);
      } catch (error) {
        // Asaas did not say what it does with a repeated CPF/CNPJ (no documented code): after a 400, one
        // lookup by CPF/CNPJ tells whether the account is in fact there.
        const found = error instanceof AsaasError && error.status === 400
          ? await findAccount(asaas, input.cpf_cnpj).catch(lookupError => (deps.logError(lookupError), []))
          : [];
        if (found.length > 1) return await ambiguous(deps, provider.id, found.length);
        if (found.length === 1) {
          await ensureNotLinkedToOther(deps, provider.id, found[0].id);
          created = await recoverKey(deps, asaas, found[0]);
          recovered = true;
        } else {
          // Nothing exists in Asaas: free the claim so the provider can try again
          await deps.admin.releaseOnboarding(provider.id).catch(deps.logError);
          throw toHttpError(error);
        }
      }
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
    // The account exists in Asaas: losing this write would leave a claim that, once stale, is taken
    // over and creates a second subaccount. A few attempts, and a trail if none of them works.
    try {
      await saveAccount(deps, {
        provider_id: provider.id,
        asaas_account_id: created.id,
        asaas_wallet_id: created.walletId,
        api_key_secret_id: secretId,
        status,
        cpf_hash: cpfHash,
      });
    } catch (error) {
      await auditSafely(deps, {
        actor_id: provider.id,
        action: 'payment_account.orphan',
        entity: 'provider_payment_accounts',
        entity_id: provider.id,
        data: { asaas_account_id: created.id, asaas_wallet_id: created.walletId, key_stored: secretId !== null, api_key_secret_id: secretId },
      });
      throw error;
    }
    await auditSafely(deps, {
      actor_id: provider.id,
      action: !recovered ? 'payment_account.create' : secretId !== null ? 'payment_account.recovered' : 'payment_account.recovered_without_key',
      entity: 'provider_payment_accounts',
      entity_id: provider.id,
      data: { asaas_account_id: created.id, status, webhook_registered: !recovered && Boolean(webhooks) },
    });

    return {
      status: 201,
      data: {
        account_id: created.id,
        wallet_id: created.walletId,
        status,
        // A recovered account was not created by this call, so its webhook is checked by asaas-webhooks-sync
        webhook_registered: !recovered && Boolean(webhooks),
        ...(recovered ? { recovered: true } : {}),
        own_charges_enabled: secretId !== null,
        ...(secretId === null
          ? { message: 'Conta criada, mas a chave de cobrança não foi guardada. Fale com o suporte para concluir a ativação.' }
          : {}),
      },
    };
  });
}

/**
 * Subaccounts of the root account for this CPF/CNPJ. Only items whose own cpfCnpj (digits) equals
 * the request and that carry an id and a walletId count: Asaas' filter may match loosely.
 */
async function findAccount(asaas: AsaasClient, cpfCnpj: string): Promise<AsaasAccountSummary[]> {
  const wanted = onlyDigits(cpfCnpj);
  const page = await callAsaas(() => asaas.listAccounts({ cpfCnpj: wanted, limit: 100 }));
  return page.data.filter(item => item.id && item.walletId && onlyDigits(item.cpfCnpj ?? '') === wanted);
}

async function ambiguous(deps: OnboardDeps, providerId: string, count: number): Promise<never> {
  await auditSafely(deps, {
    actor_id: providerId,
    action: 'payment_account.onboarding_ambiguous',
    entity: 'provider_payment_accounts',
    entity_id: providerId,
    data: { accounts_found: count },
  });
  // The claim stays: nothing is created until support decides which account is the provider's
  throw errors.conflict(
    'onboarding_ambiguous',
    'Há mais de uma conta de recebimento para este documento. Fale com o suporte para concluir a ativação.',
  );
}

async function ensureNotLinkedToOther(deps: OnboardDeps, providerId: string, asaasAccountId: string): Promise<void> {
  if (await deps.admin.accountLinkedToOther?.(asaasAccountId, providerId)) {
    await ambiguous(deps, providerId, 1);
  }
}

/**
 * The subaccount exists: ask Asaas for a new key with the root key (POST /accounts/{id}/accessTokens).
 * Asaas refuses with 401/403 when subaccount key management is off in the panel or the egress IP is
 * not whitelisted; the account is then kept without a key (key_not_returned: support issues one).
 */
async function recoverKey(
  deps: OnboardDeps,
  asaas: AsaasClient,
  account: AsaasAccountSummary,
): Promise<{ id: string; walletId: string; apiKey: string | null }> {
  let apiKey: string | null = null;
  try {
    apiKey = (await asaas.createAccessToken(account.id, { name: 'WorkEasy' })).apiKey;
  } catch (error) {
    if (!(error instanceof AsaasError && (error.status === 401 || error.status === 403))) throw toHttpError(error);
    deps.logError(new Error(`Asaas recusou gerar chave da subconta ${account.id}: ${error.status}`));
  }
  return { id: account.id, walletId: account.walletId as string, apiKey };
}

/** Writes the account row with a few attempts; throws the last error if none works. */
async function saveAccount(deps: OnboardDeps, row: Parameters<OnboardDeps['admin']['savePaymentAccount']>[0]): Promise<void> {
  const sleep = deps.sleep ?? wait;
  for (let attempt = 1; ; attempt++) {
    try {
      await deps.admin.savePaymentAccount(row);
      return;
    } catch (error) {
      deps.logError(error);
      if (attempt >= SAVE_ATTEMPTS) throw error;
      await sleep(250 * attempt);
    }
  }
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
