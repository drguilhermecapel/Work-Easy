// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATE,
  ROOT,
  SITE,
  loadPrerender,
  makeProjectIn,
  policy,
  smallInputs,
  trackTmpDirs,
  type Inputs,
  type Page,
  type PrerenderModule,
} from './helpers';

// The content guard of scripts/prerender.mjs. An occupation page is indexable
// only when it says at least three things that no other occupation page says:
// sentences that are distinct, long enough to be content, not the notice every
// page carries, and not the template with a name swapped in.

let mod: PrerenderModule;
beforeEach(async () => {
  mod = await loadPrerender();
});
const tmp = trackTmpDirs();

const para = (text: string): string => `<p class="text-sm">${text}</p>`;
const page = (body: string, overrides: Partial<Page> = {}): Page => ({
  kind: 'servico',
  path: '/servicos/pintor',
  title: 'Pintor',
  description: 'Pintor',
  jsonLd: {},
  body,
  owner: 'occupation:pintor',
  masks: ['Pintor'],
  ...overrides,
});

describe('own sentences: what a page says that no other occupation page says', () => {
  it('counts distinct sentences with at least six words', () => {
    const p = page(
      para('Veja também. Frase curta demais aqui. Esta frase tem exatamente seis palavras. Esta frase tem exatamente seis palavras.'),
    );
    expect(mod.MIN_SENTENCE_WORDS).toBe(6);
    expect(mod.ownSentences(p)).toEqual(['Esta frase tem exatamente seis palavras.']);
  });

  it('never counts the notices that every page carries', () => {
    const p = page(para(mod.NOTICE) + para(mod.RULE_NOTE) + para('Pintura de paredes internas e externas com massa corrida.'));
    expect(mod.ownSentences(p)).toEqual(['Pintura de paredes internas e externas com massa corrida.']);
  });

  it('reads sentences as written, without HTML entities', () => {
    const p = page(para('Tom &amp; Jerry fazem &quot;consertos&quot; de &lt;tudo&gt; em casa.'));
    expect(mod.pageSentences(p)).toEqual(['Tom & Jerry fazem "consertos" de <tudo> em casa.']);
  });

  it('does not count what the template writes for every occupation, whatever the name put into it', () => {
    const templated = (name: string): string => `O atendimento de ${name} acontece na casa do cliente todos os dias.`;
    const a = page(para(templated('Pintor')) + para('Pintura interna e externa de baixa altura com massa.'));
    const b = page(para(templated('Encanador')) + para('Reparos hidráulicos em casas e comércios da região.'), {
      path: '/servicos/encanador',
      owner: 'occupation:encanador',
      masks: ['Encanador'],
    });
    // Alone, each page looks like it has two sentences of its own
    expect(mod.ownSentences(a)).toHaveLength(2);
    const index = mod.buildSentenceIndex([a, b]);
    expect(mod.ownSentences(a, index)).toEqual(['Pintura interna e externa de baixa altura com massa.']);
    expect(mod.ownSentences(b, index)).toEqual(['Reparos hidráulicos em casas e comércios da região.']);
  });

  it('treats numbers as part of the template', () => {
    const area = (name: string, count: number): Page =>
      page(para(`${name} tem ${count} serviços no WorkEasy com registro exigido no cadastro.`), { kind: 'area', owner: `area:${name}`, masks: [name] });
    const reformas = area('Reformas', 69);
    const limpeza = area('Limpeza', 32);
    const index = mod.buildSentenceIndex([reformas, limpeza]);
    expect(mod.ownSentences(reformas, index)).toEqual([]);
  });

  it('keeps a sentence that only the neighborhood pages of the same occupation repeat', () => {
    const sentence = 'Pintor atende casas e comércios com tinta lavável e massa acrílica.';
    const occupation = page(para(sentence));
    const neighborhood = page(para(sentence), { kind: 'bairro', path: '/servicos/pintor/moema' });
    expect(mod.ownSentences(occupation, mod.buildSentenceIndex([occupation, neighborhood]))).toEqual([sentence]);
  });

  it('leaves out the description of the area, even for an occupation whose name is inside it', () => {
    const description = 'Limpeza residencial e comercial de casas e apartamentos.';
    const alone = page(para(description), { masks: ['Limpeza'] });
    const other = page(para(description), { owner: 'occupation:faxina', path: '/servicos/faxina', masks: ['Faxina'] });
    // Masking the name makes the sentence differ from the one on the sibling page ...
    expect(mod.ownSentences(alone, mod.buildSentenceIndex([alone, other]))).toEqual([description]);
    // ... which is why the page also carries the area text it repeats by design
    expect(mod.ownSentences({ ...alone, shared: [description] }, mod.buildSentenceIndex([alone, other]))).toEqual([]);
  });
});

/** Three occupations, one policy, no scope note and no synonyms: only names differ. */
const templateOnly = (): Inputs => ({
  areas: [
    {
      slug: 'reformas',
      name: 'Reformas',
      description: 'Obras e reparos residenciais.',
      occupations: [
        { slug: 'pintor', name: 'Pintor' },
        { slug: 'encanador', name: 'Encanador' },
        { slug: 'gesseiro', name: 'Gesseiro' },
      ],
    },
  ],
  policies: { pintor: policy(), encanador: policy(), gesseiro: policy() },
  neighborhoods: [
    { name: 'Moema', slug: 'moema', zone: 'Sul' },
    { name: 'Santo Amaro', slug: 'santo-amaro', zone: 'Sul' },
  ],
});

describe('the guard keeps template-only occupation pages out of the index', () => {
  it('flags pages that only swap a name into the template', () => {
    const pages = mod.buildPages({ ...templateOnly(), warn: () => {} });
    const thin = mod.guardThinPages(pages);
    expect(thin.sort()).toEqual(['/servicos/encanador', '/servicos/gesseiro', '/servicos/pintor']);
    for (const path of thin) expect(pages.find(p => p.path === path)).toMatchObject({ indexable: false, thin: true });
  });

  it('writes them noindex, leaves them out of the sitemap, warns, and still writes the page', async () => {
    const { root, dist } = makeProjectIn(tmp(), templateOnly());
    const warn = vi.fn();
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, log: () => {}, warn });
    expect(result.thin).toHaveLength(3);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/3 página\(s\) de ocupação com menos de 3 frases próprias ficaram noindex/));
    const html = readFileSync(join(dist, 'servicos', 'pintor', 'index.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex,follow" />');
    expect(html).toContain('<h1');
    expect(result.sitemapPaths).toEqual(['/', '/categorias', '/categorias/reformas']);
  });

  it('indexes the same pages once they carry a scope note and other names of their own', () => {
    const inputs = templateOnly();
    inputs.policies.pintor = policy({
      notes: 'Pintura interna e externa de baixa altura, com massa e acabamento. Fachadas e trabalho em altura têm item próprio.',
    });
    inputs.areas[0].occupations[0] = { slug: 'pintor', name: 'Pintor', synonyms: ['pintura de parede', 'pintor de casas'] };
    const pages = mod.buildPages({ ...inputs, warn: () => {} });
    expect(mod.guardThinPages(pages).sort()).toEqual(['/servicos/encanador', '/servicos/gesseiro']);
    expect(pages.find(p => p.path === '/servicos/pintor')?.indexable).not.toBe(false);
  });

  it('lets the owner raise the bar', () => {
    const pages = mod.buildPages({ ...smallInputs(), warn: () => {} });
    expect(mod.guardThinPages(pages)).toEqual([]);
    expect(mod.guardThinPages(pages, { minOwn: 50 })).toHaveLength(3);
  });

  it('judges only occupation pages: neighborhood pages follow their own rule', () => {
    const pages = mod.buildPages({ ...templateOnly(), warn: () => {} });
    mod.guardThinPages(pages);
    const neighborhood = pages.find(p => p.kind === 'bairro')!;
    expect(neighborhood.thin).toBeUndefined();
    expect(neighborhood.indexable).toBe(false);
  });
});

describe('the guard on the real catalog', () => {
  it('indexes an occupation page only when it has three own sentences of its own', () => {
    const inputs = mod.loadInputs(ROOT, () => {});
    const pages = mod.buildPages({ ...inputs, siteUrl: SITE, warn: () => {} });
    const thin = mod.guardThinPages(pages);
    const occupations = pages.filter(p => p.kind === 'servico');
    const index = mod.buildSentenceIndex(pages.filter(p => p.kind !== 'bairro'));

    for (const p of occupations) {
      const own = mod.ownSentences(p, index);
      if (p.indexable === false) {
        expect(own.length, p.path).toBeLessThan(mod.MIN_OWN_SENTENCES);
      } else {
        expect(own.length, p.path).toBeGreaterThanOrEqual(mod.MIN_OWN_SENTENCES);
        for (const sentence of own) expect(sentence.split(/\s+/).length, `${p.path}: ${sentence}`).toBeGreaterThanOrEqual(mod.MIN_SENTENCE_WORDS);
      }
    }
    expect(thin.sort()).toEqual(occupations.filter(p => p.indexable === false).map(p => p.path).sort());
    // Not vacuous the other way either: the scope notes of the policies give most pages their own text
    expect(occupations.filter(p => p.indexable !== false).length).toBeGreaterThan(occupations.length / 2);
  }, 60_000);

  it('keeps every neighborhood page noindex unless its pair is listed in data/seo-local.json', () => {
    const inputs = mod.loadInputs(ROOT, () => {});
    const listed = new Set((inputs as unknown as { localPairs: string[] }).localPairs);
    const pages = mod.buildPages({ ...inputs, localPairs: [...listed], siteUrl: SITE, warn: () => {} });
    const neighborhoods = pages.filter(p => p.kind === 'bairro');
    expect(neighborhoods.length).toBeGreaterThan(0);
    for (const p of neighborhoods) {
      const [, occupation, bairro] = p.path.split('/').filter(Boolean);
      expect(p.indexable, p.path).toBe(listed.has(`${occupation}/${bairro}`));
    }
    mod.guardThinPages(pages);
    // An indexable occupation page does not make its neighborhood pages indexable
    expect(neighborhoods.some(p => p.indexable !== false && !listed.has(p.path.split('/').slice(2).join('/')))).toBe(false);
  }, 60_000);
});
