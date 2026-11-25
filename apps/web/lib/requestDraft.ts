// Draft of /pedido, kept for the browser session so going to /entrar and
// back does not lose the form. Cleared on sign-out and account deletion, so
// the next person on a shared computer does not see it.

const DRAFT_KEY = 'workeasy:pedido-rascunho';

export const readRequestDraft = (): Record<string, unknown> => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export const saveRequestDraft = (draft: object): void => {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode): the form still works, it just is not kept
  }
};

export const clearRequestDraft = (): void => {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable: nothing to clear
  }
};

// Only the pending order ID is kept across restarts. Form data stays in session storage.
const pendingKey = (clientId: string) => `workeasy:pedido-envio:${clientId}`;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export const pendingRequestId = (clientId: string): string => {
  try {
    const stored = localStorage.getItem(pendingKey(clientId));
    if (stored && UUID_V4.test(stored)) return stored;
  } catch {
    // The screen retains the ID for retries if storage is unavailable.
  }

  // getRandomValues also works in native webviews with custom URL schemes.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  try {
    localStorage.setItem(pendingKey(clientId), id);
  } catch {
    // The screen retains the ID for retries if storage is unavailable.
  }
  return id;
};

export const clearPendingRequestId = (clientId: string, id?: string): void => {
  try {
    const key = pendingKey(clientId);
    if (id === undefined || localStorage.getItem(key) === id) localStorage.removeItem(key);
  } catch {
    // Storage unavailable.
  }
};
