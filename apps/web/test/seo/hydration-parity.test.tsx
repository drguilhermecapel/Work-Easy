import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import AppShell from '../../AppShell';
import type { Inputs, Page, PrerenderModule } from './helpers';

// Demo mode even when a developer's .env.local configures Supabase (Vitest loads it like Vite)
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

// The static pages written by scripts/prerender.mjs are replaced by React when the app mounts
// (createRoot, not hydration). This checks that nothing a crawler could read in the static HTML
// is missing from the DOM after the mount: every link, every paragraph, every heading, and the title.

const ROOT = process.cwd();
const norm = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();

interface Facts {
  /** href -> the texts of the links to it */
  links: Map<string, string[]>;
  paragraphs: string[];
  headings: string[];
}

const factsOf = (root: ParentNode): Facts => {
  const links = new Map<string, string[]>();
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')!;
    links.set(href, [...(links.get(href) ?? []), norm(a.textContent)]);
  }
  return {
    links,
    paragraphs: [...root.querySelectorAll('p')].map(p => norm(p.textContent)).filter(Boolean),
    headings: [...root.querySelectorAll('h1, h2, h3')].map(h => norm(h.textContent)),
  };
};

/** What the static page has and the rendered page has not. Empty means nothing was lost. */
const missing = (staticFacts: Facts, rendered: Facts): string[] => {
  const lost: string[] = [];
  for (const [href, texts] of staticFacts.links) {
    const there = rendered.links.get(href);
    if (!there) {
      lost.push(`link ${href}`);
      continue;
    }
    for (const text of texts) if (!there.some(t => t.includes(text))) lost.push(`link text "${text}" of ${href} (found: ${there.join(' | ')})`);
  }
  for (const text of staticFacts.paragraphs) if (!rendered.paragraphs.includes(text)) lost.push(`paragraph "${text}"`);
  for (const text of staticFacts.headings) if (!rendered.headings.includes(text)) lost.push(`heading "${text}"`);
  return lost;
};

const staticFacts = (page: Page): Facts => {
  const doc = new DOMParser().parseFromString(`<div>${page.body}</div>`, 'text/html');
  return factsOf(doc.body);
};

const mountAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  );

/** The last thing each kind of page renders: the policies load lazily and the sections that need them come after. */
const settled = async (path: string): Promise<void> => {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'categorias' && parts.length === 1) {
    await screen.findByRole('heading', { level: 1, name: 'Todas as categorias' });
  } else if (parts[0] === 'categorias') {
    await screen.findByText(/tem \d+ serviços? no WorkEasy/, {}, { timeout: 10_000 });
  } else {
    await screen.findByRole('heading', { level: 2, name: 'Profissão regulamentada?' }, { timeout: 10_000 });
  }
};

let mod: PrerenderModule;
let inputs: Inputs;
const staticPages = new Map<string, Page>();

/** One occupation of the launch areas for each way a policy changes the text. */
const variants = (): string[] => {
  const policies = inputs.policies as Record<string, Record<string, unknown> & { verification: string[] }>;
  const launch = inputs.areas.filter(a => mod.LAUNCH_AREA_SLUGS.includes(a.slug)).flatMap(a => a.occupations.map(o => o.slug));
  const everything = inputs.areas.flatMap(a => a.occupations.map(o => o.slug));
  const pick = (pool: string[], test: (p: (typeof policies)[string]) => boolean): string | undefined => pool.find(slug => policies[slug] && test(policies[slug]));
  const chosen = [
    'diarista',
    'encanador',
    pick(launch, p => p.laborLock === true),
    pick(launch, p => p.regulated === true),
    pick(everything, p => p.regulated === true && p.billing === 'so_assinatura'),
    pick(everything, p => p.audienceMinors === true),
    pick(everything, p => p.backgroundCheck === true && p.audienceMinors === false && !p.verification.includes('antecedentes')),
    pick(everything, p => p.regulated === false && p.verification.includes('licenca_orgao')),
    pick(everything, p => p.ratingRanking === false && p.regulated === false),
    pick(everything, p => p.providerType === 'somente_empresa_licenciada'),
    pick(everything, p => p.confidence === 'a_confirmar'),
    pick(everything, p => p.billing === 'sob_consulta_juridica'),
    pick(everything, p => p.legalBasis !== '' && p.regulated === false),
    'cardiologista',
  ];
  return [...new Set(chosen.filter((slug): slug is string => Boolean(slug)))];
};

beforeAll(async () => {
  mod = (await import(pathToFileURL(join(ROOT, 'scripts', 'prerender.mjs')).href)) as PrerenderModule;
  inputs = mod.loadInputs(ROOT, () => {});
}, 30_000);

const buildStatic = (canRequest: boolean): void => {
  staticPages.clear();
  for (const page of mod.buildPages({ ...inputs, siteUrl: '', canRequest, warn: () => {} })) staticPages.set(page.path, page);
};

afterEach(() => vi.unstubAllEnvs());

describe('the DOM after React mounts keeps what the static page said', () => {
  const sampleAreas = ['categorias/reformas', 'categorias/health', 'categorias/limpeza', 'categorias/cuidados'];

  describe.each([
    ['without the concierge number', false],
    ['with the concierge number', true],
  ])('%s', (_, canRequest) => {
    beforeAll(() => {
      buildStatic(canRequest);
    }, 30_000);

    const route = async (path: string): Promise<void> => {
      vi.stubEnv('VITE_CONCIERGE_WHATSAPP', canRequest ? '5511999999999' : '');
      const page = staticPages.get(path);
      expect(page, `static page for ${path}`).toBeDefined();
      mountAt(path);
      await settled(path);
      const lost = missing(staticFacts(page!), factsOf(document.body));
      expect(lost, `${path} lost after the mount:\n${lost.join('\n')}`).toEqual([]);
      expect(document.title, path).toBe(page!.title);
    };

    it('on /categorias', async () => {
      await route('/categorias');
    }, 20_000);

    it.each(sampleAreas)('on /%s', async area => {
      await route(`/${area}`);
    }, 20_000);

    it('on the occupation pages, whatever the policy says', async () => {
      const slugs = variants();
      // Every way the policy changes the text is represented
      expect(slugs.length).toBeGreaterThanOrEqual(8);
      for (const slug of slugs) {
        await route(`/servicos/${slug}`);
        document.body.innerHTML = '';
      }
    }, 120_000);

    it('on the neighborhood pages of the launch areas', async () => {
      const launch = inputs.areas.filter(a => mod.LAUNCH_AREA_SLUGS.includes(a.slug));
      const policies = inputs.policies as Record<string, { regulated: boolean; laborLock: boolean }>;
      const slugs = [
        'diarista',
        'encanador',
        launch.flatMap(a => a.occupations).find(o => policies[o.slug]?.regulated)?.slug,
      ].filter((slug): slug is string => Boolean(slug));
      const bairros = ['moema', 'se'];
      for (const slug of slugs) {
        for (const bairro of bairros) {
          await route(`/servicos/${slug}/${bairro}`);
          document.body.innerHTML = '';
        }
      }
    }, 120_000);
  });

  it('is not vacuous: a page that is not the static one does lose things', async () => {
    buildStatic(false);
    mountAt('/servicos/diarista');
    await settled('/servicos/diarista');
    const lost = missing(staticFacts(staticPages.get('/servicos/encanador')!), factsOf(document.body));
    expect(lost.some(item => item.startsWith('link /servicos/encanador/'))).toBe(true);
    expect(lost.some(item => item.startsWith('heading "Encanador por bairro"'))).toBe(true);
    expect(lost.length).toBeGreaterThan(10);
  }, 20_000);

  it('sees a link or a sentence that only the static HTML has', () => {
    const a = factsOf(new DOMParser().parseFromString('<p>Um texto.</p><a href="/x">Texto</a><h2>Título</h2>', 'text/html').body);
    const b = factsOf(new DOMParser().parseFromString('<p>Um texto.</p><a href="/x">Texto longo</a><h2>Título</h2>', 'text/html').body);
    expect(missing(a, b)).toEqual([]);
    const lessLinks = factsOf(new DOMParser().parseFromString('<p>Um texto.</p><h2>Título</h2>', 'text/html').body);
    expect(missing(a, lessLinks)).toEqual(['link /x']);
    const lessText = factsOf(new DOMParser().parseFromString('<a href="/x">Texto</a><h2>Título</h2>', 'text/html').body);
    expect(missing(a, lessText)).toEqual(['paragraph "Um texto."']);
    const otherHeading = factsOf(new DOMParser().parseFromString('<p>Um texto.</p><a href="/x">Texto</a><h2>Outro</h2>', 'text/html').body);
    expect(missing(a, otherHeading)).toEqual(['heading "Título"']);
  });
});

describe('the occupation page keeps its policy-independent parts before the policies arrive', () => {
  it('shows the heading, the other names, the calls to action and the links at once', () => {
    mountAt('/servicos/encanador');
    // Rendered synchronously apart from the lazy page chunk: wait for the heading only
    return screen.findByRole('heading', { level: 1, name: 'Encanador' }).then(() => {
      expect(screen.getByText(/^Também procurado como /)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ofereço este serviço' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Encanador em Moema' })).toHaveAttribute('href', '/servicos/encanador/moema');
    });
  }, 20_000);
});
