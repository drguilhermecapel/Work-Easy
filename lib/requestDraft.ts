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
