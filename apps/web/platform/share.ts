// Shares a text or a link through the system sheet (Web Share API) when the
// device offers it, and copies the text to the clipboard when it does not.
// The same call works on the website, in the Android/iOS WebViews and in the
// desktop app (Tauri). It never throws.

export interface SharePayload {
  title?: string;
  text: string;
  url?: string;
}

/**
 * What happened: the system sheet took it ('shared'), the text went to the
 * clipboard ('copied'), the person closed the sheet ('cancelled'), or neither
 * is possible here ('unavailable').
 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable';

const ABORT_ERROR = 'AbortError';

export const canUseWebShare = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

const isShareable = (data: ShareData): boolean => {
  if (typeof navigator.canShare !== 'function') return true;
  try {
    return navigator.canShare(data);
  } catch {
    // canShare rejects data the platform does not accept
    return false;
  }
};

const copyText = async (text: string): Promise<boolean> => {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const payloadData = ({ title, text, url }: SharePayload): ShareData => {
  const data: ShareData = { text };
  if (title) data.title = title;
  if (url) data.url = url;
  return data;
};

export const sharePayload = async (payload: SharePayload): Promise<ShareOutcome> => {
  const data = payloadData(payload);
  if (canUseWebShare() && isShareable(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (error) {
      if ((error as { name?: unknown } | null)?.name === ABORT_ERROR) return 'cancelled';
      // Any other failure falls back to the clipboard below
    }
  }
  const fallbackText = payload.url ? `${payload.text}\n${payload.url}` : payload.text;
  return (await copyText(fallbackText)) ? 'copied' : 'unavailable';
};
