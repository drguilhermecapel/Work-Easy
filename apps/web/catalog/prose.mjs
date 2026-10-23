// Prose of the SEO pages (area, occupation, occupation x neighborhood), written
// once and used twice: scripts/prerender.mjs turns it into the static HTML that
// crawlers read, and pages/AreaPage|OccupationPage|OccupationNeighborhoodPage|
// Categories.tsx render the same sentences and links after React mounts, so the
// content does not disappear when the app takes over #root.
//
// Plain ESM (.mjs) because the prerender step runs under bare Node, without a
// TypeScript toolchain; prose.d.mts gives the app its types. Everything here
// derives from the occupation policy: no prices, ratings or reviews exist in
// this file, and test/seo checks the output against the forbidden claims.

export const SITE_NAME = 'WorkEasy';
export const CITY = 'São Paulo';
/** Launch categories that also get one page per neighborhood. */
export const LAUNCH_AREA_SLUGS = ['cuidados', 'limpeza', 'reformas', 'eletricista', 'beleza', 'aulas', 'pets', 'autos'];
/** Zones of data/neighborhoods.json covered at launch. */
export const LAUNCH_ZONES = ['Sul', 'Centro'];
export const ZONE_LABELS = { Sul: 'Zona Sul', Norte: 'Zona Norte', Leste: 'Zona Leste', Oeste: 'Zona Oeste', Centro: 'Centro' };
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const DESCRIPTION_MAX = 160;
export const RELATED_LIMIT = 8;

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

/** Lower-case on purpose: VERIFICATION_LABELS (catalog/labels.ts) is this text with a capital letter. */
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

/** Shown at the end of every static page and of the four hydrated routes. */
export const NOTICE =
  'O WorkEasy está em fase inicial: os perfis exibidos no app podem ser de demonstração e o pedido online depende de o serviço estar configurado. O WorkEasy não tabela preços; cada profissional informa o seu.';

/** Small print under the heading of the requirements section. */
export const RULE_NOTE = 'Regra prevista. Nesta demonstração, nada é coletado ou conferido.';

/** Headings of the sections that static pages and hydrated routes share. */
export const SECTION = {
  hiring: 'Como se contrata',
  hiringIn: bairro => `Como se contrata em ${bairro}`,
  requirements: 'O que o WorkEasy vai pedir de quem presta este serviço',
  requirementsLocal: 'O que será exigido do profissional',
  regulation: 'Profissão regulamentada?',
  byNeighborhood: name => `${name} por bairro`,
  related: areaName => `Outros serviços de ${areaName}`,
  otherNeighborhoods: name => `${name} em outros bairros`,
  seeAlso: 'Veja também',
  areaServices: 'Serviços desta área',
};

// ---------------------------------------------------------------- helpers

/** "a", "a e b", "a, b e c" (or "ou" with `word`). */
export const joinPt = (items, word = 'e') => {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}`;
};

export const capitalize = text => (text ? text[0].toUpperCase() + text.slice(1) : text);

export const truncate = (text, max = DESCRIPTION_MAX) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
};

export const zoneLabel = zone => ZONE_LABELS[zone] ?? zone;
/** "na Zona Sul", "no Centro". */
export const inZone = zone => (zone === 'Centro' ? 'no Centro' : `na ${zoneLabel(zone)}`);

const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

// ------------------------------------------------------ occupation sentences

/** Documents the policy asks for, as list items (same wording as VERIFICATION_LABELS). */
export const verificationItems = policy => policy.verification.map(v => VERIFICATION_TEXT[v]).filter(Boolean).map(capitalize);

export const verificationLead = name => `Quem quiser oferecer ${name} no WorkEasy terá de apresentar no cadastro:`;

/**
 * Sentences about one occupation, all derived from its policy (plus the
 * occupation's own scope note, which is the one text written by hand for it).
 * `intro` opens the page; `hiring`, `requirements` and `regulation` fill its
 * three sections; `steps` is the list that follows `stepsLead`.
 */
export const occupationSentences = (occupation, area, policy) => {
  const name = occupation.name;
  const units = joinPt(policy.priceUnits.map(u => PRICE_UNIT_TEXT[u]).filter(Boolean), 'ou');
  const places = joinPt(policy.locations.map(l => LOCATION_TEXT[l]).filter(Boolean), 'ou');
  const steps = verificationItems(policy);

  const hiring = [
    units && `Para contratar ${name}, você descreve o que precisa e combina o valor ${units} com o profissional.`,
    places && `O atendimento de ${name} acontece ${places}.`,
    PROVIDER_KIND_TEXT[policy.providerType]?.(name),
    policy.laborLock &&
      'Por ser trabalho doméstico, a regra do WorkEasy é limitar a 2 dias por semana na mesma casa; acima disso, a lei trata a relação como emprego doméstico (LC 150/2015) e a contratação passa a ser direta pela família.',
  ].filter(Boolean);

  const requirements = [
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
    typeof policy.notes === 'string' && policy.notes.trim() !== '' && policy.notes.trim(),
  ].filter(Boolean);

  return { intro, hiring, steps, stepsLead: steps.length > 0 ? verificationLead(name) : '', requirements, regulation, units, places };
};

/** Sentence on where the service happens, from the neighborhood's point of view. */
export const neighborhoodPlaceSentence = (name, policy, bairro) => {
  const clauses = [
    policy.locations.includes('domicilio') && 'o profissional vai até o seu endereço no bairro',
    policy.locations.includes('empresa_cliente') && 'o atendimento pode ser na sua empresa',
    policy.locations.includes('estabelecimento') && `quando é no local do profissional, combine com ele a distância até ${bairro}`,
    policy.locations.includes('externo') && 'o local externo é combinado com o profissional',
    policy.locations.includes('online') && 'no atendimento online, o bairro não limita a escolha',
  ].filter(Boolean);
  return clauses.length > 0 ? `${name} em ${bairro}: ${clauses.join('; ')}.` : '';
};

/** Opening paragraphs of an occupation x neighborhood page. */
export const neighborhoodIntro = ({ name, policy, bairro, zone, city = CITY }) =>
  [
    `Procura ${name} em ${bairro}, ${inZone(zone)} de ${city}? Esta página resume como o serviço é contratado pelo WorkEasy e o que será exigido de quem atende o bairro.`,
    neighborhoodPlaceSentence(name, policy, bairro),
    `Os profissionais de ${name} aparecem na busca do app quando há cadastros aprovados que atendem ${bairro}; nesta fase, a lista pode estar vazia.`,
  ].filter(Boolean);

// ------------------------------------------------------- area and category

/** Opening paragraphs of /categorias/<area>; `regulated` is how many of its occupations are regulated. */
export const areaIntro = ({ area, count, regulated, launch }) =>
  [
    area.description,
    `${area.name} tem ${count} ${count === 1 ? 'serviço' : 'serviços'} no WorkEasy${
      regulated > 0
        ? `; ${regulated === 1 ? 'um é profissão regulamentada' : `${regulated} são profissões regulamentadas`}, com registro exigido no cadastro`
        : ', nenhum deles com registro em conselho profissional'
    }.`,
    launch && `Esta é uma das áreas de lançamento em ${CITY}, com páginas por bairro ${joinPt(LAUNCH_ZONES.map(inZone))}.`,
  ].filter(Boolean);

/** Lead of /categorias. */
export const categoriesLead = count =>
  `O WorkEasy reúne ${count} ${count === 1 ? 'área' : 'áreas'} de serviços. Em cada uma, a página da profissão explica como se contrata, como o preço é combinado e o que será exigido de quem presta o serviço.`;

/** Badges shown beside an occupation in lists; empty when the policy has nothing to flag. */
export const policyBadges = policy => {
  if (!policy) return [];
  const badges = [];
  if (policy.regulated) badges.push(`Regulamentada · ${policy.registryName || policy.regulatorBody}`);
  if (policy.providerType === 'somente_empresa_licenciada') badges.push('Só empresas licenciadas');
  return badges;
};

/** "Preço combinado por hora ou por serviço", or '' when the policy lists no price unit. */
export const priceLine = policy => {
  const units = joinPt(policy.priceUnits.map(u => PRICE_UNIT_TEXT[u]).filter(Boolean), 'ou');
  return units ? capitalize(`preço combinado ${units}`) : '';
};

// ------------------------------------------------------------------- links

/** The occupations of `list` that follow `index`, wrapping around, so that every page gets different related links. */
export const relatedWindow = (list, index, limit = RELATED_LIMIT) => {
  const out = [];
  for (let step = 1; step < list.length && out.length < limit; step++) out.push(list[(index + step) % list.length]);
  return out;
};

/** Neighborhoods that get a page: launch zones with a URL-safe slug, by name. */
export const launchNeighborhoods = neighborhoods =>
  (neighborhoods ?? []).filter(n => LAUNCH_ZONES.includes(n.zone) && SLUG.test(n.slug ?? '')).sort(byName);

/** Launch neighborhoods grouped by zone, in the order of LAUNCH_ZONES; empty zones are left out. */
export const groupByZone = bairros =>
  LAUNCH_ZONES.map(zone => ({ zone, label: zoneLabel(zone), items: bairros.filter(n => n.zone === zone) })).filter(group => group.items.length > 0);

/** Other neighborhoods of the same zone, rotated so that each page links to different neighbors. */
export const rotateNeighbors = (sameZone, slug, limit = RELATED_LIMIT) => {
  const index = sameZone.findIndex(b => b.slug === slug);
  const others = sameZone.filter(b => b.slug !== slug);
  const start = others.length > 0 ? Math.max(index, 0) % others.length : 0;
  return [...others.slice(start), ...others.slice(0, start)].slice(0, limit);
};

/** Where the "Pedir este serviço" button goes; the neighborhood is optional. */
export const requestHref = (occupationSlug, neighborhoodSlug) =>
  `/pedido?servico=${encodeURIComponent(occupationSlug)}${neighborhoodSlug ? `&bairro=${encodeURIComponent(neighborhoodSlug)}` : ''}`;

// ------------------------------------------------------------ titles, meta

/** Two occupations may share a name: then the area is appended so that titles stay unique. */
export const occupationLabel = (name, areaName, duplicated) => (duplicated ? `${name} (${areaName})` : name);

export const categoriesMeta = areaNames => ({
  title: `Categorias de serviços | ${SITE_NAME}`,
  description: truncate(
    `${areaNames.length === 1 ? 'A área' : `As ${areaNames.length} áreas`} de serviços do WorkEasy, como ${joinPt(areaNames.slice(0, 3))}. Veja como cada profissão é contratada.`,
  ),
});

export const areaMeta = (area, occupationNames) => ({
  title: `${area.name}: profissionais e serviços | ${SITE_NAME}`,
  description: truncate(
    `${area.description} Veja ${occupationNames.length === 1 ? 'o serviço' : `os ${occupationNames.length} serviços`} de ${area.name} no WorkEasy: ${joinPt(
      occupationNames.slice(0, 3),
    )}.`,
  ),
});

export const occupationMeta = ({ label, name, units, places }) => ({
  title: `${label}: como contratar | ${SITE_NAME}`,
  description: truncate(
    `${label}${units ? `: preço combinado ${units}` : ''}${places ? `, atendimento ${places}` : ''}. Veja o que o WorkEasy exige de quem oferece ${name}.`,
  ),
});

export const neighborhoodMeta = ({ label, bairro, zone, city = CITY, units, places }) => ({
  title: `${label} em ${bairro}, ${city} | ${SITE_NAME}`,
  description: truncate(
    `${label} em ${bairro} (${zoneLabel(zone)}, ${city})${places ? `: atendimento ${places}` : ''}${units ? `, preço combinado ${units}` : ''} e o que se exige do profissional.`,
  ),
});
