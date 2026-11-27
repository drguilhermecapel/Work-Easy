import { environment, namespace, orderDeps } from './ride-order.ts';
import { ridePspRpc } from './ride-rpc.ts';
import type { TransferDeps } from '../_shared/ride-order-adjustments.ts';
import { AsaasClient, ASAAS_PRODUCTION_URL, ASAAS_SANDBOX_URL } from '../_shared/asaas-client.ts';
const token = Deno.env.get(namespace + '_TRANSFER_TOKEN')?.trim() ?? '';
export const walletDeps: TransferDeps = {
  environment,
  enabled: !!orderDeps.api && token.length >= 32 && Deno.env.get(namespace + '_WITHDRAWALS_ENABLED') === 'true',
  token,
  siteUrl: orderDeps.siteUrl,
  allowDevOrigins: orderDeps.allowDevOrigins,
  session: orderDeps.session,
  view: (id, actor) =>
    ridePspRpc('ride_withdrawal_provider_view', { p_key: id, p_environment: environment, p_actor: actor ?? null }),
  claim: (id) => ridePspRpc('ride_claim_withdrawal_send', { p_key: id, p_environment: environment }),
  observe: (t, id, status) =>
    ridePspRpc('ride_record_withdrawal', {
      p_key: t.id,
      p_environment: environment,
      p_status: status,
      p_reference: id,
      p_wallet: t.wallet,
      p_net: t.net,
    }),
  api: (wallet) => {
    if (!/^[a-f0-9-]{36}$/.test(wallet)) return null;
    const secret = Deno.env.get(namespace + '_WALLET_' + wallet.replace(/-/g, '').toUpperCase());
    if (!secret) return null;
    return new AsaasClient({
      apiKey: secret,
      baseUrl: environment === 'live' ? ASAAS_PRODUCTION_URL : ASAAS_SANDBOX_URL,
      fetch: (i, init) => fetch(i, { ...init, redirect: 'error' }),
    });
  },
};
