#!/usr/bin/env node
// Pre-renders static pages for search engines after `vite build` (website
// only; the native build never runs this). It reads dist/index.html as the
// template and writes, from catalog/*.json and data/neighborhoods.json:
//
//   dist/categorias/index.html                    all areas
//   dist/categorias/<area>/index.html             one area
//   dist/servicos/<slug>/index.html               one occupation
//   dist/servicos/<slug>/<bairro>/index.html      launch areas x launch zones
//   dist/sitemap.xml (a sitemap index plus parts past 50,000 URLs), dist/robots.txt
//
// Each page carries its own <title>, description, canonical URL, Open Graph
// tags, a schema.org JSON-LD block and real HTML inside <div id="root">,
// which the React app replaces when it mounts (createRoot, not hydration).
// The text is derived from the occupation policy only: no prices, ratings or
// reviews are ever written, and the output is checked against the same
// forbidden claims as test/claims-guard.test.ts before anything is written.
// A page without title, description or canonical fails the build.
//
// Usage: node scripts/prerender.mjs [--mode <vite mode>] [--dist dist]

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SITE_NAME = 'WorkEasy';
export const CITY = 'São Paulo';
/** Launch categories that also get one page per neighborhood. */
export const LAUNCH_AREA_SLUGS = ['cuidados', 'limpeza', 'reformas', 'eletricista', 'beleza', 'aulas', 'pets', 'autos'];
/** Zones of data/neighborhoods.json covered at launch. */
export const LAUNCH_ZONES = ['Sul', 'Centro'];
const ZONE_LABELS = { Sul: 'Zona Sul', Norte: 'Zona Norte', Leste: 'Zona Leste', Oeste: 'Zona Oeste', Centro: 'Centro' };
const SITEMAP_URL_LIMIT = 50000;
const DESCRIPTION_MAX = 160;
const RELATED_LIMIT = 8;
const WRITE_CONCURRENCY = 64;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Prose forms of the policy enums. test/seo/prerender.test.ts keeps the keys
// in sync with catalog/labels.ts.
export const PRICE_UNIT_TEXT = {
  hora: 'por hora',
  dia: 'por dia',
  servico: 'por serviço',
  m2: 'por m²',
  sessao: 'por sessão',
  plantao: 'por plantão',
  mes: 'por mês',
  projeto: 'por projeto',
  km: 'por km',
  pacote: 'por pacote',
  pagina: 'por página',
  palavra: 'por palavra',
  aula: 'por aula',
  evento: 'por evento',
  visita: 'por visita',
};

export const LOCATION_TEXT = {
  domicilio: 'na casa do cliente',
  online: 'online',
  estabelecimento: 'no local do profissional',
  empresa_cliente: 'na empresa do cliente',
  externo: 'em local externo combinado com o cliente',
};

export const VERIFICATION_TEXT = {
  documento_selfie: 'documento com foto e selfie',
  cadastro_fiscal: 'CPF ou CNPJ (MEI, Simples ou empresa)',
  registro_profissional: 'registro no conselho ou órgão da profissão',
  antecedentes: 'certidão de antecedentes criminais',
  certificado_curso: 'certificado do curso exigido por norma',
  cnh: 'CNH na categoria adequada',
  licenca_orgao: 'licença, alvará ou autorização do órgão competente',
  seguro_rc: 'seguro de responsabilidade civil',
};

export const PROVIDER_KIND_TEXT = {
  autonomo: name => `Quem oferece ${name} pelo WorkEasy se cadastra como autônomo ou MEI.`,
  autonomo_ou_empresa: name => `Podem oferecer ${name} profissionais autônomos, MEIs ou empresas.`,
  somente_empresa_licenciada: name => `Só empresas licenciadas podem oferecer ${name} pelo WorkEasy.`,
};

export const BILLING_TEXT = {
  comissao_primeiro_servico: name =>
    `Para ${name}, o modelo de cobrança previsto é uma comissão só no primeiro serviço com um cliente novo trazido pelo WorkEasy; a comissão depende de parecer jurídico para ser ligada.`,
  so_assinatura: name =>
    `Não há comissão sobre ${name}, por regra do conselho profissional: o profissional paga apenas a assinatura da ferramenta, se quiser usá-la.`,
  sob_consulta_juridica: name => `O modelo de cobrança para ${name} ainda está em análise jurídica.`,
};

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

const NOTICE =
  'O WorkEasy está em fase inicial: os perfis exibidos no app podem ser de demonstração e o pedido online depende de o serviço estar configurado. O WorkEasy não tabela preços; cada profissional informa o seu.';

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

const escapeXml = escapeHtml;

/** "a", "a e b", "a, b e c" (or "ou" with `word`). */
export const joinPt = (items, word = 'e') => {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}`;
};

const truncate = (text, max = DESCRIPTION_MAX) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
};

const zoneLabel = zone => ZONE_LABELS[zone] ?? zone;
/** "na Zona Sul", "no Centro". */
const inZone = zone => (zone === 'Centro' ? 'no Centro' : `na ${zoneLabel(zone)}`);

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

const link = (href, text) => `<a href="${escapeHtml(href)}" class="text-primary hover:underline">${escapeHtml(text)}</a>`;

const list = items =>
  `<ul class="list-disc pl-5 space-y-1 text-sm text-gray-800">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;

const section = (title, inner) =>
  `<section class="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-3"><h2 class="font-bold text-gray-800">${escapeHtml(title)}</h2>${inner}</section>`;

const paragraphs = sentences =>
  sentences
    .filter(Boolean)
    .map(s => `<p class="text-sm text-gray-700 leading-relaxed">${escapeHtml(s)}</p>`)
    .join('');

const breadcrumb = crumbs =>
  `<nav aria-label="Caminho" class="text-sm text-gray-500 flex flex-wrap items-center gap-1">${crumbs
    .map(([href, text], i) =>
      i === crumbs.length - 1 ? `<span class="text-gray-700">${escapeHtml(text)}</span>` : `${link(href, text)} <span aria-hidden="true">›</span>`,
    )
    .join(' ')}</nav>`;

const main = (kind, inner) =>
  `<main class="max-w-4xl mx-auto px-4 py-8 space-y-6 break-words" data-prerendered="${kind}">${inner}<p class="text-xs text-gray-500">${escapeHtml(NOTICE)}</p></main>`;

// ------------------------------------------------------------ input data

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Reads catalog/areas.json, catalog/policies.json and, when present,
 * data/neighborhoods.json (array, or { neighborhoods: [...] }).
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
  return { areas, policies, neighborhoods, localPairs };
};

// ------------------------------------------------------- page sentences

/** Sentences about one occupation, all derived from its policy. */
export const occupationSentences = (occupation, area, policy) => {
  const name = occupation.name;
  const units = joinPt(policy.priceUnits.map(u => PRICE_UNIT_TEXT[u]).filter(Boolean), 'ou');
  const places = joinPt(policy.locations.map(l => LOCATION_TEXT[l]).filter(Boolean), 'ou');
  const steps = policy.verification.map(v => VERIFICATION_TEXT[v]).filter(Boolean);

  const hiring = [
    units && `Para contratar ${name}, você descreve o que precisa e combina o valor ${units} com o profissional.`,
    places && `O atendimento de ${name} acontece ${places}.`,
    PROVIDER_KIND_TEXT[policy.providerType]?.(name),
    policy.laborLock &&
      `Por ser trabalho doméstico, a regra do WorkEasy é limitar ${name} a 2 dias por semana na mesma casa; acima disso, a lei trata a relação como emprego doméstico (LC 150/2015) e a contratação passa a ser direta pela família.`,
  ].filter(Boolean);

  const requirements = [
    steps.length > 0 && `Quem quiser oferecer ${name} no WorkEasy terá de apresentar no cadastro: ${joinPt(steps)}.`,
    policy.audienceMinors && `Como ${name} atende crianças ou adolescentes, a certidão de antecedentes criminais é obrigatória.`,
    policy.backgroundCheck &&
      !policy.audienceMinors &&
      !policy.verification.includes('antecedentes') &&
      `O cadastro para ${name} inclui consulta de antecedentes criminais.`,
    BILLING_TEXT[policy.billing]?.(name),
    !policy.ratingRanking &&
      (policy.regulated
        ? `Os profissionais de ${name} não são ordenados por nota, por regra do conselho profissional.`
        : `Os profissionais de ${name} não são ordenados por nota.`),
  ].filter(Boolean);

  const registry = policy.registryName || policy.regulatorBody;
  const body = policy.regulatorBody && policy.regulatorBody !== policy.registryName ? ` (${policy.regulatorBody})` : '';
  const regulation = [
    policy.regulated
      ? `${name} é profissão regulamentada: o profissional precisa de registro no ${registry}${body}${policy.legalBasis ? `, com base em ${policy.legalBasis}` : ''}.`
      : `${name} não exige registro em conselho profissional${policy.legalBasis ? `; a norma de referência é ${policy.legalBasis}` : ''}.`,
    policy.verification.includes('licenca_orgao') &&
      !policy.regulated &&
      `Mesmo sem conselho, ${name} depende de licença, alvará ou autorização do órgão competente.`,
    policy.confidence === 'a_confirmar' && `A base legal de ${name} ainda está a confirmar com advogado.`,
  ].filter(Boolean);

  const intro = [
    area && `${name} faz parte da área ${area.name} do WorkEasy. ${area.description}`,
    occupation.synonyms?.length > 0 && `Também procurado como ${joinPt(occupation.synonyms)}.`,
  ].filter(Boolean);

  return { intro, hiring, requirements, regulation, units, places };
};

/** Sentence on where the service happens, from the neighborhood's point of view. */
const neighborhoodPlaceSentence = (name, policy, bairro) => {
  const clauses = [
    policy.locations.includes('domicilio') && 'o profissional vai até o seu endereço no bairro',
    policy.locations.includes('empresa_cliente') && 'o atendimento pode ser na sua empresa',
    policy.locations.includes('estabelecimento') && `quando é no local do profissional, combine com ele a distância até ${bairro}`,
    policy.locations.includes('externo') && 'o local externo é combinado com o profissional',
    policy.locations.includes('online') && 'no atendimento online, o bairro não limita a escolha',
  ].filter(Boolean);
  return clauses.length > 0 ? `${name} em ${bairro}: ${clauses.join('; ')}.` : '';
};

// ---------------------------------------------------------------- pages

/** Where the "Pedir este serviço" button goes; the neighborhood is optional. */
export const requestHref = (occupationSlug, neighborhoodSlug) =>
  `/pedido?servico=${encodeURIComponent(occupationSlug)}${neighborhoodSlug ? `&bairro=${encodeURIComponent(neighborhoodSlug)}` : ''}`;

const requireName = (value, what) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`[prerender] ${what} sem nome: a página ficaria sem título.`);
};

/** The occupations of `list` that follow `slug`, wrapping around, so that every page gets different related links. */
const relatedWindow = (list, index) => {
  const out = [];
  for (let step = 1; step < list.length && out.length < RELATED_LIMIT; step++) out.push(list[(index + step) % list.length]);
  return out;
};

/**
 * Builds every page (without writing). Returns
 * Array<{ kind, path, title, description, jsonLd, body }>.
 * `canRequest` says whether /pedido works in this build (backend or concierge
 * number); without it the main button leads to the search instead.
 */
export const buildPages = ({ areas, policies, neighborhoods, localPairs = [], siteUrl = '', canRequest = true, warn = console.warn }) => {
  const pages = [];
  const withLocalData = new Set(localPairs);
  const usableAreas = areas.filter(area => {
    requireName(area.name, `área ${area.slug}`);
    if (SLUG.test(area.slug)) return true;
    warn(`[prerender] área com slug inválido ignorada: ${area.slug}`);
    return false;
  });

  const launchNeighborhoods = (neighborhoods ?? [])
    .filter(n => LAUNCH_ZONES.includes(n.zone) && SLUG.test(n.slug ?? ''))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

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
  const labelOf = (occupation, area) => (nameCount.get(normalizeClaims(occupation.name)) > 1 ? `${occupation.name} (${area.name})` : occupation.name);
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

  const cta = (occupation, bairro) => {
    const request = canRequest
      ? link(requestHref(occupation.slug, bairro?.slug), 'Pedir este serviço')
      : link(`/search?q=${encodeURIComponent(occupation.name)}`, 'Procurar profissionais');
    return `<p class="flex flex-wrap gap-3 text-sm font-semibold">${request} ${link(
      `/register-provider?ocupacao=${encodeURIComponent(occupation.slug)}`,
      'Ofereço este serviço',
    )}</p>`;
  };

  // /categorias
  const indexAreas = usableAreas.filter(a => pagedOccupations(a).length > 0);
  const indexDescription = truncate(
    `${indexAreas.length === 1 ? 'A área' : `As ${indexAreas.length} áreas`} de serviços do WorkEasy, como ${joinPt(indexAreas.slice(0, 3).map(a => a.name))}. Veja como cada profissão é contratada.`,
  );
  pages.push({
    kind: 'categorias',
    path: '/categorias',
    title: `Categorias de serviços | ${SITE_NAME}`,
    description: indexDescription,
    jsonLd: serviceLd({
      name: 'Categorias de serviços',
      description: indexDescription,
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
      `<header><h1 class="text-2xl md:text-3xl font-bold text-gray-800">Categorias de serviços</h1>${paragraphs([
        `O WorkEasy reúne ${indexAreas.length} ${indexAreas.length === 1 ? 'área' : 'áreas'} de serviços. Em cada uma, a página da profissão explica como se contrata, como o preço é combinado e o que será exigido de quem presta o serviço.`,
      ])}</header>${list(
        indexAreas.map(
          area =>
            `${link(`/categorias/${area.slug}`, area.name)}: ${escapeHtml(area.description)} (${pagedOccupations(area).length} ${
              pagedOccupations(area).length === 1 ? 'serviço' : 'serviços'
            })`,
        ),
      )}`,
    ),
  });

  // /categorias/<area>
  for (const area of indexAreas) {
    const occupations = pagedOccupations(area);
    const regulated = occupations.filter(o => withPolicy.get(o.slug).policy.regulated);
    const isLaunch = LAUNCH_AREA_SLUGS.includes(area.slug) && launchNeighborhoods.length > 0;
    const path = `/categorias/${area.slug}`;
    const description = truncate(
      `${area.description} Veja ${occupations.length === 1 ? 'o serviço' : `os ${occupations.length} serviços`} de ${area.name} no WorkEasy: ${joinPt(
        occupations.slice(0, 3).map(o => o.name),
      )}.`,
    );
    const summary = o => {
      const p = withPolicy.get(o.slug).policy;
      const units = joinPt(p.priceUnits.map(u => PRICE_UNIT_TEXT[u]).filter(Boolean), 'ou');
      return `${link(`/servicos/${o.slug}`, o.name)}${units ? `: preço combinado ${escapeHtml(units)}` : ''}${
        p.regulated ? `; exige registro no ${escapeHtml(p.registryName || p.regulatorBody)}` : ''
      }`;
    };
    pages.push({
      kind: 'area',
      path,
      title: `${area.name}: profissionais e serviços | ${SITE_NAME}`,
      description,
      jsonLd: serviceLd({
        name: area.name,
        description,
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
      body: main(
        'area',
        `${breadcrumb([
          ['/categorias', 'Categorias'],
          [path, area.name],
        ])}<header><h1 class="text-2xl md:text-3xl font-bold text-gray-800">${escapeHtml(area.name)}</h1>${paragraphs([
          area.description,
          `${area.name} tem ${occupations.length} ${occupations.length === 1 ? 'serviço' : 'serviços'} no WorkEasy${
            regulated.length > 0
              ? `; ${regulated.length === 1 ? 'um é profissão regulamentada' : `${regulated.length} são profissões regulamentadas`}, com registro exigido no cadastro`
              : ', nenhum deles com registro em conselho profissional'
          }.`,
          isLaunch && `Esta é uma das áreas de lançamento em ${CITY}, com páginas por bairro ${joinPt(LAUNCH_ZONES.map(inZone))}.`,
        ])}</header>${section('Serviços desta área', list(occupations.map(summary)))}<p class="text-sm">${link('/categorias', 'Ver todas as categorias')}</p>`,
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
          ? section(`Outros serviços de ${area.name}`, list(related.map(o => link(`/servicos/${o.slug}`, o.name))))
          : '';
      const bairros = LAUNCH_AREA_SLUGS.includes(area.slug) ? launchNeighborhoods : [];
      const path = `/servicos/${occupation.slug}`;
      const description = truncate(
        `${label}${s.units ? `: preço combinado ${s.units}` : ''}${s.places ? `, atendimento ${s.places}` : ''}. Veja o que o WorkEasy exige de quem oferece ${name}.`,
      );
      const bairroLinks =
        bairros.length > 0
          ? section(
              `${name} por bairro`,
              LAUNCH_ZONES.map(zone => {
                const zoneBairros = bairros.filter(n => n.zone === zone);
                if (zoneBairros.length === 0) return '';
                return `<h3 class="text-sm font-semibold text-gray-700">${escapeHtml(zoneLabel(zone))}</h3>${list(
                  zoneBairros.map(n => link(`${path}/${n.slug}`, `${name} em ${n.name}`)),
                )}`;
              }).join(''),
            )
          : '';
      const policySections =
        section('Como se contrata', paragraphs(s.hiring)) +
        section('O que será exigido do profissional', paragraphs(s.requirements)) +
        section('Profissão regulamentada?', paragraphs(s.regulation));

      pages.push({
        kind: 'servico',
        path,
        title: `${label}: como contratar | ${SITE_NAME}`,
        description,
        jsonLd: serviceLd({ name: label, description, path, category: area.name, alternateName: occupation.synonyms }),
        body: main(
          'servico',
          `${breadcrumb([
            ['/categorias', 'Categorias'],
            [`/categorias/${area.slug}`, area.name],
            [path, name],
          ])}<header><h1 class="text-2xl md:text-3xl font-bold text-gray-800">${escapeHtml(name)}</h1>${paragraphs(s.intro)}</header>${cta(occupation)}${policySections}${bairroLinks}${relatedSection}`,
        ),
      });

      for (const [index, n] of bairros.entries()) {
        const zone = zoneLabel(n.zone);
        const city = n.city || CITY;
        const bairroPath = `${path}/${n.slug}`;
        const sameZone = bairros.filter(b => b.zone === n.zone && b.slug !== n.slug);
        // Rotate so that each page links to different neighbors.
        const start = sameZone.length > 0 ? index % sameZone.length : 0;
        const neighbors = [...sameZone.slice(start), ...sameZone.slice(0, start)].slice(0, RELATED_LIMIT);
        const bairroDescription = truncate(
          `${label} em ${n.name} (${zone}, ${city})${s.places ? `: atendimento ${s.places}` : ''}${s.units ? `, preço combinado ${s.units}` : ''} e o que se exige do profissional.`,
        );
        const intro = [
          `Procura ${name} em ${n.name}, ${inZone(n.zone)} de ${city}? Esta página resume como o serviço é contratado pelo WorkEasy e o que será exigido de quem atende o bairro.`,
          neighborhoodPlaceSentence(name, policy, n.name),
          `Os profissionais de ${name} aparecem na busca do app quando há cadastros aprovados que atendem ${n.name}; nesta fase, a lista pode estar vazia.`,
        ];
        pages.push({
          kind: 'bairro',
          indexable: withLocalData.has(`${occupation.slug}/${n.slug}`),
          path: bairroPath,
          title: `${label} em ${n.name}, ${city} | ${SITE_NAME}`,
          description: bairroDescription,
          jsonLd: serviceLd({
            name: `${label} em ${n.name}`,
            description: bairroDescription,
            path: bairroPath,
            category: area.name,
            alternateName: occupation.synonyms,
            areaServed: { '@type': 'Place', name: `${n.name}, ${city}`, containedInPlace: { '@type': 'City', name: city } },
            extra: { serviceType: name },
          }),
          body: main(
            'bairro',
            `${breadcrumb([
              ['/categorias', 'Categorias'],
              [`/categorias/${area.slug}`, area.name],
              [path, name],
              [bairroPath, n.name],
            ])}<header><h1 class="text-2xl md:text-3xl font-bold text-gray-800">${escapeHtml(`${name} em ${n.name}`)}</h1>${paragraphs(intro)}</header>${cta(occupation, n)}${policySections}${
              neighbors.length > 0
                ? section(`${name} em outros bairros da ${zone === 'Centro' ? 'região central' : zone}`, list(neighbors.map(b => link(`${path}/${b.slug}`, `${name} em ${b.name}`))))
                : ''
            }${section(
              'Veja também',
              list([link(path, `${name}: como contratar`), link(`/categorias/${area.slug}`, `Todos os serviços de ${area.name}`)]),
            )}`,
          ),
        });
      }
    }
  }

  assertUnique(pages, 'path');
  assertUnique(pages, 'title');
  assertUnique(pages, 'description');
  return pages;
};

const assertUnique = (pages, key) => {
  const seen = new Map();
  for (const page of pages) {
    if (seen.has(page[key])) throw new Error(`[prerender] ${key} repetido em ${seen.get(page[key])} e ${page.path}: ${page[key]}`);
    seen.set(page[key], page.path);
  }
};

// ----------------------------------------------------------- validation

// Structured data may never carry what the platform does not have.
const FORBIDDEN_LD_KEYS = /^(aggregateRating|review|reviews|rating|ratingValue|reviewCount|ratingCount|offers|price|priceRange|priceCurrency|lowPrice|highPrice)$/;
// Prices and ratings written in the text.
const INVENTED_DATA = [
  ['price in reais', /r\$\s*\d/],
  ['price in the text', /\b\d+(?:[.,]\d+)?\s*reais\b/],
  ['rating score', /\b\d(?:[.,]\d)?\s*(?:\/\s*5(?!\d)|estrelas?)\b|★/],
  ['review count', /\b\d+\s*(?:avaliac(?:ao|oes)|reviews?)\b/],
];

const hasForbiddenKey = value =>
  Array.isArray(value)
    ? value.some(hasForbiddenKey)
    : value !== null && typeof value === 'object'
      ? Object.entries(value).some(([key, inner]) => FORBIDDEN_LD_KEYS.test(key) || hasForbiddenKey(inner))
      : false;

const sentencesOf = body =>
  [...body.matchAll(/<p [^>]*>([^<]*)<\/p>/g)].flatMap(([, text]) => text.split(/(?<=[.!?])\s+/).filter(sentence => sentence.trim().length > 20));

/** Problems of a page before it is rendered; an empty list means it can be written. */
export const validatePage = (page, siteUrl = '') => {
  const problems = [];
  const text = value => typeof value === 'string' && value.trim() !== '';
  if (!text(page.title)) problems.push('sem título');
  if (!text(page.description)) problems.push('sem descrição');
  if (typeof page.path !== 'string' || !page.path.startsWith('/') || !text(absolute(siteUrl, page.path))) problems.push('sem canonical');
  if (!/<h1[\s>]/.test(page.body ?? '')) problems.push('sem h1');
  if (page.jsonLd?.['@type'] !== 'Service') problems.push('JSON-LD não é do tipo Service');
  if (hasForbiddenKey(page.jsonLd)) problems.push('JSON-LD com preço, nota ou avaliação');
  if ((page.kind === 'servico' || page.kind === 'bairro') && sentencesOf(page.body ?? '').length < 3) problems.push('menos de 3 frases próprias');
  return problems;
};

const pageText = page => `${page.title}\n${page.description}\n${JSON.stringify(page.jsonLd)}\n${page.body.replace(/<[^>]+>/g, '\n')}`;

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
  if (!/<div id="root"><main [\s\S]*<h1[\s>]/.test(html)) problems.push('sem conteúdo em <div id="root">');
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (ld.length !== 1) problems.push('JSON-LD ausente');
  else {
    try {
      JSON.parse(ld[0][1]);
    } catch {
      problems.push('JSON-LD inválido');
    }
  }
  return problems;
};

// ------------------------------------------------------------ rendering

const jsonForScript = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/** Fills the dist/index.html template with one page. Throws when the page has no title, description or canonical. */
export const renderPage = (template, page, siteUrl = '') => {
  const rootRe = /<div id="root">\s*<\/div>/;
  if (!rootRe.test(template)) throw new Error('[prerender] o molde não tem <div id="root"></div>');
  const invalid = validatePage(page, siteUrl);
  if (invalid.length > 0) throw new Error(`[prerender] ${page.path}: ${invalid.join('; ')}`);
  const canonical = absolute(siteUrl, page.path);
  const head = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    ...(page.indexable === false ? [`<meta name="robots" content="noindex,follow" />`] : []),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    ...(siteUrl ? [`<meta property="og:url" content="${escapeHtml(canonical)}" />`] : []),
    `<script type="application/ld+json">${jsonForScript(page.jsonLd)}</script>`,
  ].join('\n    ');

  // Function replacements keep "$" sequences of the text literal.
  let html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(page.title)}</title>`);
  const description = `<meta name="description" content="${escapeHtml(page.description)}" />`;
  html = /<meta name="description"[^>]*>/.test(html)
    ? html.replace(/<meta name="description"[^>]*>/, () => description)
    : html.replace('</head>', () => `  ${description}\n  </head>`);
  html = html.replace('</head>', () => `  ${head}\n  </head>`);
  return html.replace(rootRe, () => `<div id="root">${page.body}</div>`);
};

const sitemapEntries = (paths, siteUrl, date) =>
  paths.map(path => `  <url><loc>${escapeXml(absolute(siteUrl, path))}</loc><lastmod>${date}</lastmod></url>`);

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
  const index = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...names.map(name => `  <sitemap><loc>${escapeXml(absolute(siteUrl, `/${name}`))}</loc><lastmod>${date}</lastmod></sitemap>`),
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
 * Generates every page into `distDir`. Returns { pages, counts, sitemapPaths }.
 * `buildDate` is YYYY-MM-DD (lastmod of every sitemap entry). Nothing is
 * written until every page has passed the checks on its content.
 */
export const prerender = async ({
  root,
  distDir = join(root, 'dist'),
  siteUrl = '',
  buildDate,
  canRequest = true,
  concurrency = WRITE_CONCURRENCY,
  log = console.log,
  warn = console.warn,
}) => {
  const templatePath = join(distDir, 'index.html');
  if (!existsSync(templatePath)) throw new Error(`[prerender] ${templatePath} não existe: rode "vite build" antes.`);
  const template = readFileSync(templatePath, 'utf8');
  const date = buildDate ?? new Date().toISOString().slice(0, 10);
  if (!siteUrl) warn('[prerender] VITE_SITE_URL vazia: canonical com caminho relativo, sem sitemap.xml e sem a linha Sitemap no robots.txt.');

  const inputs = loadInputs(root, warn);
  const pages = buildPages({ ...inputs, siteUrl, canRequest, warn });

  const problems = pages.flatMap(page => [
    ...validatePage(page, siteUrl).map(problem => `${page.path} ${problem}`),
    ...findProhibitedText(page).map(found => `${page.path} texto proibido (${found})`),
  ]);
  if (problems.length > 0) throw new Error(`[prerender] páginas reprovadas:\n${problems.slice(0, 50).join('\n')}${problems.length > 50 ? `\n... e mais ${problems.length - 50}` : ''}`);

  const sitemapPaths = ['/', ...pages.filter(p => p.indexable !== false).map(p => p.path)];
  // A sitemap needs absolute URLs: without the site URL it would be invalid, so none is written
  const sitemapFiles = siteUrl ? buildSitemapFiles(sitemapPaths, siteUrl, date) : [];

  await mapLimit(pages, concurrency, async page => {
    const html = renderPage(template, page, siteUrl);
    const invalid = validateHtml(html);
    if (invalid.length > 0) throw new Error(`[prerender] ${page.path}: ${invalid.join('; ')}`);
    const file = join(distDir, ...page.path.split('/').filter(Boolean), 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
  });
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
  return { pages, counts, sitemapPaths };
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
  await prerender({ root, distDir, siteUrl: normalizeSiteUrl(env.VITE_SITE_URL, console.warn), canRequest: requestEnabled(env) });
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
