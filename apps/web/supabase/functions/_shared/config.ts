// Environment for the Edge Functions (docs/ARQUITETURA.md, "Variáveis de
// ambiente"). Read through an injected getter so tests never touch Deno.env.

import { ASAAS_SANDBOX_URL } from './asaas-client.ts';
import { DEFAULT_ASSIST_HOURLY_LIMIT } from './assist.ts';
import { DEFAULT_GRAPH_VERSION } from './notifications.ts';

export type EnvGetter = (name: string) => string | undefined;

export interface FunctionConfig {
  supabaseUrl: string;
  /** Publishable (or legacy anon) key, used with the caller's JWT so RLS applies. */
  publishableKey: string;
  /** Secret (or legacy service role) key, only for writes the contract reserves to the server. */
  serviceKey: string;
  siteUrl?: string;
  /** Localhost dev origins in CORS: on with the Asaas sandbox or ALLOW_DEV_ORIGINS=true. */
  allowDevOrigins: boolean;
  /** Days a past-due Pro keeps the plan after the paid period (PRO_GRACE_DAYS, default 0). */
  proGraceDays: number;
  /** request-assist calls per user per hour (ASSIST_HOURLY_LIMIT, default 10). */
  assistHourlyLimit: number;
  asaas: { apiKey?: string; baseUrl: string; webhookToken?: string };
  whatsapp: { token?: string; phoneNumberId?: string; graphVersion: string };
  email: { resendApiKey?: string; from?: string };
  anthropicApiKey?: string;
  cronSecret?: string;
}

const clean = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

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
  const asaasBaseUrl = clean(get('ASAAS_BASE_URL')) ?? ASAAS_SANDBOX_URL;
  return {
    supabaseUrl: clean(get('SUPABASE_URL')) ?? '',
    publishableKey:
      keyFromDictionary(get('SUPABASE_PUBLISHABLE_KEYS')) ?? clean(get('SUPABASE_ANON_KEY')) ?? '',
    serviceKey:
      clean(get('SUPABASE_SERVICE_ROLE_KEY')) ?? keyFromDictionary(get('SUPABASE_SECRET_KEYS')) ?? '',
    siteUrl: clean(get('SITE_URL')),
    allowDevOrigins: clean(get('ALLOW_DEV_ORIGINS')) === 'true' || asaasBaseUrl.replace(/\/+$/, '') === ASAAS_SANDBOX_URL,
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

export const whatsappConfigured = (c: FunctionConfig) => Boolean(c.whatsapp.token && c.whatsapp.phoneNumberId);
export const emailConfigured = (c: FunctionConfig) => Boolean(c.email.resendApiKey && c.email.from);
