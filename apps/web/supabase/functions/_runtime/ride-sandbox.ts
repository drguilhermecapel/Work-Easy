import { AsaasClient, ASAAS_SANDBOX_URL } from '../_shared/asaas-client.ts';
import { HttpError } from '../_shared/http.ts';
import { authenticate, config, serviceClient } from './supabase.ts';
import type { Intent, SandboxDeps } from '../ride-sandbox-checkout/handler.ts';

const apiKey = Deno.env.get('RIDE_ASAAS_SANDBOX_API_KEY')?.trim();
const token = Deno.env.get('RIDE_ASAAS_SANDBOX_WEBHOOK_TOKEN')?.trim() ?? '';
const enabled = Deno.env.get('RIDE_ASAAS_SANDBOX_ENABLED') === 'true' && token.length >= 32;

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await serviceClient().rpc(name, args);
  if (error) {
    if (error.message === 'not_allowed') throw new HttpError(403, 'not_allowed', 'Acesso à cobrança indisponível.');
    if (error.code === 'P0001') throw new HttpError(409, 'ride_psp_review', 'Consulte a situação deste trecho com a operação.');
    throw new Error('Falha ao gravar a conciliação do trecho.');
  }
  return data as T;
}

export const rideSandbox: SandboxDeps = {
  api: enabled && apiKey ? new AsaasClient({ apiKey, baseUrl: ASAAS_SANDBOX_URL, fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }) }) : null,
  token: enabled ? token : '',
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now: () => new Date(),
  session: async req => (await authenticate(req))?.user.id ?? null,
  prepare: (leg, user) => call<Intent>('ride_sandbox_prepare_charge', { p_leg: leg, p_user: user }),
  claimSend: leg => call<boolean>('ride_sandbox_claim_send', { p_leg: leg }),
  find: leg => call<Intent | null>('ride_sandbox_find_charge', { p_leg: leg }),
  observe: (leg, data) => call('ride_sandbox_observe_charge', {
    p_leg: leg, p_payment: data.payment, p_customer: data.customer, p_amount: data.amount,
    p_status: data.status, p_refunded: data.refunded, p_invoice: data.invoice,
  }),
};
