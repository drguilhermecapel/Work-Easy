// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANIFEST, NETWORK_ONLY_ROUTES, THEME_COLOR, pwaOptions } from '../../pwa.config';

// The web manifest and the service worker rules (pwa.config.ts), read the way the browser will use them.

const ROOT = process.cwd();
const publicFile = (path: string): string => join(ROOT, 'public', path.replace(/^\//, ''));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

describe('web manifest', () => {
  it('has what an installable app needs', () => {
    expect(MANIFEST).toMatchObject({
      id: '/',
      name: 'WorkEasy',
      short_name: 'WorkEasy',
      lang: 'pt-BR',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f9fafb',
    });
    expect(MANIFEST.description).toMatch(/profissionais/);
    expect(MANIFEST.short_name!.length).toBeLessThanOrEqual(12);
  });

  it('uses the theme color of index.html', () => {
    expect(MANIFEST.theme_color).toBe(THEME_COLOR);
    expect(new RegExp(`<meta name="theme-color" content="${THEME_COLOR}"`).test(read('index.html'))).toBe(true);
  });

  it('has the icons the stores and the home screen ask for, and every file exists', () => {
    const icons = MANIFEST.icons!;
    const has = (sizes: string, purpose: string): boolean => icons.some(i => i.sizes === sizes && (i.purpose ?? 'any') === purpose && i.type === 'image/png');
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
    for (const icon of icons) expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
  });

  it('has shortcuts to screens of the app, each with a name, an icon and an address inside the scope', () => {
    const shortcuts = MANIFEST.shortcuts!;
    expect(shortcuts.length).toBeGreaterThanOrEqual(3);
    expect(shortcuts.length).toBeLessThanOrEqual(4);
    expect(new Set(shortcuts.map(s => s.url)).size).toBe(shortcuts.length);
    // The prototype screens (/search, /dashboard...) moved from AppShell.tsx to pages/prototype/routes.tsx (demo and backend tables)
    const routes = ['AppShell.tsx', 'pages/prototype/routes.tsx', 'pages/cliente/routes.tsx', 'pages/conta/routes.tsx'].map(file => read(file)).join('\n');
    for (const shortcut of shortcuts) {
      expect(shortcut.name.length, shortcut.name).toBeGreaterThan(3);
      expect(shortcut.short_name?.length ?? 0, shortcut.name).toBeLessThanOrEqual(12);
      expect(shortcut.url.startsWith(MANIFEST.scope!)).toBe(true);
      // A shortcut to a route that does not exist would open the home page
      expect(routes, shortcut.url).toContain(`path="${shortcut.url}"`);
      expect(shortcut.icons?.length, shortcut.name).toBeGreaterThan(0);
      for (const icon of shortcut.icons ?? []) expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
    }
  });

  it('is off for the native apps and for the tests, and registers nothing in the page', () => {
    expect(pwaOptions('native').disable).toBe(true);
    expect(pwaOptions('test').disable).toBe(true);
    expect(pwaOptions('production').disable).toBe(false);
    // The app registers the worker itself (components/PwaUpdateNotice.tsx): no blocking script in <head>
    expect(pwaOptions('production').injectRegister).toBe(false);
    expect(read('index.tsx')).toContain('<PwaUpdateNotice />');
  });
});

describe('service worker', () => {
  const options = pwaOptions('production');
  const workbox = options.workbox!;

  it('waits for the visitor to accept a new version instead of taking over a tab that is open', () => {
    expect(options.registerType).toBe('prompt');
    expect(workbox).not.toHaveProperty('skipWaiting', true);
    expect(workbox).not.toHaveProperty('clientsClaim', true);
    expect(workbox.cleanupOutdatedCaches).toBe(true);
  });

  it('keeps in the cache only the files of the build', () => {
    expect(workbox.globPatterns).toEqual(['**/*.{js,css,html,png,svg}']);
    expect(workbox.globIgnores).toContain('**/og-image.png');
    expect(workbox.navigateFallback).toBe('/index.html');
  });

  it('has no runtime strategy that stores a response: every route goes to the network', () => {
    const routes = workbox.runtimeCaching ?? [];
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) expect(route.handler).toBe('NetworkOnly');
    // The source says it too, so that a future edit that adds a cache has to change this test
    expect(read('pwa.config.ts').replace(/\/\/.*$/gm, '')).not.toMatch(/CacheFirst|StaleWhileRevalidate|NetworkFirst|CacheOnly|cacheName|expiration/);
  });

  // workbox-build copies a matcher into the worker as source text, so test it the same way:
  // stringified, rebuilt in an empty scope, and called with what the worker passes it.
  type Matcher = (args: { request: Request; url: URL; sameOrigin: boolean }) => boolean;
  const standalone = (index: number): Matcher => {
    const source = String((workbox.runtimeCaching![index] as { urlPattern: unknown }).urlPattern);
    return new Function(`return (${source});`)() as Matcher;
  };
  const request = (init: { mode?: string; headers?: Record<string, string> } = {}): Request =>
    ({ mode: init.mode ?? 'cors', headers: new Headers(init.headers) }) as unknown as Request;
  const call = (matcher: Matcher, url: string, init?: { mode?: string; headers?: Record<string, string> }): boolean => {
    const parsed = new URL(url, 'https://workeasy.example');
    return Boolean(matcher({ request: request(init), url: parsed, sameOrigin: parsed.origin === 'https://workeasy.example' }));
  };

  describe('never stores Supabase, an API or an authenticated response', () => {
    const network = (): Matcher => standalone(1);

    it.each([
      'https://abcdefgh.supabase.co/rest/v1/requests?select=id',
      'https://abcdefgh.supabase.co/auth/v1/token?grant_type=password',
      'https://abcdefgh.supabase.co/storage/v1/object/sign/documents/a.pdf',
      'https://abcdefgh.supabase.co/functions/v1/request-assist',
      'http://127.0.0.1:54321/rest/v1/occupation_policies',
      'https://api.example.com/anything',
      // Supabase behind the site's own domain
      '/rest/v1/requests',
      '/auth/v1/user',
      '/functions/v1/asaas-webhook',
      '/storage/v1/object/public/avatars/a.png',
      '/realtime/v1/websocket',
    ])('sends %s straight to the network', url => {
      expect(call(network(), url)).toBe(true);
    });

    it('sends a request with credentials to the network, wherever it goes', () => {
      expect(call(network(), '/qualquer-coisa', { headers: { Authorization: 'Bearer token' } })).toBe(true);
      expect(call(network(), '/qualquer-coisa', { headers: { apikey: 'sb_publishable_x' } })).toBe(true);
    });

    it('leaves the files of the app to the precache', () => {
      for (const url of ['/assets/index-abc123.js', '/assets/index-abc123.css', '/icons/icon-192.png', '/favicon.png', '/offline.css']) {
        expect(call(network(), url), url).toBe(false);
      }
    });

    it('is written without a reference to anything outside the function', () => {
      const source = String((workbox.runtimeCaching![1] as { urlPattern: unknown }).urlPattern);
      expect(source).not.toMatch(/NETWORK_ONLY_ROUTES|THEME_COLOR|MANIFEST|workboxOptions/);
    });
  });

  describe('shows the offline page for the screens that need the server', () => {
    const offline = (): Matcher => standalone(0);

    it.each(['/entrar', '/conta', '/pedidos', '/pedidos/8f3c1a2e', '/atendimentos/1', '/pro', '/pro/agenda', '/admin', '/admin/prestadores', '/cuidado', '/orcamento/8f3c1a2e-5b7d', '/agendar/ana', '/p/ana-diarista'])(
      'for the navigation to %s',
      url => {
        expect(call(offline(), url, { mode: 'navigate' })).toBe(true);
      },
    );

    it.each(['/', '/categorias', '/categorias/limpeza', '/servicos/diarista', '/servicos/diarista/moema', '/search', '/pedido', '/profile/1', '/legal', '/register-provider', '/health', '/dashboard'])(
      'but not for %s, which the installed app opens without a connection',
      url => {
        expect(call(offline(), url, { mode: 'navigate' }), url).toBe(false);
      },
    );

    it('only for navigations, not for the requests the page makes', () => {
      expect(call(offline(), '/conta', { mode: 'cors' })).toBe(false);
      expect(call(offline(), '/conta', { mode: 'same-origin' })).toBe(false);
    });

    it('falls back to the precached offline page, which exists', () => {
      const route = workbox.runtimeCaching![0] as { handler: string; options?: { precacheFallback?: { fallbackURL: string } } };
      expect(route.handler).toBe('NetworkOnly');
      expect(route.options?.precacheFallback?.fallbackURL).toBe('/offline.html');
      expect(existsSync(publicFile('/offline.html'))).toBe(true);
      expect(existsSync(publicFile('/offline.css'))).toBe(true);
    });

    it('uses the same screens as the navigation fallback denylist, so the app shell never answers for them', () => {
      expect(String((workbox.runtimeCaching![0] as { urlPattern: unknown }).urlPattern)).toContain(NETWORK_ONLY_ROUTES.source);
      expect(workbox.navigateFallbackDenylist).toContain(NETWORK_ONLY_ROUTES);
    });
  });

  describe('navigation fallback', () => {
    const denied = (path: string): boolean => (workbox.navigateFallbackDenylist ?? []).some(re => re.test(path));

    it('opens the app shell for the routes of the app', () => {
      for (const path of ['/', '/categorias', '/servicos/diarista', '/servicos/diarista/moema', '/search', '/pedido', '/legal/termos-de-uso', '/como-funciona']) {
        expect(denied(path), path).toBe(false);
      }
    });

    it('leaves files and the screens that need the server alone', () => {
      for (const path of ['/sitemap.xml', '/sitemap-1.xml', '/robots.txt', '/manifest.webmanifest', '/sw.js', '/offline.html', '/og-image.png', '/conta', '/pro/agenda', '/p/ana']) {
        expect(denied(path), path).toBe(true);
      }
    });
  });
});

describe('offline page', () => {
  const html = read('public', 'offline.html');

  it('says what happened in Portuguese, offers a way back, and is kept out of search', () => {
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(html).toContain('<title>Sem conexão | WorkEasy</title>');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toMatch(/<h1>Sem conexão<\/h1>/);
    expect(html).toMatch(/<a class="button" href="">Tentar de novo<\/a>/);
    expect(html).toMatch(/<a class="link" href="\/categorias">Ver as categorias<\/a>/);
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR}" />`);
  });

  it('needs nothing but its own stylesheet, so a Content-Security-Policy can forbid inline code', () => {
    expect(html).toContain('<link rel="stylesheet" href="/offline.css" />');
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/<script[\s>]/);
    expect(html).not.toMatch(/\son[a-z]+="/);
    expect(html).not.toMatch(/\sstyle="/);
    for (const href of [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map(m => m[1])) {
      if (href !== '/categorias') expect(existsSync(publicFile(href)), href).toBe(true);
    }
  });
});
