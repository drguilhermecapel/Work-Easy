// @vitest-environment node
import { existsSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DATE,
  ROOT,
  SITE,
  TEMPLATE,
  ldBlocks,
  loadPrerender,
  makeProjectIn,
  quiet,
  smallInputs,
  trackTmpDirs,
  type Page,
  type PrerenderModule,
} from './helpers';

// Head tags, structured data, the home page, the sitemap and robots.txt written by scripts/prerender.mjs.

let mod: PrerenderModule;
beforeEach(async () => {
  mod = await loadPrerender();
});
const tmp = trackTmpDirs();

const pageAt = (path: string, siteUrl = SITE): Page => mod.buildPages({ ...smallInputs(), siteUrl, warn: () => {} }).find(p => p.path === path)!;
const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;
const decode = (text: string): string => text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

describe('head tags of a page', () => {
  it('replaces the generic tags of the template instead of repeating them', () => {
    const page = pageAt('/servicos/pintor');
    const html = mod.renderPage(TEMPLATE, page, SITE);
    for (const key of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name', 'og:locale', 'og:image:width', 'og:image:height', 'og:image:alt']) {
      expect(count(html, new RegExp(`property="${key}"`, 'g')), key).toBe(1);
    }
    for (const key of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'description', 'theme-color']) {
      expect(count(html, new RegExp(`name="${key}"`, 'g')), key).toBe(1);
    }
    expect(count(html, /rel="canonical"/g)).toBe(1);
    expect(html).toContain(`<meta property="og:title" content="${page.title}" />`);
    expect(html).toContain(`<meta property="og:image" content="${SITE}/og-image.png" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${SITE}/og-image.png" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain(`<meta name="twitter:title" content="${page.title}" />`);
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta property="og:locale" content="pt_BR" />');
    expect(html).toContain('<meta name="theme-color" content="#667eea" />');
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(mod.validateHtml(html)).toEqual([]);
  });

  it('keeps the image path relative, and writes no og:url, when the site URL is unknown', () => {
    const html = mod.renderPage(TEMPLATE, pageAt('/servicos/pintor', ''), '');
    expect(html).toContain('<meta property="og:image" content="/og-image.png" />');
    expect(html).not.toContain('og:url');
    expect(html).toContain('<link rel="canonical" href="/servicos/pintor" />');
  });

  it('adds the tags that a bare template lacks', () => {
    const bare = '<!DOCTYPE html><html><head><title>x</title></head><body><div id="root"></div></body></html>';
    const html = mod.renderPage(bare, pageAt('/servicos/pintor'), SITE);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain(`<meta name="theme-color" content="${mod.THEME_COLOR}" />`);
    expect(html).toMatch(/<meta name="description" content="[^"]+" \/>/);
    expect(mod.validateHtml(html)).toEqual([]);
  });

  it('writes noindex only for pages kept out of the index', () => {
    const page = pageAt('/servicos/pintor');
    expect(mod.renderPage(TEMPLATE, page, SITE)).not.toContain('name="robots"');
    const html = mod.renderPage(TEMPLATE, { ...page, indexable: false }, SITE);
    expect(html).toContain('<meta name="robots" content="noindex,follow" />');
    expect(count(html, /name="robots"/g)).toBe(1);
  });

  it('adds the chunks of the route as module preloads, before the structured data', () => {
    const html = mod.renderPage(TEMPLATE, pageAt('/servicos/pintor'), SITE, { preload: ['/assets/OccupationPage-abc.js', '/assets/catalog-def.js'] });
    expect(html).toContain('<link rel="modulepreload" crossorigin href="/assets/OccupationPage-abc.js" />');
    expect(html).toContain('<link rel="modulepreload" crossorigin href="/assets/catalog-def.js" />');
    expect(html.indexOf('modulepreload')).toBeLessThan(html.indexOf('application/ld+json'));
  });

  it('reports every tag a crawler needs and a page lacks', () => {
    const html = mod.renderPage(TEMPLATE, pageAt('/servicos/pintor'), SITE);
    expect(mod.validateHtml(html.replace(/<meta property="og:image" [^>]*>/, ''))).toContain('<meta property="og:image"> ausente');
    expect(mod.validateHtml(html.replace(/<meta name="twitter:card" [^>]*>/, ''))).toContain('<meta name="twitter:card"> ausente');
    expect(mod.validateHtml(html.replace(/<meta name="theme-color" [^>]*>/, ''))).toContain('<meta name="theme-color"> ausente');
    expect(mod.validateHtml(html.replace('<html lang="pt-BR">', '<html>'))).toContain('<html lang="pt-BR"> ausente');
    expect(mod.validateHtml(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''))).toContain('JSON-LD ausente');
    expect(mod.validateHtml(html.replace(/(<script type="application\/ld\+json">)\{/, '$1{{'))).toContain('JSON-LD inválido');
  });
});

describe('structured data of the pages', () => {
  /** The visible breadcrumb: the link texts and the current page. */
  const visibleCrumbs = (body: string): string[] => {
    const nav = /<nav aria-label="Caminho"[^>]*>([\s\S]*?)<\/nav>/.exec(body)![1];
    return [...nav.matchAll(/<a [^>]*>([^<]*)<\/a>|<span class="text-gray-700">([^<]*)<\/span>/g)].map(m => decode(m[1] ?? m[2]));
  };

  it.each([
    ['/categorias/reformas', ['Categorias', 'Reformas']],
    ['/servicos/encanador', ['Categorias', 'Reformas', 'Encanador']],
    ['/servicos/encanador/moema', ['Categorias', 'Reformas', 'Encanador', 'Moema']],
  ])('%s has a BreadcrumbList that says what the visible breadcrumb says', (path, names) => {
    const page = pageAt(path);
    const [service, crumbs] = ldBlocks(mod.renderPage(TEMPLATE, page, SITE)) as [Record<string, unknown>, { itemListElement: Array<Record<string, unknown>> } & Record<string, unknown>];
    expect(service['@type']).toBe('Service');
    expect(crumbs['@context']).toBe('https://schema.org');
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(crumbs.itemListElement.map(item => item.position)).toEqual(names.map((_, i) => i + 1));
    expect(crumbs.itemListElement.map(item => item.name)).toEqual(names);
    expect(visibleCrumbs(page.body)).toEqual(names);
    for (const item of crumbs.itemListElement) {
      expect(item['@type']).toBe('ListItem');
      expect(String(item.item)).toMatch(new RegExp(`^${SITE}/`));
    }
    expect(crumbs.itemListElement.at(-1)?.item).toBe(`${SITE}${path}`);
    expect(crumbs.itemListElement[0].item).toBe(`${SITE}/categorias`);
  });

  it('has no breadcrumb on the category index, which is the top of the trail', () => {
    const blocks = ldBlocks(mod.renderPage(TEMPLATE, pageAt('/categorias'), SITE));
    expect(blocks.map(b => b['@type'])).toEqual(['Service']);
  });

  it('falls back to relative item paths without the site URL', () => {
    const [, crumbs] = ldBlocks(mod.renderPage(TEMPLATE, pageAt('/servicos/encanador', ''), '')) as [unknown, { itemListElement: Array<{ item: string }> }];
    expect(crumbs.itemListElement.map(i => i.item)).toEqual(['/categorias', '/categorias/reformas', '/servicos/encanador']);
  });

  it('never writes a rating, review, offer or price into any block', () => {
    for (const page of mod.buildPages({ ...smallInputs(), siteUrl: SITE, warn: () => {} })) {
      for (const block of [page.jsonLd, ...(page.extraLd ?? [])]) {
        expect(JSON.stringify(block), page.path).not.toMatch(/aggregateRating|ratingValue|reviewCount|"review|"offers"|"price|priceRange|priceCurrency/);
      }
    }
    const withOffer: Page = { ...pageAt('/servicos/pintor'), extraLd: [{ '@type': 'BreadcrumbList', offers: { price: 10 } }] };
    expect(mod.validatePage(withOffer, SITE)).toContain('JSON-LD com preço, nota ou avaliação');
  });
});

describe('the home page', () => {
  const description = 'WorkEasy: encontre profissionais e serviços de todas as áreas perto de você.';

  it('describes the organization and the site, and nothing the project cannot back up', () => {
    const [organization, website] = mod.homeJsonLd(SITE, description);
    expect(organization).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'WorkEasy',
      url: `${SITE}/`,
      logo: `${SITE}/icons/icon-512.png`,
      description,
    });
    expect(website).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      name: 'WorkEasy',
      url: `${SITE}/`,
      inLanguage: 'pt-BR',
      description,
      publisher: { '@id': `${SITE}/#organization` },
    });
    expect(JSON.stringify([organization, website])).not.toMatch(/rating|review|offers|price|sameAs|contactPoint|telephone|address|founder|email/i);
    expect(existsSync(join(ROOT, 'public', 'icons', 'icon-512.png'))).toBe(true);
  });

  it('writes none without the site URL, because their URLs would not be valid', () => {
    expect(mod.homeJsonLd('')).toEqual([]);
    expect(mod.renderHome(TEMPLATE, '')).toBe(TEMPLATE);
  });

  it('adds both blocks and the absolute image to the shell, with no canonical and no og:url', () => {
    const html = mod.renderHome(TEMPLATE, SITE);
    expect(ldBlocks(html).map(b => b['@type'])).toEqual(['Organization', 'WebSite']);
    expect(html).toContain(`<meta property="og:image" content="${SITE}/og-image.png" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${SITE}/og-image.png" />`);
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('og:url');
    expect(html).toContain('<div id="root"></div>');
  });

  it('can be applied twice and taken off again', () => {
    const once = mod.renderHome(TEMPLATE, SITE);
    expect(mod.renderHome(once, SITE)).toBe(once);
    expect(ldBlocks(mod.stripHome(once))).toEqual([]);
    expect(mod.stripHome(TEMPLATE)).toBe(TEMPLATE);
  });

  it('is written by a run, and a second run over the same dist/ gives the same result', async () => {
    const { root, dist } = makeProjectIn(tmp(), smallInputs());
    await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    const home = readFileSync(join(dist, 'index.html'), 'utf8');
    const page = readFileSync(join(dist, 'servicos', 'pintor', 'index.html'), 'utf8');
    expect(ldBlocks(home).map(b => b['@type'])).toEqual(['Organization', 'WebSite']);
    // The block of the home never leaks into the pages written from the same template
    expect(ldBlocks(page).map(b => b['@type'])).toEqual(['Service', 'BreadcrumbList']);

    await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe(home);
    expect(readFileSync(join(dist, 'servicos', 'pintor', 'index.html'), 'utf8')).toBe(page);
  });

  it('is left as the build wrote it without the site URL', async () => {
    const { root, dist } = makeProjectIn(tmp(), smallInputs());
    await mod.prerender({ root, distDir: dist, siteUrl: '', ...quiet });
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe(TEMPLATE);
  });
});

describe('sitemap', () => {
  it('can give each URL its own lastmod', () => {
    const xml = mod.buildSitemap(['/', '/categorias'], SITE, path => (path === '/' ? '2026-02-01' : '2026-03-01'));
    expect(xml).toContain(`<url><loc>${SITE}/</loc><lastmod>2026-02-01</lastmod></url>`);
    expect(xml).toContain(`<url><loc>${SITE}/categorias</loc><lastmod>2026-03-01</lastmod></url>`);
  });

  it('dates a sitemap of the index with the newest lastmod of its part', () => {
    const files = mod.buildSitemapFiles(['/a', '/b', '/c'], SITE, path => ({ '/a': '2026-01-01', '/b': '2026-05-01', '/c': '2026-03-01' })[path]!, 2);
    expect(files[0].xml).toContain(`<loc>${SITE}/sitemap-1.xml</loc><lastmod>2026-05-01</lastmod>`);
    expect(files[0].xml).toContain(`<loc>${SITE}/sitemap-2.xml</loc><lastmod>2026-03-01</lastmod>`);
  });

  describe('lastmod is the day the content changed, not the day of the build', () => {
    const touch = (file: string, day: string): void => utimesSync(file, new Date(`${day}T12:00:00Z`), new Date(`${day}T12:00:00Z`));

    it('reads the date of the last commit, else the newest modification time, else nothing', () => {
      const root = tmp();
      makeProjectIn(root, smallInputs());
      touch(join(root, 'catalog', 'areas.json'), '2026-02-01');
      touch(join(root, 'catalog', 'policies.json'), '2026-04-10');
      const files = ['catalog/areas.json', 'catalog/policies.json'];
      expect(mod.contentDate(root, files, { git: () => '' })).toBe('2026-04-10');
      expect(mod.contentDate(root, files, { git: () => 'not a date' })).toBe('2026-04-10');
      expect(mod.contentDate(root, files, { git: () => '2026-03-05' })).toBe('2026-03-05');
      expect(mod.contentDate(root, ['catalog/areas.json', 'does/not/exist.json'], { git: () => '' })).toBe('2026-02-01');
      expect(mod.contentDate(root, ['does/not/exist.json'], { git: () => '2026-03-05' })).toBeUndefined();
    });

    it('gives each kind of page the date of the files it is written from', () => {
      const git = (_root: string, files: string[]): string =>
        files.includes('data/static-pages.json') ? '2026-03-01' : files.includes('content/legal/termos.md') ? '2026-01-15' : '2026-02-01';
      const root = tmp();
      makeProjectIn(root, smallInputs());
      writeFileSync(join(root, 'data', 'static-pages.json'), '[]');
      const mk = (kind: string, path: string, source?: string): Page => ({ kind, path, title: 't', description: 'd', jsonLd: {}, body: '', source });
      const pages = [mk('servico', '/servicos/pintor'), mk('estatica', '/como-funciona'), mk('legal', '/legal/termos', 'content/legal/termos.md')];
      // The legal file does not exist in this folder: the page falls back to today
      const lastmod = mod.makeLastmod({ root, pages, today: '2026-10-23', git });
      expect(lastmod('/servicos/pintor')).toBe('2026-02-01');
      expect(lastmod('/como-funciona')).toBe('2026-03-01');
      expect(lastmod('/legal/termos')).toBe('2026-10-23');
      expect(lastmod('/')).toBe('2026-02-01');
      expect(lastmod('/not-a-page')).toBe('2026-02-01');
    });

    it('lets a fixed date win, for builds that must be reproducible', () => {
      const lastmod = mod.makeLastmod({ root: tmp(), pages: [], buildDate: '2026-06-01', git: () => '2026-01-01' });
      expect(lastmod('/anything')).toBe('2026-06-01');
    });

    it('is what a run writes into the sitemap, per kind of page', async () => {
      const root = tmp();
      const inputs = smallInputs();
      inputs.staticPages = [
        { path: '/como-funciona', title: 'Como funciona', description: 'Entenda como o WorkEasy conecta clientes e profissionais.', h1: 'Como funciona', paragraphs: ['O cliente descreve o que precisa e combina o valor com o profissional.'] },
      ];
      inputs.legalDocs = [{ slug: 'termos-de-uso', source: '', markdown: '# Termos de Uso\n\nEstes termos descrevem as regras de uso do WorkEasy durante a fase de demonstração.\n' }];
      const { dist } = makeProjectIn(root, inputs);
      for (const file of ['catalog/areas.json', 'catalog/policies.json', 'data/neighborhoods.json']) touch(join(root, file), '2026-02-01');
      touch(join(root, 'data', 'static-pages.json'), '2026-03-01');
      touch(join(root, 'content', 'legal', 'termos-de-uso.md'), '2026-01-15');
      expect(statSync(join(root, 'content', 'legal', 'termos-de-uso.md')).mtime.toISOString().slice(0, 10)).toBe('2026-01-15');

      await mod.prerender({ root, distDir: dist, siteUrl: SITE, legalStatus: 'vigente', ...quiet });
      const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
      const dateOf = (path: string): string => new RegExp(`<loc>${SITE}${path}</loc><lastmod>([^<]+)</lastmod>`).exec(sitemap)![1];
      expect(dateOf('/')).toBe('2026-02-01');
      expect(dateOf('/servicos/pintor')).toBe('2026-02-01');
      expect(dateOf('/como-funciona')).toBe('2026-03-01');
      expect(dateOf('/legal/termos-de-uso')).toBe('2026-01-15');
    });
  });

  it('lists only indexable pages: no neighborhood page, thin occupation page or legal draft', async () => {
    const root = tmp();
    const inputs = smallInputs();
    inputs.legalDocs = [{ slug: 'termos-de-uso', source: '', markdown: '# Termos de Uso\n\nEstes termos descrevem as regras de uso do WorkEasy durante a fase de demonstração.\n' }];
    const { dist } = makeProjectIn(root, inputs);
    const draft = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, legalStatus: 'minuta', ...quiet });
    expect(draft.sitemapPaths).not.toContain('/legal/termos-de-uso');
    const inForce = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, legalStatus: 'vigente', ...quiet });
    expect(inForce.sitemapPaths).toContain('/legal/termos-de-uso');
    const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs).toEqual(inForce.sitemapPaths.map(path => `${SITE}${path}`));
    expect(locs.some(loc => /\/servicos\/[^/]+\/[^/]+$/.test(loc))).toBe(false);
  });
});

describe('robots.txt', () => {
  const robots = readFileSync(join(ROOT, 'public', 'robots.txt'), 'utf8');

  it('allows the site and keeps crawlers out of the screens that need a login or are not content', () => {
    const rules = robots.split('\n');
    expect(rules).toContain('User-agent: *');
    expect(rules).toContain('Allow: /');
    for (const disallowed of ['/entrar', '/conta', '/pedido', '/dashboard', '/atendimentos', '/cuidado', '/admin', '/pro/', '/pro$', '/orcamento/', '/search']) {
      expect(rules, disallowed).toContain(`Disallow: ${disallowed}`);
    }
  });

  it('does not block the pages that the sitemap lists', () => {
    const blocked = robots
      .split('\n')
      .filter(line => line.startsWith('Disallow: '))
      .map(line => line.slice('Disallow: '.length));
    const paths = ['/', '/categorias', '/categorias/reformas', '/servicos/encanador', '/servicos/encanador/moema', '/legal/termos-de-uso', '/como-funciona'];
    const isBlocked = (path: string): boolean =>
      blocked.some(rule => (rule.endsWith('$') ? path === rule.slice(0, -1) : path.startsWith(rule)));
    for (const path of paths) expect(isBlocked(path), path).toBe(false);
    // The profile pages start like /pro but are not the provider area
    expect(isBlocked('/profile/1')).toBe(false);
    expect(isBlocked('/pro')).toBe(true);
    expect(isBlocked('/pro/agenda')).toBe(true);
  });

  it('gets the Sitemap line only with a site URL', () => {
    expect(mod.buildRobots(robots, '')).toBe(robots);
    expect(mod.buildRobots(robots, SITE)).toBe(`${robots}\nSitemap: ${SITE}/sitemap.xml\n`);
  });
});
