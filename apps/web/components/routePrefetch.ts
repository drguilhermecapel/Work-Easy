// Loads the chunk of a page when the pointer or the keyboard reaches a link to it, so the click
// finds it ready. Event delegation on the document: no link has to be changed, and it works for
// both router flavours (clean URLs and hash URLs). The page chunks are the ones AppShell and the
// routes.tsx files load with lazy(); the bundler shares them, so nothing is downloaded twice.

type Loader = () => Promise<unknown>;

// The data of the rules (policies.json, large) is fetched with the page that shows it
const policies: Loader = () => import('../catalog').then(catalog => catalog.loadPolicies());

export const ROUTE_LOADERS: Array<[pattern: RegExp, load: Loader]> = [
  [/^\/$/, () => import('../pages/Home')],
  [/^\/categorias$/, () => import('../pages/Categories')],
  [/^\/categorias\/[^/]+$/, () => Promise.all([import('../pages/AreaPage'), policies()])],
  [/^\/servicos\/[^/]+$/, () => Promise.all([import('../pages/OccupationPage'), policies()])],
  [/^\/servicos\/[^/]+\/[^/]+$/, () => import('../pages/OccupationNeighborhoodPage')],
  [/^\/pedido$/, () => import('../pages/cliente/Pedido')],
  [/^\/entrar$/, () => import('../pages/conta/Entrar')],
  [/^\/conta$/, () => import('../pages/conta/Conta')],
  [/^\/pro\/cadastro$/, () => import('../pages/pro/Cadastro')],
];

/** The route path a link points to, or null for anything that is not an in-app link. */
export const routePathOf = (href: string | null): string | null => {
  if (!href) return null;
  const path = href.startsWith('#/') ? href.slice(1) : href;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
};

const started = new Set<string>();

/** Starts loading the page behind `href` once. Never throws: a failed prefetch only means the click loads it. */
export const prefetchRoute = (href: string | null): void => {
  const path = routePathOf(href);
  if (!path || started.has(path)) return;
  // Respect the data saver and very slow connections
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return;
  const match = ROUTE_LOADERS.find(([pattern]) => pattern.test(path));
  if (!match) return;
  started.add(path);
  match[1]().catch(() => started.delete(path));
};

/** The in-app link under an event target, if any. */
export const linkOf = (target: EventTarget | null): string | null => {
  const anchor = target instanceof Element ? target.closest('a[href]') : null;
  return anchor?.getAttribute('href') ?? null;
};
