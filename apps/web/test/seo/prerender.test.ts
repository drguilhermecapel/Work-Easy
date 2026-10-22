// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_LABELS, LOCATION_LABELS, PRICE_UNIT_LABELS, PROVIDER_KIND_LABELS, VERIFICATION_LABELS } from '../../catalog/labels';

// scripts/prerender.mjs writes the static SEO pages after `vite build`.
// These tests run its exported functions against a temporary dist/.

interface Occupation {
  slug: string;
  name: string;
  synonyms?: string[];
}
interface Area {
  slug: string;
  name: string;
  description: string;
  occupations: Occupation[];
}
type Policy = Record<string, unknown>;
interface Neighborhood {
  name: string;
  slug: string;
  zone: string;
}
interface Inputs {
  areas: Area[];
  policies: Record<string, Policy>;
  neighborhoods: Neighborhood[] | null;
}
interface Page {
  kind: string;
  /** False for pages kept out of search results (neighborhood pages without local data). */
  indexable?: boolean;
  path: string;
  title: string;
  description: string;
  jsonLd: Record<string, unknown>;
  body: string;
}
interface PrerenderResult {
  pages: Page[];
  counts: Record<string, number>;
  sitemapPaths: string[];
}
interface PrerenderModule {
  LAUNCH_AREA_SLUGS: string[];
  LAUNCH_ZONES: string[];
  FORBIDDEN_CLAIMS: Array<[string, RegExp]>;
  PRICE_UNIT_TEXT: Record<string, string>;
  LOCATION_TEXT: Record<string, string>;
  VERIFICATION_TEXT: Record<string, string>;
  PROVIDER_KIND_TEXT: Record<string, unknown>;
  BILLING_TEXT: Record<string, unknown>;
  loadInputs: (root: string, warn?: (message: string) => void) => Inputs;
  buildPages: (input: Inputs & { siteUrl?: string; canRequest?: boolean; warn?: (message: string) => void }) => Page[];
  renderPage: (template: string, page: Page, siteUrl?: string) => string;
  validatePage: (page: Page, siteUrl?: string) => string[];
  validateHtml: (html: string) => string[];
  findProhibitedText: (page: Page) => string[];
  buildSitemap: (paths: string[], siteUrl: string, date: string) => string;
  buildSitemapFiles: (paths: string[], siteUrl: string, date: string, limit?: number) => Array<{ name: string; xml: string }>;
  buildRobots: (base: string, siteUrl: string) => string;
  normalizeSiteUrl: (value: string | undefined, warn?: (message: string) => void) => string;
  requestEnabled: (env: Record<string, string>) => boolean;
  requestHref: (occupation: string, neighborhood?: string) => string;
  mapLimit: <T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) => Promise<void>;
  prerender: (options: {
    root: string;
    distDir: string;
    siteUrl?: string;
    buildDate?: string;
    canRequest?: boolean;
    concurrency?: number;
    log?: (message: string) => void;
    warn?: (message: string) => void;
  }) => Promise<PrerenderResult>;
}

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'prerender.mjs');
const SITE = 'https://workeasy.example';
const DATE = '2026-10-22';
const TEMPLATE =
  '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="description" content="Geral" /><title>WorkEasy</title></head><body><div id="root"></div></body></html>';

const load = async (): Promise<PrerenderModule> => (await import(pathToFileURL(SCRIPT).href)) as PrerenderModule;
let mod: PrerenderModule;
beforeEach(async () => {
  mod = await load();
});

const tmpDirs: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'prerender-'));
  tmpDirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const quiet = { log: () => {}, warn: () => {} };

/** A project folder with the given inputs and a dist/ holding only the template. */
const makeProject = (inputs: Inputs): { root: string; dist: string } => {
  const root = tmp();
  mkdirSync(join(root, 'catalog'));
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'catalog', 'areas.json'), JSON.stringify({ areas: inputs.areas }));
  writeFileSync(join(root, 'catalog', 'policies.json'), JSON.stringify(inputs.policies));
  writeFileSync(join(root, 'data', 'neighborhoods.json'), JSON.stringify(inputs.neighborhoods ?? []));
  writeFileSync(join(root, 'dist', 'index.html'), TEMPLATE);
  return { root, dist: join(root, 'dist') };
};

const policy = (overrides: Policy = {}): Policy => ({
  regulated: false,
  regulatorBody: '',
  registryName: '',
  legalBasis: '',
  verification: ['documento_selfie', 'cadastro_fiscal'],
  backgroundCheck: false,
  billing: 'comissao_primeiro_servico',
  ratingRanking: true,
  laborLock: false,
  providerType: 'autonomo',
  audienceMinors: false,
  priceUnits: ['hora', 'servico'],
  locations: ['domicilio'],
  notes: '',
  confidence: 'conferido',
  sources: [],
  ...overrides,
});

const bairros: Neighborhood[] = [
  { name: 'Moema', slug: 'moema', zone: 'Sul' },
  { name: 'Santo Amaro', slug: 'santo-amaro', zone: 'Sul' },
  { name: 'Campo Belo', slug: 'campo-belo', zone: 'Sul' },
  { name: 'Sé', slug: 'se', zone: 'Centro' },
  { name: 'Mooca', slug: 'mooca', zone: 'Leste' },
];

const smallInputs = (): Inputs => ({
  areas: [
    {
      slug: 'reformas',
      name: 'Reformas',
      description: 'Obras e reparos residenciais.',
      occupations: [
        { slug: 'encanador', name: 'Encanador', synonyms: ['conserto de vazamento'] },
        { slug: 'pintor', name: 'Pintor' },
      ],
    },
    {
      slug: 'health',
      name: 'Saúde',
      description: 'Consultas com médicos.',
      occupations: [{ slug: 'cardiologista', name: 'Cardiologista', synonyms: [] }],
    },
  ],
  policies: {
    encanador: policy(),
    pintor: policy({ priceUnits: ['m2'], locations: ['domicilio', 'empresa_cliente'] }),
    cardiologista: policy({
      regulated: true,
      regulatorBody: 'CFM/CRM',
      registryName: 'CRM',
      legalBasis: 'Lei 3.268/1957',
      verification: ['documento_selfie', 'registro_profissional'],
      billing: 'so_assinatura',
      ratingRanking: false,
      priceUnits: ['sessao'],
      locations: ['estabelecimento', 'online'],
    }),
  },
  neighborhoods: bairros,
});

const textOf = (html: string): string => html.replace(/<[^>]+>/g, '\n');

describe('prerender: pages of the real catalog', () => {
  let inputs: Inputs;
  let pages: Page[];
  beforeEach(() => {
    inputs = mod.loadInputs(ROOT, () => {});
    pages = mod.buildPages({ ...inputs, siteUrl: SITE, warn: () => {} });
  });

  it('writes one page per area, occupation and launch neighborhood', () => {
    const occupations = inputs.areas.flatMap(area => area.occupations.map(o => ({ area, o })));
    const launch = occupations.filter(({ area }) => mod.LAUNCH_AREA_SLUGS.includes(area.slug));
    const launchNeighborhoods = (inputs.neighborhoods ?? []).filter(n => mod.LAUNCH_ZONES.includes(n.zone));
    const count = (kind: string) => pages.filter(p => p.kind === kind).length;
    expect(count('categorias')).toBe(1);
    expect(count('area')).toBe(inputs.areas.filter(a => a.occupations.length > 0).length);
    expect(count('servico')).toBe(occupations.length);
    expect(count('bairro')).toBe(launch.length * launchNeighborhoods.length);
    expect(launchNeighborhoods.length).toBeGreaterThan(0);
  });

  it('gives every page a unique title, description and path', () => {
    for (const key of ['title', 'description', 'path'] as const) {
      const values = pages.map(p => p[key]);
      expect(new Set(values).size).toBe(values.length);
      expect(values.every(v => v.trim() !== '')).toBe(true);
    }
  });

  it('passes the page checks and has no forbidden claim, price or rating', () => {
    for (const page of pages) {
      expect(mod.validatePage(page, SITE), page.path).toEqual([]);
      expect(mod.findProhibitedText(page), page.path).toEqual([]);
    }
  });

  it('has valid JSON-LD of type Service, with no price, rating or review', () => {
    const dist = tmp();
    writeFileSync(join(dist, 'index.html'), TEMPLATE);
    for (const page of pages) {
      const html = mod.renderPage(TEMPLATE, page, SITE);
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(blocks).toHaveLength(1);
      const data = JSON.parse(blocks[0][1]) as Record<string, unknown>;
      expect(data['@context']).toBe('https://schema.org');
      expect(data['@type']).toBe('Service');
      expect(data.url).toBe(`${SITE}${page.path}`);
      expect(JSON.stringify(data)).not.toMatch(/aggregateRating|ratingValue|reviewCount|"review"|"offers"|"price|priceRange|priceCurrency/);
    }
  });

  it('links neighborhood pages to the request form with service and neighborhood', () => {
    const page = pages.find(p => p.kind === 'bairro');
    expect(page).toBeDefined();
    const [, occupation, bairro] = page!.path.split('/').filter(Boolean);
    expect(page!.body).toContain(`href="/pedido?servico=${occupation}&amp;bairro=${bairro}"`);
    const service = pages.find(p => p.path === `/servicos/${occupation}`)!;
    expect(service.body).toContain(`href="/pedido?servico=${occupation}"`);
    expect(service.body).toContain(`href="/servicos/${occupation}/${bairro}"`);
  });

  it('offers the search instead of the request form when /pedido is not available', () => {
    const noRequest = mod.buildPages({ ...inputs, siteUrl: SITE, canRequest: false, warn: () => {} });
    expect(noRequest.some(p => p.body.includes('/pedido?'))).toBe(false);
    expect(noRequest.find(p => p.kind === 'bairro')!.body).toContain('href="/search?q=');
  });
});

describe('prerender: content of a page', () => {
  it('writes real HTML into #root, with h1, area link, related links and the policy text', () => {
    const pages = mod.buildPages({ ...smallInputs(), warn: () => {} });
    const encanador = pages.find(p => p.path === '/servicos/encanador')!;
    const html = mod.renderPage(TEMPLATE, encanador);
    expect(html).toMatch(/<div id="root"><main [\s\S]*<h1 [^>]*>Encanador<\/h1>/);
    expect(html).toContain('href="/categorias/reformas"');
    expect(html).toContain('href="/servicos/pintor"');
    const text = textOf(encanador.body);
    expect(text).toContain('por hora ou por serviço');
    expect(text).toContain('na casa do cliente');
    expect(text).toContain('documento com foto e selfie');
    expect(text).toContain('não exige registro em conselho profissional');
    expect(mod.validateHtml(html)).toEqual([]);
  });

  it('describes a regulated profession from its policy', () => {
    const pages = mod.buildPages({ ...smallInputs(), warn: () => {} });
    const text = textOf(pages.find(p => p.path === '/servicos/cardiologista')!.body);
    expect(text).toContain('é profissão regulamentada: o profissional precisa de registro no CRM (CFM/CRM), com base em Lei 3.268/1957');
    expect(text).toContain('não são ordenados por nota, por regra do conselho profissional');
    expect(text).toContain('apenas a assinatura da ferramenta');
  });

  it('has at least 3 own sentences per occupation and neighborhood page', () => {
    const pages = mod.buildPages({ ...smallInputs(), warn: () => {} });
    for (const page of pages.filter(p => p.kind === 'servico' || p.kind === 'bairro')) {
      const sentences = [...page.body.matchAll(/<p [^>]*>([^<]*)<\/p>/g)].flatMap(m => m[1].split(/(?<=[.!?])\s+/));
      expect(sentences.length, page.path).toBeGreaterThanOrEqual(3);
    }
  });

  it('does not repeat the same paragraph on pages of different occupations', () => {
    const pages = mod.buildPages({ ...smallInputs(), warn: () => {} }).filter(p => p.kind === 'servico');
    const seen = new Map<string, string>();
    for (const page of pages) {
      for (const [, paragraph] of page.body.matchAll(/<p [^>]*>([^<]*)<\/p>/g)) {
        if (paragraph.startsWith('O WorkEasy está em fase inicial')) continue;
        expect(seen.get(paragraph), `${page.path}: ${paragraph}`).toBeUndefined();
        seen.set(paragraph, page.path);
      }
    }
  });

  it('gives neighborhood pages their own introduction and links to different neighbors', () => {
    const pages = mod.buildPages({ ...smallInputs(), warn: () => {} }).filter(p => p.kind === 'bairro');
    const intros = pages.map(p => /<p [^>]*>([^<]*)<\/p>/.exec(p.body)![1]);
    expect(new Set(intros).size).toBe(intros.length);
    const sul = pages.filter(p => p.path.startsWith('/servicos/encanador/') && !p.path.endsWith('/se'));
    const linkSets = sul.map(p => [...p.body.matchAll(/href="(\/servicos\/encanador\/[^"]+)"/g)].map(m => m[1]).join('|'));
    expect(new Set(linkSets).size).toBeGreaterThan(1);
    // Launch zones only, launch areas only
    expect(pages.some(p => p.path.endsWith('/mooca'))).toBe(false);
    expect(pages.some(p => p.path.includes('cardiologista'))).toBe(false);
  });

  it('keeps the area of two occupations that share a name apart', () => {
    const inputs = smallInputs();
    inputs.areas[1].occupations.push({ slug: 'instrutor-saude', name: 'Pintor' });
    inputs.policies['instrutor-saude'] = policy();
    const pages = mod.buildPages({ ...inputs, warn: () => {} });
    const titles = pages.filter(p => p.path.startsWith('/servicos/') && p.path.split('/').length === 3).map(p => p.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).toContain('Pintor (Reformas): como contratar | WorkEasy');
    expect(titles).toContain('Pintor (Saúde): como contratar | WorkEasy');
  });

  it('escapes names in the HTML and in the JSON-LD', () => {
    const inputs = smallInputs();
    inputs.areas[0].occupations[0] = { slug: 'encanador', name: 'Técnico <b>&</b> "x" $& </script>', synonyms: ["a'b"] };
    const pages = mod.buildPages({ ...inputs, warn: () => {} });
    const html = mod.renderPage(TEMPLATE, pages.find(p => p.path === '/servicos/encanador')!, SITE);
    expect(html).not.toContain('<b>');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1];
    expect((JSON.parse(ld) as { name: string }).name).toContain('Técnico <b>&</b> "x" $& </script>');
    expect(html).toContain('$&amp;');
    expect(mod.validateHtml(html)).toEqual([]);
  });
});

describe('prerender: canonical and site URL', () => {
  it('uses VITE_SITE_URL in canonical, og:url and JSON-LD', () => {
    const pages = mod.buildPages({ ...smallInputs(), siteUrl: SITE, warn: () => {} });
    const html = mod.renderPage(TEMPLATE, pages.find(p => p.path === '/servicos/pintor/moema')!, SITE);
    expect(html).toContain(`<link rel="canonical" href="${SITE}/servicos/pintor/moema" />`);
    expect(html).toContain(`<meta property="og:url" content="${SITE}/servicos/pintor/moema" />`);
    expect(html).toContain('<meta property="og:title" content="Pintor em Moema, São Paulo | WorkEasy" />');
    expect(html).toContain('<title>Pintor em Moema, São Paulo | WorkEasy</title>');
    expect((html.match(/<meta name="description"/g) ?? []).length).toBe(1);
  });

  it('falls back to relative canonicals, warns and writes no sitemap when the variable is absent', async () => {
    const { root, dist } = makeProject(smallInputs());
    const warn = vi.fn();
    await mod.prerender({ root, distDir: dist, siteUrl: '', buildDate: DATE, log: () => {}, warn });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VITE_SITE_URL'));
    const html = readFileSync(join(dist, 'servicos', 'encanador', 'index.html'), 'utf8');
    expect(html).toContain('<link rel="canonical" href="/servicos/encanador" />');
    // A sitemap with relative paths would be invalid, so none is written
    expect(existsSync(join(dist, 'sitemap.xml'))).toBe(false);
    expect(readFileSync(join(dist, 'robots.txt'), 'utf8')).not.toMatch(/sitemap/i);
  });

  it('normalizes the site URL', () => {
    const warn = vi.fn();
    expect(mod.normalizeSiteUrl('https://workeasy.com.br/', warn)).toBe('https://workeasy.com.br');
    expect(mod.normalizeSiteUrl('', warn)).toBe('');
    expect(mod.normalizeSiteUrl(undefined, warn)).toBe('');
    expect(warn).not.toHaveBeenCalled();
    expect(mod.normalizeSiteUrl('workeasy', warn)).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('prerender: neighborhood pages need local data to be indexed', () => {
  it('marks neighborhood pages noindex and keeps them out of the sitemap by default', async () => {
    const { root, dist } = makeProject(smallInputs());
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    const html = readFileSync(join(dist, 'servicos', 'encanador', 'moema', 'index.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex,follow" />');
    expect(result.sitemapPaths).not.toContain('/servicos/encanador/moema');
    // Occupation pages stay indexable
    const occupation = readFileSync(join(dist, 'servicos', 'encanador', 'index.html'), 'utf8');
    expect(occupation).not.toContain('noindex');
    expect(result.sitemapPaths).toContain('/servicos/encanador');
  });

  it('indexes only the pairs listed in data/seo-local.json', async () => {
    const { root, dist } = makeProject(smallInputs());
    writeFileSync(join(root, 'data', 'seo-local.json'), JSON.stringify(['encanador/moema']));
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    expect(readFileSync(join(dist, 'servicos', 'encanador', 'moema', 'index.html'), 'utf8')).not.toContain('noindex');
    expect(result.sitemapPaths).toContain('/servicos/encanador/moema');
    expect(result.sitemapPaths).not.toContain('/servicos/pintor/moema');
  });
});

describe('prerender: writing dist/', () => {
  it('writes every page, the sitemap with the indexable URLs and robots.txt', async () => {
    const { root, dist } = makeProject(smallInputs());
    writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://old.example/sitemap.xml\n');
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });

    for (const page of result.pages) {
      const file = join(dist, ...page.path.split('/').filter(Boolean), 'index.html');
      expect(existsSync(file), page.path).toBe(true);
      expect(mod.validateHtml(readFileSync(file, 'utf8')), page.path).toEqual([]);
    }
    expect(existsSync(join(dist, 'categorias', 'index.html'))).toBe(true);
    expect(existsSync(join(dist, 'categorias', 'reformas', 'index.html'))).toBe(true);
    expect(existsSync(join(dist, 'servicos', 'encanador', 'moema', 'index.html'))).toBe(true);

    const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    // Neighborhood pages without local data are noindex and stay out of the sitemap
    expect(locs).toEqual([`${SITE}/`, ...result.pages.filter(p => p.indexable !== false).map(p => `${SITE}${p.path}`)]);
    expect(locs.some(loc => loc.includes('/moema'))).toBe(false);
    expect(sitemap.match(new RegExp(`<lastmod>${DATE}</lastmod>`, 'g'))).toHaveLength(locs.length);
    expect(result.sitemapPaths).toHaveLength(locs.length);

    const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robots).not.toContain('old.example');
    expect(robots.startsWith('User-agent: *\nAllow: /')).toBe(true);
  });

  it('splits the sitemap into an index past the URL limit', () => {
    const paths = Array.from({ length: 5 }, (_, i) => `/servicos/s${i}`);
    expect(mod.buildSitemapFiles(paths, SITE, DATE, 5).map(f => f.name)).toEqual(['sitemap.xml']);
    const files = mod.buildSitemapFiles(paths, SITE, DATE, 2);
    expect(files.map(f => f.name)).toEqual(['sitemap.xml', 'sitemap-1.xml', 'sitemap-2.xml', 'sitemap-3.xml']);
    expect(files[0].xml).toContain(`<loc>${SITE}/sitemap-3.xml</loc>`);
    const urls = files.slice(1).flatMap(f => [...f.xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
    expect(urls).toEqual(paths.map(p => `${SITE}${p}`));
  });

  it('keeps the existing robots.txt rules and adds Sitemap only with a site URL', () => {
    const base = readFileSync(join(ROOT, 'public', 'robots.txt'), 'utf8');
    expect(mod.buildRobots(base, '')).toBe(base);
    expect(mod.buildRobots(base, SITE)).toBe(`${base}\nSitemap: ${SITE}/sitemap.xml\n`);
    expect(base).not.toMatch(/sitemap/i);
  });

  it('generates nothing in native mode', () => {
    const { dist } = makeProject(smallInputs());
    const out = execFileSync('node', [SCRIPT, '--mode', 'native', '--dist', dist], { encoding: 'utf8', cwd: ROOT });
    expect(out).toContain('native');
    expect(readdirSync(dist)).toEqual(['index.html']);
  });

  it('limits concurrent writes and stops at the first failure', async () => {
    let running = 0;
    let peak = 0;
    await mod.mapLimit(Array.from({ length: 40 }, (_, i) => i), 4, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 1));
      running--;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);

    const started: number[] = [];
    await expect(
      mod.mapLimit(Array.from({ length: 100 }, (_, i) => i), 2, async i => {
        started.push(i);
        await new Promise(resolve => setTimeout(resolve, 1));
        if (i === 3) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(started.length).toBeLessThan(100);
  });

  it('writes thousands of pages quickly', async () => {
    const occupations = Array.from({ length: 120 }, (_, i) => ({ slug: `oficio-${i}`, name: `Ofício ${i.toString(36)}x` }));
    const inputs: Inputs = {
      areas: [{ slug: 'cuidados', name: 'Cuidados', description: 'Cuidado com pessoas.', occupations }],
      policies: Object.fromEntries(occupations.map((o, i) => [o.slug, policy({ priceUnits: i % 2 ? ['hora'] : ['dia', 'mes'], locations: i % 3 ? ['domicilio'] : ['online', 'externo'] })])),
      neighborhoods: Array.from({ length: 40 }, (_, i) => ({ name: `Bairro ${i.toString(36)}z`, slug: `bairro-${i}`, zone: i % 5 === 0 ? 'Centro' : 'Sul' })),
    };
    const { root, dist } = makeProject(inputs);
    const started = Date.now();
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    const elapsed = Date.now() - started;
    expect(result.pages.length).toBe(1 + 1 + 120 + 120 * 40);
    expect(result.counts.bairro).toBe(4800);
    expect(readdirSync(join(dist, 'servicos', 'oficio-7')).length).toBe(41);
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);
});

describe('prerender: failures', () => {
  it('fails when a page has no title, description or canonical', async () => {
    const page = mod.buildPages({ ...smallInputs(), warn: () => {} }).find(p => p.path === '/servicos/pintor')!;
    expect(() => mod.renderPage(TEMPLATE, { ...page, title: '' })).toThrow(/sem título/);
    expect(() => mod.renderPage(TEMPLATE, { ...page, title: '   ' })).toThrow(/sem título/);
    expect(() => mod.renderPage(TEMPLATE, { ...page, description: '' })).toThrow(/sem descrição/);
    expect(() => mod.renderPage(TEMPLATE, { ...page, path: '' })).toThrow(/sem canonical/);
    expect(() => mod.renderPage(TEMPLATE, page)).not.toThrow();
    expect(mod.validateHtml(TEMPLATE)).toEqual(expect.arrayContaining(['<link rel="canonical"> vazio']));
    expect(mod.validateHtml(TEMPLATE.replace('<title>WorkEasy</title>', '<title></title>'))).toContain('<title> vazio');
  });

  it('fails the build, writing nothing, when an occupation has no name', async () => {
    const inputs = smallInputs();
    inputs.areas[0].occupations[1].name = '';
    const { root, dist } = makeProject(inputs);
    await expect(mod.prerender({ root, distDir: dist, ...quiet })).rejects.toThrow(/sem nome/);
    expect(readdirSync(dist)).toEqual(['index.html']);
  });

  it('fails the build, writing nothing, on a forbidden claim or an invented price', async () => {
    const claim = smallInputs();
    claim.areas[0].description = 'Pagamento seguro e profissional verificado.';
    const a = makeProject(claim);
    await expect(mod.prerender({ root: a.root, distDir: a.dist, ...quiet })).rejects.toThrow(/texto proibido/);
    expect(readdirSync(a.dist)).toEqual(['index.html']);

    const price = smallInputs();
    price.areas[0].occupations[0].synonyms = ['visita a R$ 80'];
    const b = makeProject(price);
    await expect(mod.prerender({ root: b.root, distDir: b.dist, ...quiet })).rejects.toThrow(/price in reais/);
  });

  it('fails when two pages would share a title', () => {
    const inputs = smallInputs();
    // Same name and same area: the area cannot tell them apart
    inputs.areas[0].occupations.push({ slug: 'pintor-2', name: 'Pintor' });
    inputs.policies['pintor-2'] = policy();
    expect(() => mod.buildPages({ ...inputs, warn: () => {} })).toThrow(/title repetido/);
  });

  it('fails without dist/index.html', async () => {
    const { root, dist } = makeProject(smallInputs());
    rmSync(join(dist, 'index.html'));
    await expect(mod.prerender({ root, distDir: dist, ...quiet })).rejects.toThrow(/vite build/);
  });

  it('skips occupations without a policy and areas without a valid slug, with a warning', () => {
    const inputs = smallInputs();
    inputs.areas[0].occupations.push({ slug: 'sem-politica', name: 'Sem política' });
    inputs.areas.push({ slug: 'Slug Inválido', name: 'Inválida', description: 'x.', occupations: [{ slug: 'x', name: 'X' }] });
    const warn = vi.fn();
    const pages = mod.buildPages({ ...inputs, warn });
    expect(pages.some(p => p.path.includes('sem-politica'))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sem-politica'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Slug Inválido'));
  });
});

describe('prerender: stays in step with the rest of the project', () => {
  it('keeps the forbidden claims identical to test/claims-guard.test.ts', () => {
    const guard = readFileSync(join(ROOT, 'test', 'claims-guard.test.ts'), 'utf8');
    const block = /const FORBIDDEN_CLAIMS[^=]*= \[([\s\S]*?)\n\];/.exec(guard)![1];
    const patterns = [...block.matchAll(/,\s*\/(.*)\/\],?$/gm)].map(m => m[1]);
    expect(patterns.length).toBeGreaterThan(5);
    expect(mod.FORBIDDEN_CLAIMS.map(([, re]) => re.source)).toEqual(patterns);
  });

  it('writes prose for every enum of catalog/labels.ts', () => {
    expect(Object.keys(mod.PRICE_UNIT_TEXT).sort()).toEqual(Object.keys(PRICE_UNIT_LABELS).sort());
    expect(Object.keys(mod.LOCATION_TEXT).sort()).toEqual(Object.keys(LOCATION_LABELS).sort());
    expect(Object.keys(mod.VERIFICATION_TEXT).sort()).toEqual(Object.keys(VERIFICATION_LABELS).sort());
    expect(Object.keys(mod.PROVIDER_KIND_TEXT).sort()).toEqual(Object.keys(PROVIDER_KIND_LABELS).sort());
    expect(Object.keys(mod.BILLING_TEXT).sort()).toEqual(Object.keys(BILLING_LABELS).sort());
  });

  it('covers every value used by catalog/policies.json', () => {
    const { policies } = mod.loadInputs(ROOT, () => {});
    for (const [slug, p] of Object.entries(policies)) {
      for (const unit of p.priceUnits as string[]) expect(mod.PRICE_UNIT_TEXT[unit], `${slug} ${unit}`).toBeDefined();
      for (const place of p.locations as string[]) expect(mod.LOCATION_TEXT[place], `${slug} ${place}`).toBeDefined();
      for (const step of p.verification as string[]) expect(mod.VERIFICATION_TEXT[step], `${slug} ${step}`).toBeDefined();
      expect(mod.PROVIDER_KIND_TEXT[p.providerType as string], slug).toBeDefined();
      expect(mod.BILLING_TEXT[p.billing as string], slug).toBeDefined();
    }
  });

  it('builds the request link and decides when /pedido works like config/features.ts', () => {
    expect(mod.requestHref('diarista')).toBe('/pedido?servico=diarista');
    expect(mod.requestHref('diarista', 'vila-mariana')).toBe('/pedido?servico=diarista&bairro=vila-mariana');
    expect(mod.requestEnabled({})).toBe(false);
    expect(mod.requestEnabled({ VITE_SUPABASE_URL: 'http://x' })).toBe(false);
    expect(mod.requestEnabled({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBe(true);
    expect(mod.requestEnabled({ VITE_CONCIERGE_WHATSAPP: '5511999999999' })).toBe(true);
    expect(mod.requestEnabled({ VITE_CONCIERGE_WHATSAPP: '123' })).toBe(false);
  });

  it('detects a forbidden phrase, price and rating (self-check)', () => {
    const page = (text: string): Page => ({ kind: 'servico', path: '/x', title: 't', description: 'd', jsonLd: {}, body: `<p>${text}</p>` });
    expect(mod.findProhibitedText(page('Criptografia ponta a ponta'))).not.toEqual([]);
    expect(mod.findProhibitedText(page('Profissional VERIFICADO'))).not.toEqual([]);
    expect(mod.findProhibitedText(page('Perfil não verificado'))).toEqual([]);
    expect(mod.findProhibitedText(page('A partir de R$ 50'))).not.toEqual([]);
    expect(mod.findProhibitedText(page('Nota 4,8/5 em 120 avaliações'))).not.toEqual([]);
    expect(mod.findProhibitedText(page('5 estrelas'))).not.toEqual([]);
    expect(mod.findProhibitedText(page('LC 150/2015, até 2 dias por semana'))).toEqual([]);
    const withRating: Page = { ...page('x'), jsonLd: { '@type': 'Service', aggregateRating: { ratingValue: 5 } } };
    expect(mod.validatePage(withRating)).toContain('JSON-LD com preço, nota ou avaliação');
  });
});
