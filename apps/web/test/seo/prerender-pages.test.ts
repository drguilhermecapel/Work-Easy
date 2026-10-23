// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATE,
  SITE,
  TEMPLATE,
  ldBlocks,
  loadPrerender,
  makeProjectIn,
  quiet,
  smallInputs,
  trackTmpDirs,
  type Inputs,
  type PrerenderModule,
  type StaticEntry,
} from './helpers';

// What scripts/prerender.mjs writes beyond the catalog: data/static-pages.json,
// content/legal/*.md (rendered by a small markdown function) and the script
// chunk preloads of the routes.

let mod: PrerenderModule;
beforeEach(async () => {
  mod = await loadPrerender();
});
const tmp = trackTmpDirs();

const entry = (overrides: Partial<StaticEntry> = {}): StaticEntry => ({
  path: '/como-funciona',
  title: 'Como funciona',
  description: 'Entenda como o WorkEasy conecta clientes e profissionais.',
  h1: 'Como funciona o WorkEasy',
  paragraphs: ['O cliente descreve o que precisa e combina o valor com o profissional.', 'O profissional responde com uma proposta, que o cliente aceita ou recusa.'],
  links: [{ to: '/categorias', label: 'Ver as categorias' }],
  ...overrides,
});

const project = (extra: Partial<Inputs> = {}): { root: string; dist: string } => makeProjectIn(tmp(), { ...smallInputs(), ...extra });
const read = (dist: string, ...parts: string[]): string => readFileSync(join(dist, ...parts, 'index.html'), 'utf8');

describe('static pages (data/static-pages.json)', () => {
  it('are written with the layout and the tags of the catalog pages', async () => {
    const { root, dist } = project({ staticPages: [entry()] });
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    const html = read(dist, 'como-funciona');
    expect(result.counts.estatica).toBe(1);
    expect(html).toContain('<main class="max-w-4xl mx-auto px-4 py-8 space-y-6 break-words" data-prerendered="estatica">');
    expect(html).toMatch(/<h1 class="[^"]*">Como funciona o WorkEasy<\/h1>/);
    expect(html).toContain('O cliente descreve o que precisa e combina o valor com o profissional.');
    expect(html).toMatch(/<a href="\/categorias" class="[^"]*">Ver as categorias<\/a>/);
    expect(html).toContain('<title>Como funciona | WorkEasy</title>');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/como-funciona" />`);
    expect(html).toContain('<meta property="og:title" content="Como funciona | WorkEasy" />');
    expect(html).toContain('<meta name="description" content="Entenda como o WorkEasy conecta clientes e profissionais." />');
    expect(html).not.toContain('noindex');
    expect(mod.validateHtml(html)).toEqual([]);
    expect(ldBlocks(html)).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Como funciona o WorkEasy',
        description: 'Entenda como o WorkEasy conecta clientes e profissionais.',
        inLanguage: 'pt-BR',
        url: `${SITE}/como-funciona`,
        isPartOf: { '@type': 'WebSite', name: 'WorkEasy', url: `${SITE}/` },
      },
    ]);
    expect(result.sitemapPaths).toContain('/como-funciona');
  });

  it('keep the title as given when it already names the site', async () => {
    const { root, dist } = project({ staticPages: [entry({ title: 'Sobre o WorkEasy' })] });
    await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    expect(read(dist, 'como-funciona')).toContain('<title>Sobre o WorkEasy</title>');
  });

  it('may have no links, and may sit below another path', async () => {
    const { root, dist } = project({ staticPages: [entry({ links: undefined }), entry({ path: '/ajuda/primeiros-passos', title: 'Primeiros passos', description: 'Como começar a usar o WorkEasy.', h1: 'Primeiros passos' })] });
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    expect(read(dist, 'como-funciona')).not.toContain('Veja também');
    expect(existsSync(join(dist, 'ajuda', 'primeiros-passos', 'index.html'))).toBe(true);
    expect(result.counts.estatica).toBe(2);
  });

  it.each([
    ['a path without the leading slash', { path: 'como-funciona' }, /"path" deve ser um caminho em minúsculas/],
    ['a path with capitals', { path: '/Como-Funciona' }, /"path" deve ser um caminho em minúsculas/],
    ['a path with a trailing slash', { path: '/como-funciona/' }, /"path" deve ser um caminho em minúsculas/],
    ['the login screen', { path: '/entrar' }, /"path" é uma tela do app/],
    ['a screen below an app path', { path: '/pedido/novo' }, /"path" é uma tela do app/],
    ['the catalog', { path: '/servicos/novo' }, /invade as páginas do catálogo/],
    ['no heading', { h1: '' }, /"h1" ausente/],
    ['no title', { title: ' ' }, /"title" ausente/],
    ['no description', { description: '' }, /"description" ausente/],
    ['no paragraphs', { paragraphs: [] }, /"paragraphs" deve ter ao menos um texto/],
    ['an empty paragraph', { paragraphs: ['Texto.', ' '] }, /"paragraphs" deve ter ao menos um texto/],
    ['a link to another site', { links: [{ to: 'https://example.com', label: 'Fora' }] }, /"to" deve ser um caminho interno/],
    ['a protocol-relative link', { links: [{ to: '//example.com', label: 'Fora' }] }, /"to" deve ser um caminho interno/],
    ['a link without a label', { links: [{ to: '/categorias', label: '' }] }, /link sem "label"/],
  ] as Array<[string, Partial<StaticEntry>, RegExp]>)('fail the build, writing nothing, with %s', async (_, overrides, message) => {
    const { root, dist } = project({ staticPages: [entry(overrides)] });
    await expect(mod.prerender({ root, distDir: dist, siteUrl: SITE, ...quiet })).rejects.toThrow(message);
    expect(readdirSync(dist)).toEqual(['index.html']);
  });

  it('say which entry is wrong', async () => {
    const { root, dist } = project({ staticPages: [entry(), entry({ path: '/sobre', h1: '' })] });
    await expect(mod.prerender({ root, distDir: dist, ...quiet })).rejects.toThrow('data/static-pages.json[1] (/sobre)');
  });

  it('cannot take the path of a generated page, or of each other', async () => {
    const taken = project({ staticPages: [entry({ path: '/categorias' })] });
    await expect(mod.prerender({ root: taken.root, distDir: taken.dist, ...quiet })).rejects.toThrow(/path repetido/);
    const twice = project({ staticPages: [entry(), entry({ title: 'Outro título', description: 'Outra descrição.' })] });
    await expect(mod.prerender({ root: twice.root, distDir: twice.dist, ...quiet })).rejects.toThrow(/path repetido/);
  });

  it('go through the same claim and price checks as the catalog pages', async () => {
    const claim = project({ staticPages: [entry({ paragraphs: ['Pagamento seguro e profissionais verificados.'] })] });
    await expect(mod.prerender({ root: claim.root, distDir: claim.dist, ...quiet })).rejects.toThrow(/texto proibido/);
    expect(readdirSync(claim.dist)).toEqual(['index.html']);
    const price = project({ staticPages: [entry({ paragraphs: ['Visitas a partir de R$ 80.'] })] });
    await expect(mod.prerender({ root: price.root, distDir: price.dist, ...quiet })).rejects.toThrow(/price in reais/);
  });

  it('are read from the file when it exists, and are none when it does not', () => {
    const none = tmp();
    expect(mod.loadStaticPages(none)).toEqual([]);
    mkdirSync(join(none, 'data'));
    writeFileSync(join(none, 'data', 'static-pages.json'), JSON.stringify([entry()]));
    expect(mod.loadStaticPages(none)).toEqual([entry()]);
    writeFileSync(join(none, 'data', 'static-pages.json'), JSON.stringify({ pages: [] }));
    expect(() => mod.loadStaticPages(none)).toThrow(/lista de páginas/);
  });
});

describe('markdown to HTML', () => {
  const html = (markdown: string): string => mod.markdownToHtml(markdown);

  it('renders headings, paragraphs, emphasis and links', () => {
    const out = html('# Termos\n\nTexto **forte**, _ênfase_, ~~riscado~~ e `código`.\n\nVeja [a política](/legal/politica) e [o site](https://example.com).');
    expect(out).toMatch(/<h1 class="[^"]*">Termos<\/h1>/);
    expect(out).toContain('<strong>forte</strong>');
    expect(out).toContain('<em>ênfase</em>');
    expect(out).toContain('<del>riscado</del>');
    expect(out).toContain('<code class="rounded bg-gray-100 px-1 text-xs">código</code>');
    expect(out).toContain('href="/legal/politica"');
    expect(out).toMatch(/<a href="https:\/\/example.com" rel="noopener noreferrer" class="[^"]*">o site<\/a>/);
    expect(out).not.toMatch(/<a href="\/legal\/politica" rel=/);
  });

  it('makes the first level-1 heading the only h1', () => {
    const out = html('# Um\n\n## Dois\n\n# Três\n\n### Quatro');
    expect(out.match(/<h1[ >]/g)).toHaveLength(1);
    expect(out).toMatch(/<h2 class="[^"]*">Três<\/h2>/);
    expect(out).toMatch(/<h3 class="[^"]*">Quatro<\/h3>/);
  });

  it('writes raw HTML as text', () => {
    const out = html('Olá <script>alert(1)</script> <img src=x onerror=alert(1)> <b>negrito</b>\n\n<div onclick="x()">bloco</div>');
    expect(out).not.toMatch(/<script|<img|<b>|<div/);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('links only to http(s), mailto, tel, paths and anchors', () => {
    const safe = html('[a](https://example.com/x?y=1&z=2) [b](mailto:a@b.com) [c](tel:+5511999999999) [d](/legal/x) [e](#secao) [f](../x)');
    expect([...safe.matchAll(/<a href="([^"]+)"/g)].map(m => m[1])).toEqual(['https://example.com/x?y=1&amp;z=2', 'mailto:a@b.com', 'tel:+5511999999999', '/legal/x', '#secao', '../x']);
    const unsafe = html('[js](javascript:alert(1)) [data](data:text/html,x) [vb](VBScript:x) [proto](//evil.example/x) [mixed](JaVaScRiPt:alert(1))');
    expect(unsafe).not.toContain('<a ');
    for (const text of ['js', 'data', 'vb', 'proto', 'mixed']) expect(unsafe).toContain(text);
  });

  it('cannot be broken out of the href attribute', () => {
    const out = html('[x](https://example.com/"onmouseover="alert(1))');
    expect(out).not.toMatch(/ onmouseover=/);
    expect(out).toContain('&quot;onmouseover=&quot;');
  });

  it('renders lists, nested lists and ordered lists apart from bulleted ones', () => {
    const out = html('- um\n- dois\n  - dois-a\n  - dois-b\n- três\n\n1. primeiro\n2. segundo');
    expect(out.match(/<ul /g)).toHaveLength(2);
    expect(out.match(/<ol /g)).toHaveLength(1);
    expect(out).toContain('<li>dois<ul');
    expect(out).toContain('<li>dois-a</li><li>dois-b</li>');
    expect(out).toContain('<ol class="list-decimal');
    expect(out).toContain('<li>primeiro</li><li>segundo</li>');
  });

  it('renders quotes, rules, code blocks and tables', () => {
    const out = html('> Rascunho para revisão de advogado. Não é parecer jurídico.\n\n---\n\n```\n<b>não é tag</b>\n```\n\n| a | b |\n|---|---|\n| 1 | `x` \\| y |\n');
    expect(out).toMatch(/<blockquote [^>]*><p [^>]*>Rascunho para revisão de advogado. Não é parecer jurídico.<\/p><\/blockquote>/);
    expect(out).toContain('<hr ');
    expect(out).toContain('<pre ');
    expect(out).toContain('&lt;b&gt;não é tag&lt;/b&gt;');
    expect(out).toMatch(/<th [^>]*>a<\/th><th [^>]*>b<\/th>/);
    expect(out).toMatch(/<td [^>]*>1<\/td><td [^>]*><code [^>]*>x<\/code> \| y<\/td>/);
  });

  it('joins soft line breaks and keeps hard ones', () => {
    expect(html('uma linha\noutra linha')).toContain('uma linha outra linha');
    expect(html('uma linha  \noutra linha')).toContain('uma linha<br />outra linha');
    expect(html('um\r\ndois\r\n\r\ntrês')).toContain('um dois');
  });

  it('reads the front matter apart from the body', () => {
    const doc = mod.parseMarkdownDocument('---\ntitle: "Política de Privacidade"\ndescription: Como os dados são tratados.\n---\n# Texto\n');
    expect(doc.meta).toEqual({ title: 'Política de Privacidade', description: 'Como os dados são tratados.' });
    expect(doc.body).toBe('# Texto\n');
    expect(mod.parseMarkdownDocument('# Sem front matter').meta).toEqual({});
  });
});

describe('legal pages (content/legal/*.md)', () => {
  const termos = {
    slug: 'termos-de-uso',
    source: '',
    markdown:
      '# Termos de Uso\n\n> Rascunho para revisão de advogado. Não é parecer jurídico.\n\nEstes termos descrevem as regras de uso do WorkEasy durante a fase de demonstração.\n\n## 1. Cadastro\n\n- Informe dados verdadeiros.\n- Não compartilhe a sua conta.\n\nVeja também a [política de privacidade](/legal/politica-de-privacidade).\n',
  };
  const politica = {
    slug: 'politica-de-privacidade',
    source: '',
    markdown: '---\ntitle: Política de Privacidade\ndescription: Como o WorkEasy trata os dados pessoais durante a demonstração.\n---\n\nTexto do rascunho da política, escrito para revisão de advogado.\n',
  };

  it('are written as pages of their own, from the title and the first plain paragraph', async () => {
    const { root, dist } = project({ legalDocs: [termos, politica] });
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, legalStatus: 'vigente', ...quiet });
    expect(result.counts.legal).toBe(2);
    const html = read(dist, 'legal', 'termos-de-uso');
    expect(html).toContain('<title>Termos de Uso | WorkEasy</title>');
    // The draft banner is a quote: the description is the first plain paragraph
    expect(html).toContain('<meta name="description" content="Estes termos descrevem as regras de uso do WorkEasy durante a fase de demonstração." />');
    expect(html).toContain('data-prerendered="legal"');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Rascunho para revisão de advogado. Não é parecer jurídico.');
    expect(html).toContain('href="/legal/politica-de-privacidade"');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/legal/termos-de-uso" />`);
    expect(mod.validateHtml(html)).toEqual([]);
    expect(ldBlocks(html)[0]).toMatchObject({ '@type': 'WebPage', name: 'Termos de Uso', url: `${SITE}/legal/termos-de-uso` });

    const policy = read(dist, 'legal', 'politica-de-privacidade');
    expect(policy).toContain('<title>Política de Privacidade | WorkEasy</title>');
    expect(policy).toContain('content="Como o WorkEasy trata os dados pessoais durante a demonstração."');
    // Without a "# " heading the page still has its h1, from the title
    expect(policy).toMatch(/<h1 class="[^"]*">Política de Privacidade<\/h1>/);
  });

  it.each([
    ['unset', ''],
    ['a draft', 'minuta'],
    ['not exactly "vigente"', 'Vigente'],
  ])('are noindex and out of the sitemap while the status is %s', async (_, status) => {
    const { root, dist } = project({ legalDocs: [termos] });
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, legalStatus: status, ...quiet });
    expect(read(dist, 'legal', 'termos-de-uso')).toContain('<meta name="robots" content="noindex,follow" />');
    expect(result.sitemapPaths).not.toContain('/legal/termos-de-uso');
    expect(readFileSync(join(dist, 'sitemap.xml'), 'utf8')).not.toContain('/legal/');
  });

  it('are indexable, and in the sitemap, once the status is "vigente"', async () => {
    const { root, dist } = project({ legalDocs: [termos] });
    const result = await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, legalStatus: 'vigente', ...quiet });
    expect(read(dist, 'legal', 'termos-de-uso')).not.toContain('noindex');
    expect(result.sitemapPaths).toContain('/legal/termos-de-uso');
  });

  it('skip notes and files with a name that is not a path', () => {
    const root = tmp();
    mkdirSync(join(root, 'content', 'legal'), { recursive: true });
    for (const name of ['termos-de-uso.md', 'README.md', '_notas.md', 'Termos Antigos.md', 'lista.txt']) writeFileSync(join(root, 'content', 'legal', name), '# x\n');
    const warn = vi.fn();
    expect(mod.loadLegalDocs(root, warn).map(doc => doc.slug)).toEqual(['termos-de-uso']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Termos Antigos.md'));
    expect(mod.loadLegalDocs(tmp(), warn)).toEqual([]);
  });

  it('go through the same claim checks, and nothing is written when one fails', async () => {
    const claim = { ...termos, markdown: `${termos.markdown}\nO pagamento seguro depende da sua conta.\n` };
    const { root, dist } = project({ legalDocs: [claim] });
    await expect(mod.prerender({ root, distDir: dist, siteUrl: SITE, ...quiet })).rejects.toThrow(/\/legal\/termos-de-uso texto proibido/);
    expect(readdirSync(dist)).toEqual(['index.html']);
  });

  it('keep a page that says "não verificado" and refuse one that says "verificado"', async () => {
    const ok = project({ legalDocs: [{ ...termos, markdown: `${termos.markdown}\nO perfil é informado pelo profissional, não verificado.\n` }] });
    await expect(mod.prerender({ root: ok.root, distDir: ok.dist, siteUrl: SITE, buildDate: DATE, ...quiet })).resolves.toBeDefined();
    const bad = project({ legalDocs: [{ ...termos, markdown: `${termos.markdown}\nTodo profissional é verificado.\n` }] });
    await expect(mod.prerender({ root: bad.root, distDir: bad.dist, siteUrl: SITE, ...quiet })).rejects.toThrow(/verified/);
  });

  it('escape what the document says', async () => {
    const hostile = { ...termos, markdown: `${termos.markdown}\n<script>alert(1)</script> [x](javascript:alert(1))\n` };
    const { root, dist } = project({ legalDocs: [hostile] });
    await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    const html = read(dist, 'legal', 'termos-de-uso');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mod.validateHtml(html)).toEqual([]);
  });
});

describe('script chunks of the routes', () => {
  const makeDist = (files: Record<string, string>): string => {
    const dist = tmp();
    mkdirSync(join(dist, 'assets'));
    for (const [name, source] of Object.entries(files)) writeFileSync(join(dist, 'assets', name), source);
    return dist;
  };
  const shell =
    '<html><head><script type="module" crossorigin src="/assets/index-AAA.js"></script><link rel="modulepreload" crossorigin href="/assets/icon-base-BBB.js"><link rel="stylesheet" href="/assets/index-CCC.css"></head><body><div id="root"></div></body></html>';
  const chunks = {
    'index-AAA.js': 'import{a}from"./icon-base-BBB.js";import"./never-read-ZZZ.js";export{a as b};',
    'icon-base-BBB.js': 'export const a=1;',
    'OccupationPage-DDD.js': 'import{b as e}from"./index-AAA.js";import{t as c}from"./catalog-EEE.js";import"./camera-FFF.js";const lazy=()=>import("./policies-GGG.js");export{lazy};',
    'catalog-EEE.js': 'import{x}from"./util-HHH.js";import{a}from"./icon-base-BBB.js";export{x,a};',
    'camera-FFF.js': 'import{a}from"./icon-base-BBB.js";export default a;',
    'util-HHH.js': 'export const x=2;',
    'policies-GGG.js': 'export default {};',
    'AreaPage-III.js': 'import{t as c}from"./catalog-EEE.js";export{c};',
    'Categories-JJJ.js': 'export default 1;',
    'OccupationNeighborhoodPage-KKK.js': 'import"./util-HHH.js";',
    'index-AAA.css': '',
  };

  it('are the page chunk and what it imports, minus what the template already loads', () => {
    const preloads = mod.chunkPreloads(makeDist(chunks), shell);
    expect(preloads.servico).toEqual(['/assets/OccupationPage-DDD.js', '/assets/catalog-EEE.js', '/assets/util-HHH.js', '/assets/camera-FFF.js']);
    expect(preloads.area).toEqual(['/assets/AreaPage-III.js', '/assets/catalog-EEE.js', '/assets/util-HHH.js']);
    expect(preloads.categorias).toEqual(['/assets/Categories-JJJ.js']);
    expect(preloads.bairro).toEqual(['/assets/OccupationNeighborhoodPage-KKK.js', '/assets/util-HHH.js']);
  });

  it('leave out lazy imports, the entry and the preloads of the template', () => {
    const all = Object.values(mod.chunkPreloads(makeDist(chunks), shell)).flat();
    expect(all).not.toContain('/assets/policies-GGG.js');
    expect(all).not.toContain('/assets/index-AAA.js');
    expect(all).not.toContain('/assets/icon-base-BBB.js');
    expect(all).not.toContain('/assets/never-read-ZZZ.js');
  });

  it('are none for a dist/ without assets, and none for a route without a chunk', () => {
    expect(mod.chunkPreloads(tmp(), shell)).toEqual({});
    expect(mod.chunkPreloads(makeDist({ 'index-AAA.js': '' }), shell)).toEqual({});
  });

  it('are written into the pages of their kind by a run', async () => {
    const { root, dist } = project();
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), TEMPLATE.replace('</head>', '<script type="module" crossorigin src="/assets/index-AAA.js"></script></head>'));
    for (const [name, source] of Object.entries(chunks)) writeFileSync(join(dist, 'assets', name), source);
    await mod.prerender({ root, distDir: dist, siteUrl: SITE, buildDate: DATE, ...quiet });
    const occupation = read(dist, 'servicos', 'pintor');
    expect(occupation).toContain('<link rel="modulepreload" crossorigin href="/assets/OccupationPage-DDD.js" />');
    expect(occupation).toContain('href="/assets/catalog-EEE.js"');
    expect(occupation).not.toContain('AreaPage');
    expect(read(dist, 'categorias')).toContain('href="/assets/Categories-JJJ.js"');
    expect(read(dist, 'categorias', 'reformas')).toContain('href="/assets/AreaPage-III.js"');
    expect(read(dist, 'servicos', 'pintor', 'moema')).toContain('href="/assets/OccupationNeighborhoodPage-KKK.js"');
    // The home is the shell: it preloads nothing of its own
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).not.toContain('OccupationPage');
  });
});
