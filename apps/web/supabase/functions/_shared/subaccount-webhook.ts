// What asaas-onboard and asaas-webhooks-sync agree on about the webhook that lives in each
// provider's Asaas subaccount: events, URL shape and how a listed URL is recognised as ours.

/** Payment events forwarded from the subaccount to asaas-webhook. */
export const SUBACCOUNT_WEBHOOK_EVENTS = [
  'PAYMENT_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED',
  'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
];

/** `${base}?acct=<provider_id>`: the URL the provider's subaccount calls. */
export function subaccountWebhookUrl(baseUrl: string, providerId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('acct', providerId);
  return url.toString();
}

/** host + path + acct, lower-cased and without a trailing slash; null for a URL that cannot be read. */
export function webhookUrlKey(value: string): string | null {
  try {
    const url = new URL(value);
    const acct = url.searchParams.get('acct');
    return `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}?acct=${(acct ?? '').toLowerCase()}`;
  } catch {
    return null;
  }
}
