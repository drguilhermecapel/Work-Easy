// App Links (Android) and Universal Links (iOS): an https link to the site opens the app,
// and the app must land on the route the link names instead of the home screen.

/**
 * The in-app route of a link the system handed to the app, or null when the link is not ours.
 * Only https links to the site host (VITE_SITE_URL) are accepted, and only a path the router
 * can take: the result always starts with a single "/", so a link can never send the WebView
 * to another origin.
 */
export const routeFromAppUrl = (url: string, siteUrl: string | null): string | null => {
  if (!siteUrl) return null;
  let link: URL;
  let site: URL;
  try {
    link = new URL(url);
    site = new URL(siteUrl);
  } catch {
    return null;
  }
  if (link.protocol !== 'https:' || link.host !== site.host) return null;
  // The website uses clean URLs; a link copied from the app itself carries the route after "#"
  const fromHash = link.hash.startsWith('#/') ? link.hash.slice(1) : null;
  // One-time invite tokens travel in the fragment, never in the path or the query: a trusted-contact
  // share (#convite=), a ride or guest invite (#viagem=) and an adhesion or companion invite (#adesao=).
  const shareFragment =
    link.pathname === '/corridas/convite' && /^#(convite|viagem|adesao)=[a-f0-9]{64}$/.test(link.hash) ? link.hash : '';
  const route = fromHash ?? `${link.pathname}${link.search}${shareFragment}`;
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) return null;
  return route;
};
