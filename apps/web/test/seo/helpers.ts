// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach } from 'vitest';

// Shared by the test files of scripts/prerender.mjs: typings of its exports,
// a small catalog, and temporary project folders.

export interface Occupation {
  slug: string;
  name: string;
  synonyms?: string[];
}
export interface Area {
  slug: string;
  name: string;
  description: string;
  occupations: Occupation[];
}
export type Policy = Record<string, unknown>;
export interface Neighborhood {
  name: string;
  slug: string;
  zone: string;
}
export interface StaticEntry {
  path: string;
  title: string;
  description: string;
  h1: string;
  paragraphs: string[];
  links?: Array<{ to: string; label: string }>;
}
export interface LegalDoc {
  slug: string;
  source: string;
  markdown: string;
}
export interface Inputs {
  areas: Area[];
  policies: Record<string, Policy>;
  neighborhoods: Neighborhood[] | null;
  staticPages?: StaticEntry[];
  legalDocs?: LegalDoc[];
}
export interface Page {
  kind: string;
  /** False for pages kept out of search results (neighborhood pages without local data, thin occupation pages, legal drafts). */
  indexable?: boolean;
  thin?: boolean;
  path: string;
  title: string;
  description: string;
  jsonLd: Record<string, unknown>;
  extraLd?: Array<Record<string, unknown>>;
  body: string;
  owner?: string;
  masks?: string[];
  shared?: string[];
  source?: string;
}
export interface PrerenderResult {
  pages: Page[];
  counts: Record<string, number>;
  sitemapPaths: string[];
  thin: string[];
}
export interface PrerenderModule {
  LAUNCH_AREA_SLUGS: string[];
  LAUNCH_ZONES: string[];
  NOTICE: string;
  RULE_NOTE: string;
  THEME_COLOR: string;
  OG_IMAGE_PATH: string;
  MIN_OWN_SENTENCES: number;
  MIN_SENTENCE_WORDS: number;
  FORBIDDEN_CLAIMS: Array<[string, RegExp]>;
  PRICE_UNIT_TEXT: Record<string, string>;
  LOCATION_TEXT: Record<string, string>;
  VERIFICATION_TEXT: Record<string, string>;
  PROVIDER_KIND_TEXT: Record<string, unknown>;
  BILLING_TEXT: Record<string, unknown>;
  loadInputs: (root: string, warn?: (message: string) => void) => Inputs;
  buildPages: (
    input: Inputs & { localPairs?: string[]; legalStatus?: string; siteUrl?: string; canRequest?: boolean; warn?: (message: string) => void },
  ) => Page[];
  renderPage: (template: string, page: Page, siteUrl?: string, options?: { preload?: string[] }) => string;
  renderHome: (template: string, siteUrl?: string) => string;
  stripHome: (html: string) => string;
  homeJsonLd: (siteUrl: string, description?: string) => Array<Record<string, unknown>>;
  markdownToHtml: (markdown: string) => string;
  parseMarkdownDocument: (markdown: string) => { meta: Record<string, string>; body: string };
  loadStaticPages: (root: string) => StaticEntry[];
  loadLegalDocs: (root: string, warn?: (message: string) => void) => LegalDoc[];
  pageSentences: (page: Page) => string[];
  buildSentenceIndex: (pages: Page[]) => Map<string, Set<string>>;
  ownSentences: (page: Page, index?: Map<string, Set<string>>) => string[];
  guardThinPages: (pages: Page[], options?: { minOwn?: number }) => string[];
  chunkPreloads: (distDir: string, template: string) => Record<string, string[]>;
  contentDate: (root: string, files: string[], options?: { git?: (root: string, files: string[]) => string }) => string | undefined;
  makeLastmod: (options: {
    root: string;
    buildDate?: string;
    pages: Page[];
    today?: string;
    git?: (root: string, files: string[]) => string;
  }) => (path: string) => string;
  validatePage: (page: Page, siteUrl?: string) => string[];
  validateHtml: (html: string) => string[];
  findProhibitedText: (page: Page) => string[];
  buildSitemap: (paths: string[], siteUrl: string, date: string | ((path: string) => string)) => string;
  buildSitemapFiles: (
    paths: string[],
    siteUrl: string,
    date: string | ((path: string) => string),
    limit?: number,
  ) => Array<{ name: string; xml: string }>;
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
    legalStatus?: string;
    concurrency?: number;
    log?: (message: string) => void;
    warn?: (message: string) => void;
  }) => Promise<PrerenderResult>;
}

export const ROOT = process.cwd();
export const SCRIPT = join(ROOT, 'scripts', 'prerender.mjs');
export const SITE = 'https://workeasy.example';
export const DATE = '2026-10-22';
// Like dist/index.html: already carries generic tags that a page must replace, not repeat
export const TEMPLATE =
  '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="description" content="Geral" /><meta name="theme-color" content="#667eea" /><meta property="og:title" content="WorkEasy" /><meta property="og:image" content="/og-image.png" /><meta name="twitter:card" content="summary_large_image" /><title>WorkEasy</title></head><body><div id="root"></div></body></html>';

export const quiet = { log: () => {}, warn: () => {} };

/** Fills `root` (an empty temporary folder) with the given inputs and a dist/ holding only the template. */
export const makeProjectIn = (root: string, inputs: Inputs): { root: string; dist: string } => {
  mkdirSync(join(root, 'catalog'));
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'catalog', 'areas.json'), JSON.stringify({ areas: inputs.areas }));
  writeFileSync(join(root, 'catalog', 'policies.json'), JSON.stringify(inputs.policies));
  writeFileSync(join(root, 'data', 'neighborhoods.json'), JSON.stringify(inputs.neighborhoods ?? []));
  if (inputs.staticPages) writeFileSync(join(root, 'data', 'static-pages.json'), JSON.stringify(inputs.staticPages));
  if (inputs.legalDocs) {
    mkdirSync(join(root, 'content', 'legal'), { recursive: true });
    for (const doc of inputs.legalDocs) writeFileSync(join(root, 'content', 'legal', `${doc.slug}.md`), doc.markdown);
  }
  writeFileSync(join(root, 'dist', 'index.html'), TEMPLATE);
  return { root, dist: join(root, 'dist') };
};

export const policy = (overrides: Policy = {}): Policy => ({
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

export const bairros: Neighborhood[] = [
  { name: 'Moema', slug: 'moema', zone: 'Sul' },
  { name: 'Santo Amaro', slug: 'santo-amaro', zone: 'Sul' },
  { name: 'Campo Belo', slug: 'campo-belo', zone: 'Sul' },
  { name: 'Sé', slug: 'se', zone: 'Centro' },
  { name: 'Mooca', slug: 'mooca', zone: 'Leste' },
];

export const smallInputs = (): Inputs => ({
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
    encanador: policy({
      notes:
        'Reparos e instalações hidráulicas em casas e comércios. Rede de gás exige profissional habilitado e tem item próprio. Desentupimento e caça-vazamento também têm item próprio.',
    }),
    pintor: policy({
      priceUnits: ['m2'],
      locations: ['domicilio', 'empresa_cliente'],
      notes:
        'Pintura interna e externa de baixa altura, com massa e acabamento. Fachadas e trabalho em altura têm item próprio, com exigências de segurança. A preparação das paredes é combinada antes do início da obra.',
    }),
    cardiologista: policy({
      notes:
        'Consulta e acompanhamento de doenças do coração, em consultório ou online. Exames e procedimentos têm itens próprios na lista de serviços. O WorkEasy não faz diagnóstico nem indica tratamento.',
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

export const textOf = (html: string): string => html.replace(/<[^>]+>/g, '\n');

/** The parsed JSON-LD blocks of a page, in order. */
export const ldBlocks = (html: string): Array<Record<string, unknown>> =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]) as Record<string, unknown>);


export const loadPrerender = async (): Promise<PrerenderModule> => (await import(pathToFileURL(SCRIPT).href)) as PrerenderModule;

/** Call once at the top of a test file: returns a function that makes a temporary folder, removed after each test. */
export const trackTmpDirs = (): (() => string) => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  return () => {
    const dir = mkdtempSync(join(tmpdir(), 'prerender-'));
    dirs.push(dir);
    return dir;
  };
};
