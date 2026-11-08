// Opens links that leave the app: WhatsApp (wa.me), a phone call, an e-mail or
// a web page. Only the schemes below are allowed; anything else (javascript:,
// data:, intent:, a relative path) is refused. Web links get rel="noopener
// noreferrer", so the page they open cannot reach this one.

export const ALLOWED_EXTERNAL_PROTOCOLS: readonly string[] = ['https:', 'http:', 'tel:', 'mailto:'];

const WEB_PROTOCOLS: readonly string[] = ['https:', 'http:'];

/** The URL when it is absolute and on the allow-list, else null. */
export const parseExternalUrl = (raw: string | null | undefined): URL | null => {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!ALLOWED_EXTERNAL_PROTOCOLS.includes(url.protocol)) return null;
  // user:password@host lets a lookalike address pass for the real one
  if (WEB_PROTOCOLS.includes(url.protocol) && (url.username || url.password)) return null;
  return url;
};

export interface ExternalLinkProps {
  href: string;
  target?: '_blank';
  rel?: 'noopener noreferrer';
}

/** Props for an <a> element, or null when the link must not be rendered as a link. */
export const externalLinkProps = (raw: string | null | undefined): ExternalLinkProps | null => {
  const url = parseExternalUrl(raw);
  if (!url) return null;
  if (WEB_PROTOCOLS.includes(url.protocol)) return { href: url.href, target: '_blank', rel: 'noopener noreferrer' };
  return { href: url.href };
};

/**
 * Hands the link to the browser. Returns false when the link is refused or
 * there is no window. A pop-up blocker can still stop a web link after this
 * returns true, because a noopener window cannot be checked.
 */
export const openExternalLink = (raw: string | null | undefined): boolean => {
  const url = parseExternalUrl(raw);
  if (!url || typeof window === 'undefined') return false;
  if (WEB_PROTOCOLS.includes(url.protocol)) {
    window.open(url.href, '_blank', 'noopener,noreferrer');
    return true;
  }
  window.location.href = url.href;
  return true;
};
