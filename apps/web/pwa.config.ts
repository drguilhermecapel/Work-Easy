import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

// Options of the PWA plugin (vite.config.ts): the web manifest and the service worker.
// Kept apart from the Vite config so that test/seo can read them.
//
// The service worker only ever stores the files of the build (the app, its
// icons and the offline page). It never stores a response from Supabase, from
// an API, or one that carries credentials: every such request goes to the
// network, and `runtimeCaching` has no strategy that writes to a cache.

/** Same value as index.html and scripts/prerender.mjs. */
export const THEME_COLOR = '#667eea';

const icon = (src: string, sizes: string, purpose?: string) => ({ src, sizes, type: 'image/png', ...(purpose ? { purpose } : {}) });

export const MANIFEST: Partial<ManifestOptions> = {
  id: '/',
  name: 'WorkEasy',
  short_name: 'WorkEasy',
  description: 'Encontre profissionais e serviços de todas as áreas perto de você.',
  lang: 'pt-BR',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#f9fafb',
  theme_color: THEME_COLOR,
  categories: ['lifestyle', 'business'],
  icons: [
    icon('/icons/icon-192.png', '192x192', 'any'),
    icon('/icons/icon-512.png', '512x512', 'any'),
    icon('/icons/icon-maskable-512.png', '512x512', 'maskable'),
    { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
  // Long-press the installed icon: the screens a visitor goes back to most
  shortcuts: [
    { name: 'Procurar profissionais', short_name: 'Procurar', description: 'Buscar um serviço ou uma profissão', url: '/search', icons: [icon('/icons/icon-192.png', '192x192')] },
    { name: 'Todas as categorias', short_name: 'Categorias', description: 'Ver as áreas e os serviços', url: '/categorias', icons: [icon('/icons/icon-192.png', '192x192')] },
    { name: 'Pedir um serviço', short_name: 'Pedir', description: 'Descrever o que você precisa', url: '/pedido', icons: [icon('/icons/icon-192.png', '192x192')] },
    { name: 'Minha conta', short_name: 'Conta', description: 'Dados e pedidos da sua conta', url: '/conta', icons: [icon('/icons/icon-192.png', '192x192')] },
  ],
};

// Route matchers below are copied into the service worker as source text
// (workbox-build calls .toString() on them), so each one must be
// self-contained: no variable of this file may appear inside a function.

/**
 * Screens that need the server: they never come from the cache, and while
 * the visitor is offline they show /offline.html. /pedido is not here: the
 * form and its draft work without a connection.
 */
export const NETWORK_ONLY_ROUTES: RegExp = /^\/(?:entrar|conta|pedidos|atendimentos|pro|admin|cuidado|orcamento|agendar|p)(?:\/|$)/;

export const workboxOptions = {
  // Only what the build emits: no data, no JSON, no response of any API
  globPatterns: ['**/*.{js,css,html,png,svg}'],
  // Crawlers fetch the link-preview image; the app never shows it
  globIgnores: ['**/og-image.png'],
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [
    // Files (sitemap.xml, robots.txt, the manifest...) are served as they are, not as the app
    /\/[^/?]+\.[a-z0-9]+$/i,
    NETWORK_ONLY_ROUTES,
  ],
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      urlPattern: ({ request, url }: { request: Request; url: URL }) =>
        request.mode === 'navigate' && /^\/(?:entrar|conta|pedidos|atendimentos|pro|admin|cuidado|orcamento|agendar|p)(?:\/|$)/.test(url.pathname),
      handler: 'NetworkOnly' as const,
      options: { precacheFallback: { fallbackURL: '/offline.html' } },
    },
    {
      // Supabase and any other API: other origins, the /v1 paths of Supabase behind a custom domain,
      // and anything that carries credentials. Straight to the network, nothing stored.
      urlPattern: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        !sameOrigin ||
        /^\/(?:rest|auth|functions|storage|realtime)\/v1\//.test(url.pathname) ||
        request.headers.has('authorization') ||
        request.headers.has('apikey'),
      handler: 'NetworkOnly' as const,
    },
  ],
};

/**
 * `prompt`: a new version waits until the visitor accepts it (components/PwaUpdateNotice.tsx),
 * so a tab that is open keeps the files its own version was built with. The register script is
 * not injected into the page: the app registers the worker itself, after it starts.
 */
export const pwaOptions = (mode: string): Partial<VitePWAOptions> => ({
  disable: mode === 'native' || mode === 'test',
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['favicon.png', 'icons/apple-touch-icon.png', 'icons/icon.svg'],
  manifest: MANIFEST,
  workbox: workboxOptions,
});
