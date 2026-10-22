// Constant-time comparison for shared secrets (Asaas webhook token, cron
// secret). The loop always runs over the expected secret's length and never
// returns early, so timing does not reveal how many leading bytes matched.

const encoder = new TextEncoder();

export function timingSafeEqual(received: string, expected: string): boolean {
  const a = encoder.encode(received);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a[i % (a.length || 1)] ?? 0) ^ b[i];
  }
  return diff === 0 && b.length > 0;
}

/** False when the secret is not configured: an unset secret never matches. */
export function secretMatches(received: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || received == null) return false;
  return timingSafeEqual(received, expected);
}

/** `Authorization: Bearer <token>` -> token. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Webhook token registered in one provider's Asaas subaccount:
 * HMAC-SHA256(ASAAS_WEBHOOK_TOKEN, "asaas-subaccount:<provider_id>") in hex
 * (64 characters, inside Asaas' 32-255 range). The provider owns the
 * subaccount and can read this token, but it is valid only for events that
 * claim to come from that subaccount, and it does not reveal the platform token.
 */
export async function deriveSubaccountToken(platformToken: string, providerId: string): Promise<string> {
  if (!platformToken) throw new Error('platform webhook token is missing');
  if (!UUID.test(providerId)) throw new Error('provider id must be a uuid');
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(platformToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`asaas-subaccount:${providerId.toLowerCase()}`));
  return Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('');
}

export const isUuid = (value: string) => UUID.test(value);
