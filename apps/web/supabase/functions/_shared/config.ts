// Environment for the Edge Functions (docs/ARQUITETURA.md, "Variáveis de
// ambiente"). Read through an injected getter so tests never touch Deno.env.

import { ASAAS_SANDBOX_URL } from './asaas-client.ts';
import { DEFAULT_ASSIST_HOURLY_LIMIT } from './assist.ts';
import { DEFAULT_GRAPH_VERSION } from './notifications.ts';

export type EnvGetter = (name: string) => string | undefined;

/** A deployment setting is missing or wrong: the function refuses to act instead of guessing. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface FunctionConfig {
  supabaseUrl: string;
  /** Publishable (or legacy anon) key, used with the caller's JWT so RLS applies. */
  publishableKey: string;
  /** Secret (or legacy service role) key, only for writes the contract reserves to the server. */
  serviceKey: string;
  siteUrl?: string;
  /** Production (see isProductionEnv): the Asaas sandbox is refused and localhost is never allowed. */
  production: boolean;
  /** Localhost dev origins in CORS: outside production, on with the Asaas sandbox or ALLOW_DEV_ORIGINS=true. */
  allowDevOrigins: boolean;
  /** Days a past-due Pro keeps the plan after the paid period (PRO_GRACE_DAYS, default 0). */
  proGraceDays: number;
  /** AI assist calls (request-assist, quote-assist, care-summary) per user per hour, one shared counter (ASSIST_HOURLY_LIMIT, default 10). */
  assistHourlyLimit: number;
  /** baseUrl is undefined only in production without ASAAS_BASE_URL; asaasBaseUrl() turns that into a ConfigError. */
  asaas: { apiKey?: string; baseUrl?: string; webhookToken?: string };
  whatsapp: { token?: string; phoneNumberId?: string; graphVersion: string };
  email: { resendApiKey?: string; from?: string };
  anthropicApiKey?: string;
  cronSecret?: string;
}

const clean = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** APP_ENV values that are not production. Any other value counts as production (fail closed). */
const NON_PRODUCTION_ENVS = new Set(['development', 'staging', 'test']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Whether this deployment is production. APP_ENV decides when it is set. Without it, a SITE_URL
 * outside localhost means production, and so does a SITE_URL that does not parse: when in doubt,
 * production rules apply.
 */
export function isProductionEnv(get: EnvGetter): boolean {
  const declared = clean(get('APP_ENV'))?.toLowerCase();
  if (declared !== undefined) return !NON_PRODUCTION_ENVS.has(declared);
  const site = clean(get('SITE_URL'));
  if (site === undefined) return false;
  try {
    return !LOCAL_HOSTS.has(new URL(site).hostname);
  } catch {
    return true;
  }
}

/** New-style keys come as a JSON dictionary (`{"default": "sb_..."}`). */
export function keyFromDictionary(json: string | undefined, name = 'default'): string | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const value = parsed[name];
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Non-negative integer from the environment, or the fallback. */
export function intFromEnv(value: string | undefined, fallback: number, max = 1_000_000): number {
  const text = clean(value);
  if (!text || !/^\d+$/.test(text)) return fallback;
  return Math.min(Number(text), max);
}

export function readConfig(get: EnvGetter): FunctionConfig {
  const production = isProductionEnv(get);
  // Development falls back to the sandbox. Production has no fallback: asaasBaseUrl() refuses to run without it.
  const asaasBaseUrl = clean(get('ASAAS_BASE_URL')) ?? (production ? undefined : ASAAS_SANDBOX_URL);
  return {
    supabaseUrl: clean(get('SUPABASE_URL')) ?? '',
    publishableKey:
      keyFromDictionary(get('SUPABASE_PUBLISHABLE_KEYS')) ?? clean(get('SUPABASE_ANON_KEY')) ?? '',
    serviceKey:
      clean(get('SUPABASE_SERVICE_ROLE_KEY')) ?? keyFromDictionary(get('SUPABASE_SECRET_KEYS')) ?? '',
    siteUrl: clean(get('SITE_URL')),
    production,
    allowDevOrigins:
      !production &&
      (clean(get('ALLOW_DEV_ORIGINS')) === 'true' || asaasBaseUrl?.replace(/\/+$/, '') === ASAAS_SANDBOX_URL),
    proGraceDays: intFromEnv(get('PRO_GRACE_DAYS'), 0, 60),
    assistHourlyLimit: intFromEnv(get('ASSIST_HOURLY_LIMIT'), DEFAULT_ASSIST_HOURLY_LIMIT, 1000),
    asaas: {
      apiKey: clean(get('ASAAS_API_KEY')),
      baseUrl: asaasBaseUrl,
      webhookToken: clean(get('ASAAS_WEBHOOK_TOKEN')),
    },
    whatsapp: {
      token: clean(get('WHATSAPP_TOKEN')),
      phoneNumberId: clean(get('WHATSAPP_PHONE_NUMBER_ID')),
      graphVersion: clean(get('WHATSAPP_GRAPH_VERSION')) ?? DEFAULT_GRAPH_VERSION,
    },
    email: { resendApiKey: clean(get('RESEND_API_KEY')), from: clean(get('EMAIL_FROM')) },
    anthropicApiKey: clean(get('ANTHROPIC_API_KEY')),
    cronSecret: clean(get('CRON_SECRET')),
  };
}

/**
 * The Asaas API base URL of this deployment. Production must name it and must not use the sandbox:
 * a charge sent there looks successful and is fake, so there is no fallback.
 * @throws ConfigError when ASAAS_BASE_URL is missing, or is the sandbox in production
 */
export function asaasBaseUrl(config: FunctionConfig): string {
  const url = config.asaas.baseUrl?.replace(/\/+$/, '');
  if (!url) throw new ConfigError('ASAAS_BASE_URL não definida no servidor (obrigatória em produção).');
  if (config.production && url === ASAAS_SANDBOX_URL) {
    throw new ConfigError('ASAAS_BASE_URL aponta para o sandbox do Asaas, e este ambiente é produção.');
  }
  return url;
}

export const whatsappConfigured = (c: FunctionConfig) => Boolean(c.whatsapp.token && c.whatsapp.phoneNumberId);
export const emailConfigured = (c: FunctionConfig) => Boolean(c.email.resendApiKey && c.email.from);
