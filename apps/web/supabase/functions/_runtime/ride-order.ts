import { AsaasClient, ASAAS_PRODUCTION_URL, ASAAS_SANDBOX_URL } from '../_shared/asaas-client.ts';
import type { Intent, RidePspDeps } from '../_shared/ride-psp.ts';
import { ridePspRpc } from './ride-rpc.ts';
import { authenticate, config } from './supabase.ts';
import { orderPaymentContract } from '../_shared/ride-order-psp.ts';

// Environment and secrets belong to the deployment, never to the request.
const configured = Deno.env.get('RIDE_ORDER_ENVIRONMENT');
export const environment = configured === 'live' ? 'live' : 'simulation';
export const namespace = environment === 'live' ? 'RIDE_ORDER_LIVE' : 'RIDE_ORDER_TEST';
const token = Deno.env.get(namespace + '_WEBHOOK_TOKEN')?.trim() ?? '';
const key = Deno.env.get(namespace + '_API_KEY')?.trim();
const enabled = configured === environment && Deno.env.get(namespace + '_ENABLED') === 'true' && token.length >= 32;
export const orderContract = orderPaymentContract(environment);
export const orderDeps: RidePspDeps = {
  api: enabled && key ? new AsaasClient({ apiKey: key, baseUrl: environment === 'live' ? ASAAS_PRODUCTION_URL : ASAAS_SANDBOX_URL,
    fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }) }) : null,
  token: enabled ? token : '', now: () => new Date(), siteUrl: config.siteUrl, allowDevOrigins: environment === 'simulation' && config.allowDevOrigins,
  session: async req => (await authenticate(req))?.user.id ?? null,
  prepare: (order, user) => ridePspRpc<Intent>('ride_prepare_order_payment', {p_order:order,p_payer:user,p_environment:environment}),
  claimSend: order => ridePspRpc<boolean>('ride_claim_order_send', {p_order:order,p_environment:environment}),
  find: order => ridePspRpc<Intent | null>('ride_order_provider_intent', {p_order:order,p_environment:environment}),
  observe: (order, fact) => ridePspRpc('ride_observe_order_payment', {p_order:order,p_environment:environment,p_fact:fact}),
  reportAmbiguous: async (order, ids) => {
    for (const payment of ids) await ridePspRpc('ride_observe_order_payment', {p_order:order,p_environment:environment,p_fact:{payment,reason:'ambiguous_reference'}});
  },
};
