// Only a public key may reach the client bundle. Instead of listing the
// secret formats, this accepts the two public ones and refuses everything else:
// - the publishable key ("sb_publishable_...");
// - the legacy anon JWT (payload role "anon"), still printed by older CLIs.

export type KeyCheck = 'publishable' | 'legacy_anon' | 'refused';

const decodeJwtRole = (key: string): unknown => {
  const parts = key.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    return payload && typeof payload === 'object' ? (payload as { role?: unknown }).role : undefined;
  } catch {
    return undefined;
  }
};

export const checkPublicKey = (key: string): KeyCheck => {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return 'publishable';
  if (decodeJwtRole(key) === 'anon') return 'legacy_anon';
  return 'refused';
};
