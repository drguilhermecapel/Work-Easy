import { AsaasClient, ASAAS_PRODUCTION_URL } from '../_shared/asaas-client.ts';
import type { Intent, RidePspDeps } from '../_shared/ride-psp.ts';
import { ridePspRpc } from './ride-rpc.ts';
import { authenticate, config } from './supabase.ts';

// A test project's keys are never a fallback for this deployment. New issuance
// is gated a second time in the database just before the remote POST.
const key = Deno.env.get('RIDE_ASAAS_LIVE_API_KEY')?.trim();
const token = Deno.env.get('RIDE_ASAAS_LIVE_WEBHOOK_TOKEN')?.trim() ?? '';
const enabled = Deno.env.get('RIDE_ASAAS_LIVE_ENABLED') === 'true' && token.length >= 32;
export const rideLive: RidePspDeps = {
  api: enabled && key ? new AsaasClient({ apiKey: key, baseUrl: ASAAS_PRODUCTION_URL, fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }) }) : null,
  token: enabled ? token : '',
  siteUrl: config.siteUrl, allowDevOrigins: false,
  now: () => new Date(), session: async req => (await authenticate(req))?.user.id ?? null,
  prepare: (leg,user) => ridePspRpc<Intent>('ride_live_prepare_charge', { p_leg: leg, p_user: user }),
  find: leg => ridePspRpc<Intent | null>('ride_live_find_charge', { p_leg: leg }),
  claimSend: leg => ridePspRpc<boolean>('ride_live_claim_send', { p_leg: leg }),
  reportAmbiguous: async (leg, ids) => {
    for (const payment of ids) await ridePspRpc('ride_live_observe_charge', { p_leg: leg, p_payment: payment, p_customer: null,
      p_amount: null, p_status: 'review', p_refunded: 0, p_invoice: null, p_reason: 'ambiguous_reference',
      p_fee: null, p_split: null, p_payout: null, p_reversal: null });
  },
  observe: (leg,data) => ridePspRpc('ride_live_observe_charge', { p_leg: leg, p_payment: data.payment, p_customer: data.customer ?? null,
    p_amount: data.amount, p_status: data.status, p_refunded: data.refunded, p_invoice: data.invoice, p_reason: data.reason ?? null,
    p_fee: data.pspFee ?? null, p_split: data.splitCents ?? null, p_payout: data.paidToDriver ?? null, p_reversal: data.returnedByDriver ?? null }),
};
