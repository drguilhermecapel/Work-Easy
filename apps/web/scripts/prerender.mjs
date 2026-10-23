#!/usr/bin/env node
// Pre-renders static pages for search engines after `vite build` (website
// only; the native build never runs this). It reads dist/index.html as the
// template and writes, from catalog/*.json, data/neighborhoods.json and the
// optional content files below:
//
//   dist/categorias/index.html                    all areas
//   dist/categorias/<area>/index.html             one area
//   dist/servicos/<slug>/index.html               one occupation
//   dist/servicos/<slug>/<bairro>/index.html      launch areas x launch zones
//   dist/<path>/index.html                        data/static-pages.json (institutional pages)
//   dist/legal/<doc>/index.html                   content/legal/*.md (noindex unless VITE_LEGAL_STATUS=vigente)
//   dist/index.html                               the home: Organization and WebSite JSON-LD
//   dist/sitemap.xml (a sitemap index plus parts past 50,000 URLs), dist/robots.txt
//
// Each page carries its own <title>, description, canonical URL, Open Graph and
// Twitter tags, schema.org JSON-LD and real HTML inside <div id="root">, which
// the React app replaces when it mounts (createRoot, not hydration). The text
// of the catalog pages comes from catalog/prose.mjs, the same module the four
// React routes render, so the content and the links survive the mount
// (test/seo/hydration-parity.test.tsx). It derives from the occupation policy:
// no prices, ratings or reviews are ever written, and the output is checked
// against the same forbidden claims as test/claims-guard.test.ts before
// anything is written. A page without title, description or canonical fails
// the build; an occupation page without enough text of its own is kept out of
// the index (noindex, not in the sitemap) instead of failing it.
//
// Usage: node scripts/prerender.mjs [--mode <vite mode>] [--dist dist]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BILLING_TEXT,
  CITY,
  LAUNCH_AREA_SLUGS,
  LAUNCH_ZONES,
  LOCATION_TEXT,
  NOTICE,
  PRICE_UNIT_TEXT,
  PROVIDER_KIND_TEXT,
  RULE_NOTE,
  SECTION,
  SITE_NAME,
  SLUG,
  VERIFICATION_TEXT,
  areaIntro,
  areaMeta,
  categoriesLead,
  categoriesMeta,
  groupByZone,
  inZone,
  joinPt,
  launchNeighborhoods,
  neighborhoodIntro,
  neighborhoodMeta,
  occupationLabel,
  occupationMeta,
  occupationSentences,
  policyBadges,
  relatedWindow,
  requestHref,
  rotateNeighbors,
  truncate,
  zoneLabel,
} from '../catalog/prose.mjs';

export {
  BILLING_TEXT,
  CITY,
  LAUNCH_AREA_SLUGS,
  LAUNCH_ZONES,
  LOCATION_TEXT,
  NOTICE,
  PRICE_UNIT_TEXT,
  PROVIDER_KIND_TEXT,
  RULE_NOTE,
  SITE_NAME,
  VERIFICATION_TEXT,
  joinPt,
  occupationSentences,
  requestHref,
};

const SITEMAP_URL_LIMIT = 50000;
const WRITE_CONCURRENCY = 64;
/** Same value as index.html, the web manifest (pwa.config.ts) and test/seo. */
export const THEME_COLOR = '#667eea';
/** Link-preview image in public/ (1200x630). */
export const OG_IMAGE_PATH = '/og-image.png';
/** An occupation page needs this many sentences of its own, each with at least MIN_SENTENCE_WORDS words, to be indexable. */
export const MIN_OWN_SENTENCES = 3;
export const MIN_SENTENCE_WORDS = 6;
/** Paths the app uses for its own screens; a static page may not take them. */
const RESERVED_PATHS = ['/', '/entrar', '/conta', '/pedido', '/pedidos', '/atendimentos', '/dashboard', '/pro', '/admin', '/cuidado', '/orcamento', '/agendar', '/p'];
const HOME_START = '<!--home-seo-->';
const HOME_END = '<!--/home-seo-->';

// Copy of FORBIDDEN_CLAIMS in test/claims-guard.test.ts (the test checks they
// match). Generated pages land in dist/, which that guard does not scan.
export const FORBIDDEN_CLAIMS = [
  ['end-to-end encryption', /ponta.a.ponta|end.to.end/],
  ['digital signature', /assinado digitalmente/],
  ['fake LGPD hash', /lgpd hash/],
  ['audit log promise', /registrado em log de auditoria/],
  ['"verified" badge without "não"', /(?<!nao )verificad[oa]s?\b/],
  ['escrow promise', /liberado apos o servico|pagamento seguro/],
  ['made-up statistic', /\d+x mais chances/],
  ['approval time promise', /em ate \d+ horas/],
  ['instant delivery promise', /imediatamente/],
  ['"free and secure" booking', /gratis e seguro/],
  ['"real patients" reviews', /pacientes reais/],
  ['fake video quality', /720p/],
  ['"CRM ativo" badge', /crm ativo/],
];

// ---------------------------------------------------------------- helpers

const normalizeClaims = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Labels of the forbidden claims found in `text` (one entry per match). */
export const findForbiddenClaims = text => {
  const lines = normalizeClaims(text).split('\n');
  return lines.flatMap(line => FORBIDDEN_CLAIMS.filter(([, re]) => re.test(line)).map(([label]) => `${label}: ${line.trim()}`));
};

export const escapeHtml = value =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const unescapeHtml = value =>
  value.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

const escapeXml = escapeHtml;

/** Absolute site URL without trailing slash, or '' when absent or invalid. */
export const normalizeSiteUrl = (value, warn = () => {}) => {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    warn(`VITE_SITE_URL inválida (${raw}); usando caminhos relativos.`);
    return '';
  }
};

const absolute = (siteUrl, path) => (siteUrl ? `${siteUrl}${path === '/' ? '/' : path}` : path);

const LINK_CLASS = 'text-secondary hover:underline';
const link = (href, text) => `<a href="${escapeHtml(href)}" class="${LINK_CLASS}">${escapeHtml(text)}</a>`;

const list = items =>
  `<ul class="list-disc pl-5 space-y-1 text-sm text-gray-800">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;

const section = (title, inner) =>
  `<section class="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-3"><h2 class="font-bold text-gray-800">${escapeHtml(title)}</h2>${inner}</section>`;

const paragraph = (text, extra = 'text-sm text-gray-700 leading-relaxed') => `<p class="${extra}">${escapeHtml(text)}</p>`;

const paragraphs = sentences => sentences.filter(Boolean).map(s => paragraph(s)).join('');

const breadcrumb = crumbs =>
  `<nav aria-label="Caminho" class="text-sm text-gray-500 flex flex-wrap items-center gap-1">${crumbs
    .map(([href, text], i) =>
      i === crumbs.length - 1 ? `<span class="text-gray-700">${escapeHtml(text)}</span>` : `${link(href, text)} <span aria-hidden="true">›</span>`,
    )
    .join(' ')}</nav>`;

const H1_CLASS = 'text-2xl md:text-3xl font-bold text-gray-800';

const main = (kind, inner, width = 'max-w-4xl') =>
  `<main class="${width} mx-auto px-4 py-8 space-y-6 break-words" data-prerendered="${kind}">${inner}${paragraph(NOTICE, 'text-xs text-gray-500')}</main>`;

// Same markup as the React cards of pages/AreaPage.tsx (lucide ChevronRight inlined).
const CHEVRON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right shrink-0 text-gray-400" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';

const occupationCard = (occupation, policy) =>
  `<li><a href="/servicos/${escapeHtml(occupation.slug)}" class="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 h-full hover:border-primary transition-colors"><span class="min-w-0"><span class="block font-medium text-gray-800">${escapeHtml(occupation.name)}</span>${policyBadges(policy)
    .map(badge => `<span class="inline-block mt-1 mr-1 text-[11px] bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">${escapeHtml(badge)}</span>`)
    .join('')}</span>${CHEVRON}</a></li>`;

// ------------------------------------------------------------ input data

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Reads catalog/areas.json, catalog/policies.json and, when present,
 * data/neighborhoods.json (array, or { neighborhoods: [...] }),
 * data/seo-local.json, data/static-pages.json and content/legal/*.md.
 */
export const loadInputs = (root, warn = console.warn) => {
  const areas = readJson(join(root, 'catalog', 'areas.json')).areas;
  const policies = readJson(join(root, 'catalog', 'policies.json'));
  const neighborhoodsPath = join(root, 'data', 'neighborhoods.json');
  let neighborhoods = null;
  if (existsSync(neighborhoodsPath)) {
    const data = readJson(neighborhoodsPath);
    neighborhoods = Array.isArray(data) ? data : data.neighborhoods ?? [];
  } else {
    warn('[prerender] data/neighborhoods.json não existe: páginas por bairro não foram geradas.');
  }
  // "<ocupacao>/<bairro>" pairs that have real local data (providers or requests there). Only those
  // neighborhood pages are indexable: without local data they are the same text with another name.
  const localPath = join(root, 'data', 'seo-local.json');
  const localPairs = existsSync(localPath) ? readJson(localPath) : [];
  return { areas, policies, neighborhoods, localPairs, staticPages: loadStaticPages(root), legalDocs: loadLegalDocs(root, warn) };
};

/** data/static-pages.json: an array of { path, title, description, h1, paragraphs, links }. Absent file: no pages. */
export const loadStaticPages = root => {
  const file = join(root, 'data', 'static-pages.json');
  if (!existsSync(file)) return [];
  const data = readJson(file);
  if (!Array.isArray(data)) throw new Error('[prerender] data/static-pages.json deve ser uma lista de páginas.');
  return data;
};

/** content/legal/*.md, one document each; README and files that start with "_" are notes, not pages. */
export const loadLegalDocs = (root, warn = console.warn) => {
  const dir = join(root, 'content', 'legal');
  if (!existsSync(dir)) return [];
  const docs = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.md') || /^(readme|_)/i.test(file)) continue;
    const slug = basename(file, '.md');
    if (!SLUG.test(slug)) {
      warn(`[prerender] content/legal/${file}: nome de arquivo fora do padrão (a-z, 0-9 e hífen); documento ignorado.`);
      continue;
    }
    docs.push({ slug, source: `content/legal/${file}`, markdown: readFileSync(join(dir, file), 'utf8') });
  }
  return docs;
};

// ---------------------------------------------------------------- markdown

const SAFE_URL = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#|\.{1,2}\/)/i;
const EXTERNAL_URL = /^https?:\/\//i;

const hrefOf = url => (SAFE_URL.test(url) ? url : null);
const anchor = (url, inner) =>
  `<a href="${escapeHtml(url)}"${EXTERNAL_URL.test(url) ? ' rel="noopener noreferrer"' : ''} class="${LINK_CLASS}">${inner}</a>`;

// Inline constructs, tried in this order when two start at the same place. Nothing else produces a tag.
const INLINE = [
  [/`([^`\n]+)`/, m => `<code class="rounded bg-gray-100 px-1 text-xs">${escapeHtml(m[1])}</code>`],
  [
    /\[([^\]\n]+)\]\(\s*((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"\n]*")?\s*\)/,
    m => {
      const url = hrefOf(m[2]);
      return url ? anchor(url, renderInline(m[1])) : renderInline(m[1]);
    },
  ],
  [/<((?:https?:\/\/|mailto:)[^>\s]+)>/i, m => anchor(m[1], escapeHtml(m[1]))],
  [/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/, m => `<strong>${renderInline(m[1] ?? m[2])}</strong>`],
  [/\*([^*\n]+?)\*|(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/, m => `<em>${renderInline(m[1] ?? m[2])}</em>`],
  [/~~([^~\n]+?)~~/, m => `<del>${renderInline(m[1])}</del>`],
  [/ {2,}\n|\\\n/, () => '<br />'],
];

/** Inline markdown to HTML. Text is escaped; only the constructs above emit tags, and links keep to safe schemes. */
const renderInline = text => {
  let out = '';
  let rest = text;
  while (rest.length > 0) {
    let best = null;
    for (const [re, build] of INLINE) {
      const match = re.exec(rest);
      if (match && (best === null || match.index < best.match.index)) best = { match, build };
    }
    if (best === null) break;
    out += escapeHtml(rest.slice(0, best.match.index).replace(/\n/g, ' ')) + best.build(best.match);
    rest = rest.slice(best.match.index + best.match[0].length);
  }
  return out + escapeHtml(rest.replace(/\n/g, ' '));
};

const MD = {
  fence: /^\s*(```|~~~)/,
  heading: /^(#{1,6})\s+(.+?)\s*#*\s*$/,
  rule: /^\s*([-*_])(?:\s*\1){2,}\s*$/,
  quote: /^\s{0,3}>\s?(.*)$/,
  item: /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/,
  tableRule: /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/,
};

const indentOf = line => /^\s*/.exec(line)[0].replace(/\t/g, '    ').length;

/** Removes the indentation shared by all the non-blank lines. */
const dedent = lines => {
  const widths = lines.filter(line => line.trim() !== '').map(indentOf);
  const strip = widths.length > 0 ? Math.min(...widths) : 0;
  return lines.map(line => line.replace(new RegExp(`^\\s{0,${strip}}`), ''));
};

const splitRow = row =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map(cell => cell.replace(/\\\|/g, '|').trim());

const HEADING_CLASS = {
  1: H1_CLASS,
  2: 'text-lg font-bold text-gray-800 pt-2',
  3: 'font-bold text-gray-800',
  4: 'font-semibold text-gray-800',
  5: 'font-semibold text-gray-800',
  6: 'font-semibold text-gray-800',
};

/** True when `line` opens a block that ends a paragraph. */
const startsBlock = line => MD.fence.test(line) || MD.heading.test(line) || MD.rule.test(line) || MD.quote.test(line) || MD.item.test(line);

/** Block markdown to HTML; `state.h1` is false once the first level-1 heading was written (later ones become h2). */
const renderBlocks = (lines, state) => {
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
    } else if (MD.fence.test(line)) {
      const fence = MD.fence.exec(line)[1];
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
      i++;
      html.push(`<pre class="overflow-x-auto rounded-lg bg-gray-100 p-3 text-xs"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    } else if (MD.heading.test(line)) {
      const [, hashes, text] = MD.heading.exec(line);
      let level = hashes.length;
      if (level === 1 && state.h1) level = 2;
      if (hashes.length === 1) state.h1 = true;
      html.push(`<h${level} class="${HEADING_CLASS[level]}">${renderInline(text)}</h${level}>`);
      i++;
    } else if (MD.rule.test(line)) {
      html.push('<hr class="border-gray-200" />');
      i++;
    } else if (MD.quote.test(line)) {
      const inner = [];
      while (i < lines.length && MD.quote.test(lines[i])) inner.push(MD.quote.exec(lines[i++])[1]);
      html.push(`<blockquote class="border-l-4 border-gray-200 pl-4 space-y-2">${renderBlocks(inner, state)}</blockquote>`);
    } else if (MD.item.test(line)) {
      const base = indentOf(line);
      const ordered = /\d/.test(MD.item.exec(line)[2]);
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        if (current.trim() === '') {
          // A blank line stays inside the list only when the list goes on after it
          const next = lines.slice(i + 1).find(l => l.trim() !== '');
          if (next !== undefined && (indentOf(next) > base || (MD.item.test(next) && indentOf(next) === base))) {
            i++;
            continue;
          }
          break;
        }
        const item = MD.item.exec(current);
        if (item && indentOf(current) === base) {
          if (/\d/.test(item[2]) !== ordered) break;
          items.push({ text: item[3], children: [] });
        } else if (indentOf(current) > base && items.length > 0) {
          items[items.length - 1].children.push(current);
        } else {
          break;
        }
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      const style = ordered ? 'list-decimal' : 'list-disc';
      html.push(
        `<${tag} class="${style} pl-5 space-y-1 text-sm text-gray-800">${items
          .map(item => {
            // Indented lines before the first nested marker continue the item's text; the rest is a nested list
            const firstNested = item.children.findIndex(child => MD.item.test(child));
            const continuation = firstNested === -1 ? item.children : item.children.slice(0, firstNested);
            const nested = firstNested === -1 ? [] : dedent(item.children.slice(firstNested));
            return `<li>${renderInline([item.text, ...continuation.map(c => c.trim())].join('\n'))}${nested.length > 0 ? renderBlocks(nested, state) : ''}</li>`;
          })
          .join('')}</${tag}>`,
      );
    } else if (line.includes('|') && i + 1 < lines.length && MD.tableRule.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      const cell = (tag, text) => `<${tag} class="border border-gray-200 px-3 py-2 text-left align-top">${renderInline(text)}</${tag}>`;
      html.push(
        `<div class="overflow-x-auto"><table class="w-full border-collapse text-sm text-gray-700"><thead><tr>${head.map(c => cell('th', c)).join('')}</tr></thead><tbody>${rows
          .map(row => `<tr>${head.map((_, col) => cell('td', row[col] ?? '')).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
    } else {
      const text = [];
      while (i < lines.length && lines[i].trim() !== '' && (text.length === 0 || !startsBlock(lines[i]))) text.push(lines[i++]);
      html.push(`<p class="text-sm text-gray-700 leading-relaxed">${renderInline(text.join('\n').trim())}</p>`);
    }
  }
  return html.join('');
};

/**
 * Markdown to HTML without a dependency, for the legal pages. Supports
 * headings, paragraphs, lists (nested), quotes, tables, code, rules, links,
 * bold, italic and strike-through. Raw HTML in the source is escaped, and a
 * link whose scheme is not http(s), mailto, tel, a path or an anchor is
 * written as plain text. The first "# " heading becomes the only h1.
 */
export const markdownToHtml = markdown => renderBlocks(markdown.replace(/\r\n?/g, '\n').split('\n'), { h1: false });

/** { meta: { title, description }, body } from a markdown document with optional "key: value" front matter. */
export const parseMarkdownDocument = markdown => {
  let text = markdown.replace(/\r\n?/g, '\n');
  const meta = {};
  const front = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (front) {
    for (const line of front[1].split('\n')) {
      const pair = /^([A-Za-z_-]+):\s*(.*)$/.exec(line.trim());
      if (pair) meta[pair[1].toLowerCase()] = pair[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    }
    text = text.slice(front[0].length);
  }
  return { meta, body: text };
};

const stripMarkdown = text =>
  text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~>#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// ----------------------------------------------------------- page building

const requireName = (value, what) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`[prerender] ${what} sem nome: a página ficaria sem título.`);
};

const PATH = /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** Checks one entry of data/static-pages.json; throws a message that says which one. */
const checkStaticEntry = (entry, index) => {
  const where = `data/static-pages.json[${index}]`;
  const fail = reason => {
    throw new Error(`[prerender] ${where}${typeof entry?.path === 'string' ? ` (${entry.path})` : ''}: ${reason}`);
  };
  if (!entry || typeof entry !== 'object') fail('entrada inválida');
  for (const key of ['title', 'description', 'h1']) if (typeof entry[key] !== 'string' || entry[key].trim() === '') fail(`"${key}" ausente`);
  if (typeof entry.path !== 'string' || !PATH.test(entry.path)) fail('"path" deve ser um caminho em minúsculas, como /como-funciona');
  if (RESERVED_PATHS.some(reserved => reserved !== '/' && (entry.path === reserved || entry.path.startsWith(`${reserved}/`)))) fail('"path" é uma tela do app');
  if (entry.path.startsWith('/servicos/') || entry.path.startsWith('/categorias/')) fail('"path" invade as páginas do catálogo');
  if (!Array.isArray(entry.paragraphs) || entry.paragraphs.length === 0 || entry.paragraphs.some(p => typeof p !== 'string' || p.trim() === '')) {
    fail('"paragraphs" deve ter ao menos um texto');
  }
  for (const item of entry.links ?? []) {
    if (!item || typeof item.label !== 'string' || item.label.trim() === '') fail('link sem "label"');
    if (typeof item.to !== 'string' || !item.to.startsWith('/') || item.to.startsWith('//') || /\s/.test(item.to)) fail(`link "${item.label}": "to" deve ser um caminho interno`);
  }
};

const titleWithSite = title => (title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`);

/**
 * Builds every page (without writing). Returns
 * Array<{ kind, path, title, description, jsonLd, extraLd?, body, indexable?, owner, masks }>.
 * `canRequest` says whether /pedido works in this build (backend or concierge
 * number); without it the main button leads to the search instead.
 */
export const buildPages = ({
  areas,
  policies,
  neighborhoods,
  localPairs = [],
  staticPages = [],
  legalDocs = [],
  legalStatus = '',
  siteUrl = '',
  canRequest = true,
  warn = console.warn,
}) => {
  const pages = [];
  const withLocalData = new Set(localPairs);
  const usableAreas = areas.filter(area => {
    requireName(area.name, `área ${area.slug}`);
    if (SLUG.test(area.slug)) return true;
    warn(`[prerender] área com slug inválido ignorada: ${area.slug}`);
    return false;
  });

  const bairros = launchNeighborhoods(neighborhoods);

  // Occupations that get a page: URL-safe slug and a policy to write from.
  const withPolicy = new Map();
  const nameCount = new Map();
  for (const area of usableAreas) {
    for (const occupation of area.occupations) {
      requireName(occupation.name, `ocupação ${occupation.slug}`);
      if (!SLUG.test(occupation.slug)) {
        warn(`[prerender] ocupação com slug inválido ignorada: ${occupation.slug}`);
      } else if (!policies[occupation.slug]) {
        warn(`[prerender] ${occupation.slug} sem política em catalog/policies.json: página não gerada.`);
      } else {
        withPolicy.set(occupation.slug, { occupation, area, policy: policies[occupation.slug] });
        const key = normalizeClaims(occupation.name);
        nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
      }
    }
  }
  /** Titles must be unique: two occupations with the same name get their area appended. */
  const labelOf = (occupation, area) => occupationLabel(occupation.name, area.name, nameCount.get(normalizeClaims(occupation.name)) > 1);
  const pagedByArea = new Map(usableAreas.map(area => [area.slug, area.occupations.filter(o => withPolicy.has(o.slug))]));
  const pagedOccupations = area => pagedByArea.get(area.slug) ?? [];

  const serviceLd = ({ name, description, path, category, alternateName, areaServed, extra = {} }) => ({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    serviceType: name,
    description,
    ...(category ? { category } : {}),
    ...(alternateName?.length ? { alternateName } : {}),
    ...(siteUrl ? { url: absolute(siteUrl, path) } : {}),
    ...(areaServed ? { areaServed } : {}),
    broker: { '@type': 'Organization', name: SITE_NAME, ...(siteUrl ? { url: `${siteUrl}/` } : {}) },
    ...extra,
  });

  /** crumbs: Array<[path, name]>, the same trail as the visible breadcrumb. */
  const breadcrumbLd = crumbs => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([path, name], index) => ({ '@type': 'ListItem', position: index + 1, name, item: absolute(siteUrl, path) })),
  });

  const cta = (occupation, bairro) => {
    const request = canRequest
      ? link(requestHref(occupation.slug, bairro?.slug), 'Pedir este serviço')
      : link(`/search?q=${encodeURIComponent(occupation.name)}`, 'Procurar profissionais');
    return `<div class="flex flex-wrap gap-3 text-sm font-semibold">${request} ${link(
      `/register-provider?ocupacao=${encodeURIComponent(occupation.slug)}`,
      'Ofereço este serviço',
    )}</div>`;
  };

  const policySections = (s, { hiring, requirements }) =>
    section(hiring, paragraphs(s.hiring)) +
    section(
      requirements,
      `${paragraph(RULE_NOTE, 'text-xs text-gray-500')}${
        s.steps.length > 0 ? `${paragraph(s.stepsLead)}${list(s.steps.map(escapeHtml))}` : ''
      }${paragraphs(s.requirements)}`,
    ) +
    section(SECTION.regulation, paragraphs(s.regulation));

  // /categorias
  const indexAreas = usableAreas.filter(a => pagedOccupations(a).length > 0);
  const indexMeta = categoriesMeta(indexAreas.map(a => a.name));
  pages.push({
    kind: 'categorias',
    owner: 'categorias',
    masks: [],
    path: '/categorias',
    title: indexMeta.title,
    description: indexMeta.description,
    jsonLd: serviceLd({
      name: 'Categorias de serviços',
      description: indexMeta.description,
      path: '/categorias',
      extra: {
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Categorias de serviços',
          itemListElement: indexAreas.map(area => ({
            '@type': 'Service',
            name: area.name,
            ...(siteUrl ? { url: absolute(siteUrl, `/categorias/${area.slug}`) } : {}),
          })),
        },
      },
    }),
    body: main(
      'categorias',
      `<header><h1 class="${H1_CLASS}">Todas as categorias</h1>${paragraphs([categoriesLead(indexAreas.length)])}</header>${list(
        indexAreas.map(
          area =>
            `${link(`/categorias/${area.slug}`, area.name)}: ${escapeHtml(area.description)} (${pagedOccupations(area).length} ${
              pagedOccupations(area).length === 1 ? 'serviço' : 'serviços'
            })`,
        ),
      )}`,
      'max-w-7xl',
    ),
  });

  // /categorias/<area>
  for (const area of indexAreas) {
    const occupations = pagedOccupations(area);
    const regulated = occupations.filter(o => withPolicy.get(o.slug).policy.regulated);
    const isLaunch = LAUNCH_AREA_SLUGS.includes(area.slug) && bairros.length > 0;
    const path = `/categorias/${area.slug}`;
    const meta = areaMeta(area, occupations.map(o => o.name));
    const sorted = [...occupations].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    pages.push({
      kind: 'area',
      owner: `area:${area.slug}`,
      masks: [area.name],
      path,
      title: meta.title,
      description: meta.description,
      jsonLd: serviceLd({
        name: area.name,
        description: meta.description,
        path,
        extra: {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: area.name,
            itemListElement: occupations.map(o => ({
              '@type': 'Service',
              name: o.name,
              ...(siteUrl ? { url: absolute(siteUrl, `/servicos/${o.slug}`) } : {}),
            })),
          },
        },
      }),
      extraLd: [
        breadcrumbLd([
          ['/categorias', 'Categorias'],
          [path, area.name],
        ]),
      ],
      body: main(
        'area',
        `${breadcrumb([
          ['/categorias', 'Categorias'],
          [path, area.name],
        ])}<header><h1 class="${H1_CLASS}">${escapeHtml(area.name)}</h1>${paragraphs(
          areaIntro({ area, count: occupations.length, regulated: regulated.length, launch: isLaunch }),
        )}</header><div><h2 class="font-bold text-gray-800 mb-3">${escapeHtml(SECTION.areaServices)}</h2><ul class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${sorted
          .map(o => occupationCard(o, withPolicy.get(o.slug).policy))
          .join('')}</ul></div>`,
        'max-w-7xl',
      ),
    });
  }

  // /servicos/<slug> and /servicos/<slug>/<bairro>
  for (const area of indexAreas) {
    const areaOccupations = pagedOccupations(area);
    for (const [areaIndex, occupation] of areaOccupations.entries()) {
      const { policy } = withPolicy.get(occupation.slug);
      const name = occupation.name;
      const label = labelOf(occupation, area);
      const s = occupationSentences(occupation, area, policy);
      const related = relatedWindow(areaOccupations, areaIndex);
      const relatedSection =
        related.length > 0
          ? section(SECTION.related(area.name), list(related.map(o => link(`/servicos/${o.slug}`, o.name))))
          : '';
      const areaBairros = LAUNCH_AREA_SLUGS.includes(area.slug) ? bairros : [];
      const path = `/servicos/${occupation.slug}`;
      const meta = occupationMeta({ label, name, units: s.units, places: s.places });
      const bairroLinks =
        areaBairros.length > 0
          ? section(
              SECTION.byNeighborhood(name),
              groupByZone(areaBairros)
                .map(
                  group =>
                    `<h3 class="text-sm font-semibold text-gray-700">${escapeHtml(group.label)}</h3>${list(
                      group.items.map(n => link(`${path}/${n.slug}`, `${name} em ${n.name}`)),
                    )}`,
                )
                .join(''),
            )
          : '';
      const owner = `occupation:${occupation.slug}`;
      const crumbs = [
        ['/categorias', 'Categorias'],
        [`/categorias/${area.slug}`, area.name],
        [path, name],
      ];

      pages.push({
        kind: 'servico',
        owner,
        masks: [label, name, area.name],
        shared: [area.description],
        path,
        title: meta.title,
        description: meta.description,
        jsonLd: serviceLd({ name: label, description: meta.description, path, category: area.name, alternateName: occupation.synonyms }),
        extraLd: [breadcrumbLd(crumbs)],
        body: main(
          'servico',
          `${breadcrumb(crumbs)}<header><h1 class="${H1_CLASS}">${escapeHtml(name)}</h1>${paragraphs(s.intro)}</header>${cta(occupation)}${policySections(s, {
            hiring: SECTION.hiring,
            requirements: SECTION.requirements,
          })}${bairroLinks}${relatedSection}`,
        ),
      });

      for (const n of areaBairros) {
        const city = n.city || CITY;
        const bairroPath = `${path}/${n.slug}`;
        const neighbors = rotateNeighbors(
          areaBairros.filter(b => b.zone === n.zone),
          n.slug,
        );
        const bairroMeta = neighborhoodMeta({ label, bairro: n.name, zone: n.zone, city, units: s.units, places: s.places });
        const bairroCrumbs = [...crumbs, [bairroPath, n.name]];
        pages.push({
          kind: 'bairro',
          owner,
          masks: [label, name, area.name, n.name, zoneLabel(n.zone), city],
          indexable: withLocalData.has(`${occupation.slug}/${n.slug}`),
          path: bairroPath,
          title: bairroMeta.title,
          description: bairroMeta.description,
          jsonLd: serviceLd({
            name: `${label} em ${n.name}`,
            description: bairroMeta.description,
            path: bairroPath,
            category: area.name,
            alternateName: occupation.synonyms,
            areaServed: { '@type': 'Place', name: `${n.name}, ${city}`, containedInPlace: { '@type': 'City', name: city } },
            extra: { serviceType: name },
          }),
          extraLd: [breadcrumbLd(bairroCrumbs)],
          body: main(
            'bairro',
            `${breadcrumb(bairroCrumbs)}<header><h1 class="${H1_CLASS}">${escapeHtml(`${name} em ${n.name}`)}</h1>${paragraph(
              `${zoneLabel(n.zone)}, ${city}`,
              'text-sm text-gray-500',
            )}${paragraphs(neighborhoodIntro({ name, policy, bairro: n.name, zone: n.zone, city }))}</header>${cta(occupation, n)}${policySections(s, {
              hiring: SECTION.hiringIn(n.name),
              requirements: SECTION.requirementsLocal,
            })}${
              neighbors.length > 0
                ? section(SECTION.otherNeighborhoods(name), list(neighbors.map(b => link(`${path}/${b.slug}`, `${name} em ${b.name}`))))
                : ''
            }${section(
              SECTION.seeAlso,
              list([link(path, `${name}: como contratar`), link(`/categorias/${area.slug}`, `Todos os serviços de ${area.name}`)]),
            )}`,
          ),
        });
      }
    }
  }

  // data/static-pages.json
  staticPages.forEach((entry, index) => {
    checkStaticEntry(entry, index);
    const links = entry.links ?? [];
    pages.push({
      kind: 'estatica',
      owner: `static:${entry.path}`,
      masks: [],
      path: entry.path,
      title: titleWithSite(entry.title.trim()),
      description: truncate(entry.description.trim()),
      jsonLd: webPageLd({ name: entry.h1.trim(), description: truncate(entry.description.trim()), path: entry.path, siteUrl }),
      body: main(
        'estatica',
        `<header><h1 class="${H1_CLASS}">${escapeHtml(entry.h1.trim())}</h1>${paragraphs(entry.paragraphs.map(p => p.trim()))}</header>${
          links.length > 0 ? section(SECTION.seeAlso, list(links.map(item => link(item.to, item.label.trim())))) : ''
        }`,
      ),
    });
  });

  // content/legal/*.md: drafts stay out of the index until the owner declares the documents in force
  for (const doc of legalDocs) {
    const { meta, body } = parseMarkdownDocument(doc.markdown);
    const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(body)?.[1];
    const title = stripMarkdown(meta.title || heading || doc.slug.replace(/-/g, ' '));
    // The first plain paragraph: not a heading, quote (the draft banner), list or table
    const firstParagraph = body
      .split(/\n\s*\n/)
      .filter(block => !/^\s*(?:#|>|\||[-*+]\s|\d+[.)]\s|```|~~~)/.test(block))
      .map(block => stripMarkdown(block))
      .find(block => block.length > 40);
    const description = truncate(meta.description || firstParagraph || `${title}. Documento legal do ${SITE_NAME}.`);
    const html = markdownToHtml(body);
    const path = `/legal/${doc.slug}`;
    pages.push({
      kind: 'legal',
      owner: `legal:${doc.slug}`,
      masks: [],
      source: doc.source,
      indexable: legalStatus === 'vigente',
      path,
      title: titleWithSite(title),
      description,
      jsonLd: webPageLd({ name: title, description, path, siteUrl }),
      body: main('legal', `<article class="space-y-4">${/<h1[\s>]/.test(html) ? '' : `<h1 class="${H1_CLASS}">${escapeHtml(title)}</h1>`}${html}</article>`),
    });
  }

  assertUnique(pages, 'path');
  assertUnique(pages, 'title');
  assertUnique(pages, 'description');
  return pages;
};

const webPageLd = ({ name, description, path, siteUrl }) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name,
  description,
  inLanguage: 'pt-BR',
  ...(siteUrl ? { url: absolute(siteUrl, path), isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${siteUrl}/` } } : {}),
});

const assertUnique = (pages, key) => {
  const seen = new Map();
  for (const page of pages) {
    if (seen.has(page[key])) throw new Error(`[prerender] ${key} repetido em ${seen.get(page[key])} e ${page.path}: ${page[key]}`);
    seen.set(page[key], page.path);
  }
};

// ------------------------------------------------- home: Organization, WebSite

/**
 * JSON-LD of the home page: who the site is, nothing else. No contact data,
 * social profiles, address, rating or price exists in the project, so none is
 * written. Needs the site URL: without it there is nothing valid to say.
 */
export const homeJsonLd = (siteUrl, description = '') => {
  if (!siteUrl) return [];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: SITE_NAME,
      url: `${siteUrl}/`,
      logo: absolute(siteUrl, '/icons/icon-512.png'),
      ...(description ? { description } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: SITE_NAME,
      url: `${siteUrl}/`,
      inLanguage: 'pt-BR',
      ...(description ? { description } : {}),
      publisher: { '@id': `${siteUrl}/#organization` },
    },
  ];
};

// ----------------------------------------------------------- content guard

const normalizeSentence = text => normalizeClaims(text).replace(/\s+/g, ' ').trim();

/** Sentences of the paragraphs of `page`, as written (no HTML, no entities). */
export const pageSentences = page =>
  [...page.body.matchAll(/<p [^>]*>([^<]*)<\/p>/g)].flatMap(([, html]) =>
    unescapeHtml(html)
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean),
  );

const BOILERPLATE = new Set([NOTICE, RULE_NOTE].flatMap(text => text.split(/(?<=[.!?])\s+/)).map(normalizeSentence));
const wordCount = sentence => sentence.split(/\s+/).filter(Boolean).length;

/** The sentence with the names of its page and every number replaced, so that "Pintor em Moema" and "Pintor em Mooca" read the same. */
const skeleton = (sentence, masks) => {
  let text = normalizeSentence(sentence);
  const names = masks.map(normalizeSentence).filter(name => name.length >= 3).sort((a, b) => b.length - a.length);
  for (const name of names) text = text.split(name).join('§');
  return text.replace(/\d+/g, '#');
};

/** Skeleton -> the owners (an occupation, an area...) whose pages contain it. */
export const buildSentenceIndex = pages => {
  const index = new Map();
  for (const page of pages) {
    for (const sentence of pageSentences(page)) {
      const key = skeleton(sentence, page.masks ?? []);
      const owners = index.get(key) ?? new Set();
      owners.add(page.owner ?? page.path);
      index.set(key, owners);
    }
  }
  return index;
};

/**
 * The sentences that make a page its own: distinct, with at least
 * MIN_SENTENCE_WORDS words, not the notice every page carries, and found in
 * no other owner's pages once names and numbers are masked. A sentence the
 * template writes for every occupation with the same policy is not the page's.
 */
export const ownSentences = (page, index = buildSentenceIndex([page])) => {
  const seen = new Set();
  const own = [];
  // Text that other pages repeat by design (the description of the area an occupation belongs to)
  const shared = new Set((page.shared ?? []).flatMap(text => text.split(/(?<=[.!?])\s+/)).map(normalizeSentence));
  for (const sentence of pageSentences(page)) {
    const normalized = normalizeSentence(sentence);
    if (BOILERPLATE.has(normalized) || shared.has(normalized) || wordCount(sentence) < MIN_SENTENCE_WORDS) continue;
    const key = skeleton(sentence, page.masks ?? []);
    if (seen.has(key) || (index.get(key)?.size ?? 0) !== 1) continue;
    seen.add(key);
    own.push(sentence);
  }
  return own;
};

/**
 * Keeps occupation pages with fewer than `minOwn` own sentences out of the
 * index (noindex, no sitemap entry): a page that only swaps a name into the
 * template says nothing a crawler has not read already. Neighborhood pages
 * have their own rule (noindex unless the pair is in data/seo-local.json).
 * Returns the paths it changed.
 */
export const guardThinPages = (pages, { minOwn = MIN_OWN_SENTENCES } = {}) => {
  // Neighborhood pages share their owner with the occupation page, so they cannot make one of its sentences less its own
  const index = buildSentenceIndex(pages.filter(page => page.kind !== 'bairro'));
  const thin = [];
  for (const page of pages) {
    if (page.kind !== 'servico') continue;
    page.ownSentences = ownSentences(page, index).length;
    if (page.ownSentences < minOwn) {
      page.indexable = false;
      page.thin = true;
      thin.push(page.path);
    }
  }
  return thin;
};

// ----------------------------------------------------------- validation

// Structured data may never carry what the platform does not have.
const FORBIDDEN_LD_KEYS = /^(aggregateRating|review|reviews|rating|ratingValue|reviewCount|ratingCount|offers|price|priceRange|priceCurrency|lowPrice|highPrice)$/;
const LD_TYPES = ['Service', 'WebPage'];
// Prices and ratings written in the text.
const INVENTED_DATA = [
  ['price in reais', /r\$\s*\d/],
  ['price in the text', /\b\d+(?:[.,]\d+)?\s*reais\b/],
  ['rating score', /\b\d(?:[.,]\d)?\s*(?:\/\s*5(?!\d)|estrelas?)\b|★/],
  ['review count', /\b\d+\s*(?:avaliac(?:ao|oes)|reviews?)\b/],
];

export const hasForbiddenKey = value =>
  Array.isArray(value)
    ? value.some(hasForbiddenKey)
    : value !== null && typeof value === 'object'
      ? Object.entries(value).some(([key, inner]) => FORBIDDEN_LD_KEYS.test(key) || hasForbiddenKey(inner))
      : false;

const ldBlocks = page => [page.jsonLd, ...(page.extraLd ?? [])];

/** Problems of a page before it is rendered; an empty list means it can be written. */
export const validatePage = (page, siteUrl = '') => {
  const problems = [];
  const text = value => typeof value === 'string' && value.trim() !== '';
  if (!text(page.title)) problems.push('sem título');
  if (!text(page.description)) problems.push('sem descrição');
  if (typeof page.path !== 'string' || !page.path.startsWith('/') || !text(absolute(siteUrl, page.path))) problems.push('sem canonical');
  if (!/<h1[\s>]/.test(page.body ?? '')) problems.push('sem h1');
  if (!LD_TYPES.includes(page.jsonLd?.['@type'])) problems.push('JSON-LD não é do tipo Service nem WebPage');
  if (ldBlocks(page).some(hasForbiddenKey)) problems.push('JSON-LD com preço, nota ou avaliação');
  return problems;
};

const pageText = page => `${page.title}\n${page.description}\n${JSON.stringify(ldBlocks(page))}\n${page.body.replace(/<[^>]+>/g, '\n')}`;

/** Forbidden claims and invented prices or ratings in the text of a page. */
export const findProhibitedText = page => {
  const text = pageText(page);
  const normalized = normalizeClaims(text);
  return [
    ...findForbiddenClaims(text),
    ...INVENTED_DATA.filter(([, re]) => re.test(normalized)).map(([label]) => `${label}`),
  ];
};

/** Problems of the final HTML: the head tags a crawler reads must be there and filled. */
export const validateHtml = html => {
  const problems = [];
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '';
  if (title.trim() === '') problems.push('<title> vazio');
  if (!/<meta name="description" content="[^"]+"/.test(html)) problems.push('<meta name="description"> vazio');
  if (!/<link rel="canonical" href="[^"]+"/.test(html)) problems.push('<link rel="canonical"> vazio');
  if (!/<html[^>]*\blang="pt-BR"/.test(html)) problems.push('<html lang="pt-BR"> ausente');
  if (!/<meta name="theme-color" content="[^"]+"/.test(html)) problems.push('<meta name="theme-color"> ausente');
  for (const property of ['og:title', 'og:description', 'og:image']) {
    if (!new RegExp(`<meta property="${property}" content="[^"]+"`).test(html)) problems.push(`<meta property="${property}"> ausente`);
  }
  if (!/<meta name="twitter:card" content="summary_large_image"/.test(html)) problems.push('<meta name="twitter:card"> ausente');
  if (!/<div id="root"><main [\s\S]*<h1[\s>]/.test(html)) problems.push('sem conteúdo em <div id="root">');
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (ld.length < 1) problems.push('JSON-LD ausente');
  for (const [, block] of ld) {
    try {
      JSON.parse(block);
    } catch {
      problems.push('JSON-LD inválido');
    }
  }
  return problems;
};

// ------------------------------------------------------------ rendering

const jsonForScript = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const ldScript = block => `<script type="application/ld+json">${jsonForScript(block)}</script>`;

// Head tags are found by their key, wherever the template put them, dropped and written again at the end of
// <head> in a fixed order: a page never ends up with two og:title, and the result does not depend on whether the
// template was already touched (a second run over the same dist/ reads the home that the first one wrote).
const tagRe = (tag, attr, key) => new RegExp(`[ \\t]*<${tag}\\b[^>]*\\b${attr}="${key}"[^>]*>[ \\t]*\\n?`, 'gi');
const addToHead = (html, fragment) => html.replace(/[ \t]*<\/head>/, () => `    ${fragment}\n  </head>`);
const putTag = (html, re, tag) => addToHead(html.replace(re, ''), tag);
const upsertMeta = (html, attr, key, content) => putTag(html, tagRe('meta', attr, key), `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`);
const ensureMeta = (html, attr, key, content) => (tagRe('meta', attr, key).test(html) ? html : upsertMeta(html, attr, key, content));
const upsertLink = (html, rel, href) => putTag(html, tagRe('link', 'rel', rel), `<link rel="${rel}" href="${escapeHtml(href)}" />`);

const withLang = html => (/<html[^>]*\blang=/.test(html) ? html : html.replace(/<html\b/, '<html lang="pt-BR"'));

/** The Open Graph and Twitter tags shared by every page; `url` is left out when the site URL is unknown. */
const shareTags = (html, { title, description, url, image }) => {
  let out = html;
  out = upsertMeta(out, 'property', 'og:type', 'website');
  out = upsertMeta(out, 'property', 'og:site_name', SITE_NAME);
  out = upsertMeta(out, 'property', 'og:locale', 'pt_BR');
  out = upsertMeta(out, 'property', 'og:title', title);
  out = upsertMeta(out, 'property', 'og:description', description);
  if (url) out = upsertMeta(out, 'property', 'og:url', url);
  out = upsertMeta(out, 'property', 'og:image', image);
  out = ensureMeta(out, 'property', 'og:image:width', '1200');
  out = ensureMeta(out, 'property', 'og:image:height', '630');
  out = ensureMeta(out, 'property', 'og:image:alt', SITE_NAME);
  out = upsertMeta(out, 'name', 'twitter:card', 'summary_large_image');
  out = upsertMeta(out, 'name', 'twitter:title', title);
  out = upsertMeta(out, 'name', 'twitter:description', description);
  out = upsertMeta(out, 'name', 'twitter:image', image);
  return out;
};

/**
 * Fills the dist/index.html template with one page. Throws when the page has
 * no title, description or canonical. `preload` lists script chunks the page
 * will need as soon as React mounts (see chunkPreloads).
 */
export const renderPage = (template, page, siteUrl = '', { preload = [] } = {}) => {
  const rootRe = /<div id="root">\s*<\/div>/;
  if (!rootRe.test(template)) throw new Error('[prerender] o molde não tem <div id="root"></div>');
  const invalid = validatePage(page, siteUrl);
  if (invalid.length > 0) throw new Error(`[prerender] ${page.path}: ${invalid.join('; ')}`);
  const canonical = absolute(siteUrl, page.path);

  // Function replacements keep "$" sequences of the text literal.
  let html = withLang(template);
  html = /<title>[\s\S]*?<\/title>/.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(page.title)}</title>`)
    : addToHead(html, `<title>${escapeHtml(page.title)}</title>`);
  html = upsertMeta(html, 'name', 'description', page.description);
  html = ensureMeta(html, 'name', 'theme-color', THEME_COLOR);
  html = upsertLink(html, 'canonical', canonical);
  if (page.indexable === false) html = upsertMeta(html, 'name', 'robots', 'noindex,follow');
  html = shareTags(html, { title: page.title, description: page.description, url: siteUrl ? canonical : '', image: absolute(siteUrl, OG_IMAGE_PATH) });
  const extra = [
    ...preload.map(href => `<link rel="modulepreload" crossorigin href="${escapeHtml(href)}" />`),
    ...ldBlocks(page).map(ldScript),
  ];
  html = addToHead(html, extra.join('\n    '));
  return html.replace(rootRe, () => `<div id="root">${page.body}</div>`);
};

/** The shell without the block renderHome added to it (so that a second run starts from the template). */
export const stripHome = html => html.replace(new RegExp(`[ \\t]*${HOME_START}[\\s\\S]*?${HOME_END}[ \\t]*\\n?`), '');

/**
 * The home is dist/index.html itself, which is also what the host serves for
 * every route the app owns, so it gets no canonical and no og:url (they would
 * point those routes at the home). It gets the absolute link-preview image and
 * the Organization and WebSite JSON-LD.
 */
export const renderHome = (template, siteUrl = '') => {
  if (!siteUrl) return template;
  let html = stripHome(template);
  html = upsertMeta(html, 'property', 'og:image', absolute(siteUrl, OG_IMAGE_PATH));
  html = upsertMeta(html, 'name', 'twitter:image', absolute(siteUrl, OG_IMAGE_PATH));
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  const blocks = homeJsonLd(siteUrl, description ? unescapeHtml(description) : '');
  return addToHead(html, `${HOME_START}\n    ${blocks.map(ldScript).join('\n    ')}\n    ${HOME_END}`);
};

// -------------------------------------------------------- script preloads

const PAGE_CHUNKS = { categorias: 'Categories', area: 'AreaPage', servico: 'OccupationPage', bairro: 'OccupationNeighborhoodPage' };

/** Static imports of an ES module chunk: `from"./x.js"` and `import"./x.js"`, never `import("./x.js")`. */
const staticImports = source => [...source.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)].map(m => m[1]);

/**
 * Per page kind, the script chunks the route needs once React mounts: the
 * page chunk and everything it imports statically, minus what the template
 * already loads. Without them the browser learns about the ~30 small chunks of
 * a route one round trip at a time, after the page chunk arrives.
 * Returns { [kind]: Array<"/assets/..."> }; empty when dist/assets is absent.
 */
export const chunkPreloads = (distDir, template) => {
  const assets = join(distDir, 'assets');
  if (!existsSync(assets)) return {};
  const files = readdirSync(assets).filter(file => file.endsWith('.js'));
  const known = new Set([...template.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map(m => m[1]));
  const closure = start => {
    const seen = new Set();
    const visit = file => {
      if (seen.has(file) || known.has(file) || !files.includes(file)) return;
      seen.add(file);
      for (const next of staticImports(readFileSync(join(assets, file), 'utf8'))) visit(next);
    };
    visit(start);
    return [...seen];
  };
  const out = {};
  for (const [kind, prefix] of Object.entries(PAGE_CHUNKS)) {
    const chunk = files.find(file => file.startsWith(`${prefix}-`));
    if (chunk) out[kind] = closure(chunk).map(file => `/assets/${file}`);
  }
  return out;
};

// ---------------------------------------------------------------- sitemap

const sitemapEntries = (paths, siteUrl, lastmod) =>
  paths.map(
    path => `  <url><loc>${escapeXml(absolute(siteUrl, path))}</loc><lastmod>${typeof lastmod === 'function' ? lastmod(path) : lastmod}</lastmod></url>`,
  );

/** `date` is YYYY-MM-DD for every entry, or a function from path to date. */
export const buildSitemap = (paths, siteUrl, date) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapEntries(paths, siteUrl, date),
    '</urlset>',
    '',
  ].join('\n');

/**
 * Files of the sitemap: just sitemap.xml up to `limit` URLs; beyond that,
 * sitemap.xml becomes an index of sitemap-1.xml, sitemap-2.xml...
 * Returns Array<{ name, xml }>.
 */
export const buildSitemapFiles = (paths, siteUrl, date, limit = SITEMAP_URL_LIMIT) => {
  if (paths.length <= limit) return [{ name: 'sitemap.xml', xml: buildSitemap(paths, siteUrl, date) }];
  const parts = [];
  for (let i = 0; i < paths.length; i += limit) parts.push(paths.slice(i, i + limit));
  const names = parts.map((_, i) => `sitemap-${i + 1}.xml`);
  const newest = part => part.map(path => (typeof date === 'function' ? date(path) : date)).sort().at(-1);
  const index = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...names.map((name, i) => `  <sitemap><loc>${escapeXml(absolute(siteUrl, `/${name}`))}</loc><lastmod>${newest(parts[i])}</lastmod></sitemap>`),
    '</sitemapindex>',
    '',
  ].join('\n');
  return [{ name: 'sitemap.xml', xml: index }, ...parts.map((part, i) => ({ name: names[i], xml: buildSitemap(part, siteUrl, date) }))];
};

/** robots.txt from the copy in public/, plus the Sitemap line when the site URL is known. */
export const buildRobots = (base, siteUrl) => {
  const lines = (base || 'User-agent: *\nAllow: /\n')
    .split('\n')
    .filter(line => !/^sitemap:/i.test(line.trim()));
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (siteUrl) lines.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const gitDate = (root, files) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

/**
 * YYYY-MM-DD of the last change to any of `files` (relative to `root`): the
 * date of the last commit that touched them, else the newest modification
 * time, else undefined when none of them exists. `git` can be replaced in tests.
 */
export const contentDate = (root, files, { git = gitDate } = {}) => {
  const existing = files.filter(file => existsSync(join(root, file)));
  if (existing.length === 0) return undefined;
  const committed = git(root, existing);
  if (DAY.test(committed)) return committed;
  return new Date(Math.max(...existing.map(file => statSync(join(root, file)).mtimeMs))).toISOString().slice(0, 10);
};

/**
 * Function from a URL path to its sitemap lastmod. With `buildDate` every URL
 * gets that date. Without it, a URL gets the date its content last changed
 * (the data files it is written from, plus this script and the prose module),
 * not the day of the build: a lastmod that moves on every build tells a crawler nothing.
 */
export const makeLastmod = ({ root, buildDate, pages, today = new Date().toISOString().slice(0, 10), git }) => {
  if (buildDate) return () => buildDate;
  const shared = ['scripts/prerender.mjs', 'catalog/prose.mjs', 'index.html'];
  const catalog = contentDate(root, ['catalog/areas.json', 'catalog/policies.json', 'data/neighborhoods.json', 'data/seo-local.json', ...shared], { git }) ?? today;
  const institutional = contentDate(root, ['data/static-pages.json', ...shared], { git }) ?? today;
  const byPath = new Map(pages.map(page => [page.path, page.kind === 'legal' ? contentDate(root, [page.source, ...shared], { git }) ?? today : page.kind === 'estatica' ? institutional : catalog]));
  return path => byPath.get(path) ?? catalog;
};

/** Runs `fn` over `items` with at most `limit` in flight; stops taking new items after the first failure. */
export const mapLimit = async (items, limit, fn) => {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
};

/**
 * Generates every page into `distDir`. Returns { pages, counts, sitemapPaths, thin }.
 * `buildDate` (YYYY-MM-DD) forces the lastmod of every sitemap entry; without
 * it each entry gets the date of its last content change. `legalStatus` is the
 * value of VITE_LEGAL_STATUS: legal pages are indexable only when it is
 * "vigente". Nothing is written until every page has passed the checks on its content.
 */
export const prerender = async ({
  root,
  distDir = join(root, 'dist'),
  siteUrl = '',
  buildDate,
  canRequest = true,
  legalStatus = '',
  concurrency = WRITE_CONCURRENCY,
  log = console.log,
  warn = console.warn,
}) => {
  const templatePath = join(distDir, 'index.html');
  if (!existsSync(templatePath)) throw new Error(`[prerender] ${templatePath} não existe: rode "vite build" antes.`);
  const template = stripHome(readFileSync(templatePath, 'utf8'));
  if (!siteUrl) warn('[prerender] VITE_SITE_URL vazia: canonical com caminho relativo, sem sitemap.xml, sem JSON-LD da home e sem a linha Sitemap no robots.txt.');

  const inputs = loadInputs(root, warn);
  const pages = buildPages({ ...inputs, legalStatus, siteUrl, canRequest, warn });

  const problems = pages.flatMap(page => [
    ...validatePage(page, siteUrl).map(problem => `${page.path} ${problem}`),
    ...findProhibitedText(page).map(found => `${page.path} texto proibido (${found})`),
  ]);
  if (problems.length > 0) throw new Error(`[prerender] páginas reprovadas:\n${problems.slice(0, 50).join('\n')}${problems.length > 50 ? `\n... e mais ${problems.length - 50}` : ''}`);

  const thin = guardThinPages(pages);
  if (thin.length > 0) {
    warn(
      `[prerender] ${thin.length} página(s) de ocupação com menos de ${MIN_OWN_SENTENCES} frases próprias ficaram noindex e fora do sitemap: ${thin.slice(0, 10).join(', ')}${thin.length > 10 ? ', ...' : ''}`,
    );
  }

  const sitemapPaths = ['/', ...pages.filter(p => p.indexable !== false).map(p => p.path)];
  // A sitemap needs absolute URLs: without the site URL it would be invalid, so none is written
  const sitemapFiles = siteUrl ? buildSitemapFiles(sitemapPaths, siteUrl, makeLastmod({ root, buildDate, pages })) : [];
  const preloads = chunkPreloads(distDir, template);

  await mapLimit(pages, concurrency, async page => {
    const html = renderPage(template, page, siteUrl, { preload: preloads[page.kind] });
    const invalid = validateHtml(html);
    if (invalid.length > 0) throw new Error(`[prerender] ${page.path}: ${invalid.join('; ')}`);
    const file = join(distDir, ...page.path.split('/').filter(Boolean), 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
  });
  await writeFile(templatePath, renderHome(template, siteUrl));
  for (const { name, xml } of sitemapFiles) await writeFile(join(distDir, name), xml);
  const robotsPath = join(distDir, 'robots.txt');
  const robotsBase = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : '';
  await writeFile(robotsPath, buildRobots(robotsBase, siteUrl));

  const counts = pages.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {});
  log(
    `[prerender] ${pages.length} páginas (${Object.entries(counts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')}); ${pages.length - (sitemapPaths.length - 1)} sem indexação (noindex); ${siteUrl ? `sitemap com ${sitemapPaths.length} URLs` : 'sem sitemap'}.`,
  );
  return { pages, counts, sitemapPaths, thin };
};

// ------------------------------------------------------------------ CLI

const argValue = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Same rule as config/features.ts: /pedido works with a backend or a valid concierge number. */
export const requestEnabled = env => {
  const digits = (env.VITE_CONCIERGE_WHATSAPP ?? '').replace(/\D/g, '');
  const backend = (env.VITE_SUPABASE_URL ?? '').trim() !== '' && (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim() !== '';
  return backend || (digits.length >= 12 && digits.length <= 15);
};

const runCli = async () => {
  const args = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const mode = argValue(args, '--mode') ?? 'production';
  // Native apps are served from local files with hash URLs: no SEO pages.
  if (mode === 'native') {
    console.log('[prerender] modo native: nenhuma página gerada.');
    return;
  }
  const { loadEnv } = await import('vite');
  const env = loadEnv(mode, root, 'VITE_');
  if (env.VITE_ROUTER === 'hash') {
    console.log('[prerender] VITE_ROUTER=hash (build nativo): nenhuma página gerada.');
    return;
  }
  const distDir = resolve(root, argValue(args, '--dist') ?? 'dist');
  await prerender({
    root,
    distDir,
    siteUrl: normalizeSiteUrl(env.VITE_SITE_URL, console.warn),
    canRequest: requestEnabled(env),
    legalStatus: (env.VITE_LEGAL_STATUS ?? '').trim(),
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
