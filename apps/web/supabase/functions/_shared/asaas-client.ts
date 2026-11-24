// Typed Asaas API v3 client. `fetch` is injected so tests run without network.
//
// Sources consulted (2026-10-19):
//   https://docs.asaas.com/reference/criar-novo-cliente            POST /v3/customers
//   https://docs.asaas.com/reference/criar-nova-cobranca           POST /v3/payments (split[])
//   https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix  GET /v3/payments/{id}/pixQrCode
//   https://docs.asaas.com/reference/recuperar-uma-unica-cobranca  GET /v3/payments/{id} (status, deleted, subscription)
//   https://docs.asaas.com/reference/excluir-cobranca              DELETE /v3/payments/{id}
//   https://docs.asaas.com/reference/estornar-cobranca             POST /v3/payments/{id}/refund (card and Pix only)
//   https://docs.asaas.com/reference/criar-subconta                POST /v3/accounts (walletId, apiKey)
//   https://docs.asaas.com/reference/criar-nova-assinatura         POST /v3/subscriptions
//   https://docs.asaas.com/reference/listar-cobrancas-de-uma-assinatura  GET /v3/subscriptions/{id}/payments
//   https://docs.asaas.com/reference/remover-assinatura            DELETE /v3/subscriptions/{id}
//   https://docs.asaas.com/docs/sobre-os-webhooks                  asaas-access-token header
//   (read 2026-11-24, docs only, nothing called) GET /v3/accounts?cpfCnpj (listAccounts, no apiKey in items),
//   POST /v3/accounts/{id}/accessTokens (createAccessToken, apiKey returned once, needs panel + IP whitelist),
//   GET/POST /v3/webhooks and PUT /v3/webhooks/{id} (the authToken never comes back; max 10 per account)
// Authentication: `access_token` header. Sandbox: https://api-sandbox.asaas.com/v3

import type { AsaasSplitItem } from './split.ts';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type BillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED';

export const ASAAS_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';
export const ASAAS_PRODUCTION_URL = 'https://api.asaas.com/v3';

export interface AsaasErrorItem {
  code: string;
  description: string;
}

export class AsaasError extends Error {
  constructor(
    readonly status: number,
    readonly errors: AsaasErrorItem[],
  ) {
    super(errors[0]?.description ?? `Asaas respondeu ${status}`);
  }
}

export interface CreateCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

export interface AsaasCustomer {
  id: string;
  name: string;
}

export interface CreatePaymentInput {
  customer: string;
  billingType: BillingType;
  /** Reais with two decimals (use centsToReais). */
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  split?: AsaasSplitItem[];
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  dueDate: string;
  billingType: BillingType;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  subscription?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
}

export interface AsaasWebhookConfig {
  name: string;
  url: string;
  email: string;
  enabled: boolean;
  interrupted: boolean;
  sendType: 'SEQUENTIALLY' | 'NON_SEQUENTIALLY';
  events: string[];
  authToken?: string;
  apiVersion?: number;
}

/** A webhook as Asaas lists it: the authToken is never returned, only `hasAuthToken`. */
export interface AsaasWebhook {
  id: string;
  name?: string;
  url: string;
  email?: string;
  enabled?: boolean;
  interrupted?: boolean;
  apiVersion?: number;
  hasAuthToken?: boolean;
  sendType?: string;
  events?: string[];
}

/** PUT /v3/webhooks/{id}: every field is optional and an omitted one keeps its value. */
export type UpdateWebhookInput = Partial<Omit<AsaasWebhookConfig, 'apiVersion' | 'email'>>;

export interface AsaasList<T> {
  hasMore: boolean;
  totalCount?: number;
  limit?: number;
  offset?: number;
  data: T[];
}

/** An item of GET /v3/accounts (no key: Asaas shows it only when the account is created). */
export interface AsaasAccountSummary {
  id: string;
  walletId?: string;
  cpfCnpj?: string;
  email?: string;
  name?: string;
}

export interface CreateAccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone: string;
  incomeValue: number;
  address: string;
  addressNumber: string;
  province: string;
  postalCode: string;
  complement?: string;
  birthDate?: string;
  companyType?: 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION';
  webhooks?: AsaasWebhookConfig[];
}

export interface AsaasAccount {
  id: string;
  walletId: string;
  /** Returned only once, on creation. */
  apiKey: string | null;
}

export interface CreateSubscriptionInput {
  customer: string;
  billingType: BillingType;
  value: number;
  nextDueDate: string;
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  description?: string;
  externalReference?: string;
}

export interface AsaasSubscription {
  id: string;
  /** ACTIVE, INACTIVE or EXPIRED */
  status: string;
  nextDueDate: string;
  deleted?: boolean;
}

export interface AsaasClientOptions {
  apiKey: string;
  /** Required, with no default: the environment is chosen by the caller (asaasBaseUrl in _shared/config.ts). */
  baseUrl: string;
  fetch: FetchLike;
  timeoutMs?: number;
  userAgent?: string;
}

export class AsaasClient {
  private readonly baseUrl: string;

  constructor(private readonly options: AsaasClientOptions) {
    if (!options.apiKey) throw new Error('Asaas API key is required');
    if (!options.baseUrl) throw new Error('Asaas base URL is required');
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    if (!/^https:\/\//.test(this.baseUrl)) throw new Error('ASAAS_BASE_URL must use https');
  }

  /** Same client pointed at a subaccount's own API key. */
  withApiKey(apiKey: string): AsaasClient {
    return new AsaasClient({ ...this.options, apiKey });
  }

  async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      access_token: this.options.apiKey,
      Accept: 'application/json',
      'User-Agent': this.options.userAgent ?? 'WorkEasy/0.1',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.options.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15000),
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) {
      const list = (parsed as { errors?: AsaasErrorItem[] } | null)?.errors;
      throw new AsaasError(
        response.status,
        Array.isArray(list) && list.length ? list : [{ code: `http_${response.status}`, description: `Asaas respondeu ${response.status}` }],
      );
    }
    if (parsed === null) throw new AsaasError(response.status, [{ code: 'invalid_response', description: 'Resposta do Asaas sem JSON' }]);
    return parsed as T;
  }

  createCustomer(input: CreateCustomerInput): Promise<AsaasCustomer> {
    return this.request('POST', '/customers', input);
  }

  createPayment(input: CreatePaymentInput): Promise<AsaasPayment> {
    return this.request('POST', '/payments', input);
  }

  /** Current state of a charge in this account; null when Asaas does not know it here (404). */
  getPayment(paymentId: string): Promise<AsaasPayment | null> {
    return orNullOn404(this.request('GET', `/payments/${encodeURIComponent(paymentId)}`));
  }

  /** Removes an unpaid charge (Asaas refuses it once the charge is paid). */
  deletePayment(paymentId: string): Promise<{ deleted: boolean; id: string }> {
    return this.request('DELETE', `/payments/${encodeURIComponent(paymentId)}`);
  }

  /**
   * Full refund of a paid charge (card or Pix; Asaas answers 400 for other
   * methods or when the balance does not cover it). Returns the charge, whose
   * status is REFUNDED or a refund-in-progress state.
   */
  refundPayment(paymentId: string, description?: string): Promise<AsaasPayment> {
    return this.request('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, description ? { description } : {});
  }

  getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
    return this.request('GET', `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
  }

  async createAccount(input: CreateAccountInput): Promise<AsaasAccount> {
    const raw = await this.request<{ id: string; walletId: string; apiKey?: string; accessToken?: { apiKey?: string } }>(
      'POST',
      '/accounts',
      input,
    );
    // The docs show the key both top-level and under accessToken
    return { id: raw.id, walletId: raw.walletId, apiKey: raw.apiKey ?? raw.accessToken?.apiKey ?? null };
  }

  /**
   * Subaccounts of the root account filtered by CPF/CNPJ (digits). The filter is Asaas', so the
   * caller must still compare `cpfCnpj` of each item; it is not known whether it matches partially.
   */
  async listAccounts(filter: { cpfCnpj: string; offset?: number; limit?: number }): Promise<AsaasList<AsaasAccountSummary>> {
    const query = new URLSearchParams({
      cpfCnpj: filter.cpfCnpj, offset: String(filter.offset ?? 0), limit: String(Math.min(filter.limit ?? 100, 100)),
    });
    return normalizeList(await this.request('GET', `/accounts?${query}`));
  }

  /**
   * New API key of a subaccount (POST /v3/accounts/{id}/accessTokens), shown once. Needs the ROOT
   * key, subaccount key management enabled in the Asaas panel and the egress IP whitelisted; when
   * one is missing Asaas answers 401/403 (AsaasError). `apiKey` is null if the response has none.
   */
  async createAccessToken(
    accountId: string,
    input: { name?: string; expirationDate?: string } = {},
  ): Promise<{ id: string | null; apiKey: string | null }> {
    const raw = await this.request<{ id?: string; apiKey?: string; accessToken?: { apiKey?: string } }>(
      'POST',
      `/accounts/${encodeURIComponent(accountId)}/accessTokens`,
      input,
    );
    return { id: raw.id ?? null, apiKey: raw.apiKey ?? raw.accessToken?.apiKey ?? null };
  }

  /** One page of the webhooks of the account that owns the key (max 100 per page). */
  async listWebhooks(page: { offset?: number; limit?: number } = {}): Promise<AsaasList<AsaasWebhook>> {
    const query = new URLSearchParams({ offset: String(page.offset ?? 0), limit: String(Math.min(page.limit ?? 100, 100)) });
    return normalizeList(await this.request('GET', `/webhooks?${query}`));
  }

  /** Asaas allows 10 webhooks per account; a given authToken is returned only if Asaas generated it. */
  createWebhook(input: AsaasWebhookConfig): Promise<AsaasWebhook> {
    return this.request('POST', '/webhooks', input);
  }

  updateWebhook(webhookId: string, input: UpdateWebhookInput): Promise<AsaasWebhook> {
    return this.request('PUT', `/webhooks/${encodeURIComponent(webhookId)}`, input);
  }

  createSubscription(input: CreateSubscriptionInput): Promise<AsaasSubscription> {
    return this.request('POST', '/subscriptions', input);
  }

  async listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
    const page = await this.request<{ data?: AsaasPayment[] }>(
      'GET',
      `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
    );
    return page.data ?? [];
  }

  getSubscription(subscriptionId: string): Promise<AsaasSubscription | null> {
    return orNullOn404(this.request('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`));
  }

  deleteSubscription(subscriptionId: string): Promise<{ deleted: boolean; id: string }> {
    return this.request('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }
}

function normalizeList<T>(raw: Partial<AsaasList<T>>): AsaasList<T> {
  return { ...raw, hasMore: raw.hasMore === true, data: Array.isArray(raw.data) ? raw.data : [] };
}

async function orNullOn404<T>(call: Promise<T>): Promise<T | null> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof AsaasError && error.status === 404) return null;
    throw error;
  }
}

/** Message for the app when Asaas rejects a call (Asaas texts are already pt-BR). */
export function describeAsaasError(error: AsaasError): string {
  const first = error.errors[0]?.description;
  return first ? `O Asaas recusou a operação: ${first}` : 'O Asaas recusou a operação.';
}
