import { describe, expect, it } from 'vitest';
import { AREAS, OCCUPATIONS, featuredAreas, findOccupation, loadPolicies } from '../catalog';
import { MOCK_PROVIDERS } from '../constants';
import { searchOccupations } from '../utils/search';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Area slugs that existed before the catalog grew; links and mock data use them
const ORIGINAL_AREA_SLUGS = [
  'reformas', 'limpeza', 'assistencia', 'eletricista', 'beleza', 'aulas', 'health', 'cuidados',
  'pets', 'eventos', 'autos', 'tecnologia', 'fretes', 'consultoria', 'gastronomia',
];

describe('catalog index', () => {
  it('covers every area of services with hundreds of occupations', () => {
    expect(AREAS.length).toBeGreaterThanOrEqual(25);
    expect(OCCUPATIONS.length).toBeGreaterThanOrEqual(500);
    for (const area of AREAS) expect(area.occupations.length, area.slug).toBeGreaterThan(0);
  });

  it('keeps the original area slugs', () => {
    const slugs = AREAS.map(a => a.slug);
    for (const slug of ORIGINAL_AREA_SLUGS) expect(slugs).toContain(slug);
  });

  it('uses unique, URL-safe slugs', () => {
    const areaSlugs = AREAS.map(a => a.slug);
    const occupationSlugs = OCCUPATIONS.map(o => o.slug);
    expect(new Set(areaSlugs).size).toBe(areaSlugs.length);
    expect(new Set(occupationSlugs).size).toBe(occupationSlugs.length);
    for (const slug of [...areaSlugs, ...occupationSlugs]) expect(slug).toMatch(SLUG);
  });

  it('has no duplicated occupation names', () => {
    const names = OCCUPATIONS.map(o => o.name.toLocaleLowerCase('pt-BR'));
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('gives every occupation lower-case search synonyms other than its name', () => {
    for (const o of OCCUPATIONS) {
      expect(o.synonyms.length, o.slug).toBeGreaterThan(0);
      for (const s of o.synonyms) {
        expect(s, o.slug).toBe(s.toLocaleLowerCase('pt-BR'));
        expect(s.trim(), o.slug).not.toBe('');
      }
      expect(new Set(o.synonyms).size, o.slug).toBe(o.synonyms.length);
    }
  });

  it('resolves an icon and a description for every area', () => {
    for (const area of AREAS) {
      expect(area.icon, area.slug).toBeTruthy();
      expect(area.description.length, area.slug).toBeGreaterThan(10);
    }
  });

  it('features the launch categories on the home page', () => {
    expect(featuredAreas().map(a => a.slug)).toEqual(expect.arrayContaining(['cuidados', 'limpeza', 'reformas']));
  });

  it('points every demo service at an existing area', () => {
    const slugs = new Set(AREAS.map(a => a.slug));
    for (const provider of MOCK_PROVIDERS) {
      for (const service of provider.services) expect(slugs, `${provider.id}/${service.id}`).toContain(service.category);
    }
  });
});

describe('occupation policies', async () => {
  const policies = await loadPolicies();

  it('has exactly one policy per occupation', () => {
    expect(Object.keys(policies).sort()).toEqual(OCCUPATIONS.map(o => o.slug).sort());
  });

  it.each(OCCUPATIONS.map(o => [o.slug]))('%s has a coherent policy', slug => {
    const p = policies[slug];
    // Identity and tax registration are asked of everyone
    expect(p.verification).toContain('documento_selfie');
    expect(p.verification).toContain('cadastro_fiscal');
    expect(new Set(p.verification).size).toBe(p.verification.length);

    if (p.regulated) {
      expect(p.regulatorBody).not.toBe('');
      expect(p.registryName).not.toBe('');
      expect(p.verification).toContain('registro_profissional');
    } else {
      expect(p.registryName).toBe('');
      expect(p.verification).not.toContain('registro_profissional');
    }

    // Background checks only where the job justifies them, and always for minors
    expect(p.verification.includes('antecedentes')).toBe(p.backgroundCheck);
    if (p.audienceMinors) expect(p.backgroundCheck).toBe(true);

    // Domestic work happens in the client's home
    if (p.laborLock) expect(p.locations).toContain('domicilio');

    // An unchecked legal basis cannot be marked as checked
    if (p.regulated && p.legalBasis === '') expect(p.confidence).toBe('a_confirmar');

    expect(p.priceUnits.length).toBeGreaterThan(0);
    expect(p.locations.length).toBeGreaterThan(0);
    expect(p.notes.length).toBeLessThanOrEqual(240);
    for (const url of p.sources) expect(url).toMatch(/^https?:\/\//);
  });

  it('keeps medical councils out of commissions and rating rankings', () => {
    const medical = Object.entries(policies).filter(([, p]) => /^CFM(\/|$)/.test(p.regulatorBody));
    expect(medical.length).toBeGreaterThan(20);
    for (const [slug, p] of medical) {
      // Never a commission; a practice under legal doubt may wait for advice instead of a subscription
      expect(p.billing, slug).not.toBe('comissao_primeiro_servico');
      expect(p.ratingRanking, slug).toBe(false);
    }
  });

  it('applies the domestic-work lock to housekeeping and home care', () => {
    for (const slug of ['diarista', 'cuidador-de-idosos', 'baba']) {
      const occupation = findOccupation(slug);
      if (occupation) expect(policies[slug].laborLock, slug).toBe(true);
    }
  });
});

describe('searchOccupations', () => {
  it('finds occupations by popular synonym, ignoring accents and case', () => {
    expect(searchOccupations(OCCUPATIONS, 'faxina').length).toBeGreaterThan(0);
    expect(searchOccupations(OCCUPATIONS, 'ELETRICISTA')[0]?.name).toMatch(/eletricista/i);
    expect(searchOccupations(OCCUPATIONS, 'cardiologia').map(o => o.name).join(' ')).toMatch(/Cardiolog/);
  });

  it('ranks an exact name first', () => {
    const [first] = searchOccupations(OCCUPATIONS, 'Encanador');
    expect(first?.name).toBe('Encanador');
  });

  it('ignores one-letter queries and caps results', () => {
    expect(searchOccupations(OCCUPATIONS, 'a')).toEqual([]);
    expect(searchOccupations(OCCUPATIONS, 'de', 5).length).toBeLessThanOrEqual(5);
  });
});
