import { describe, expect, it } from 'vitest';
import { CATEGORIES, MOCK_PROVIDERS } from '../constants';
import { filterProviders, profilePath } from '../utils/search';

describe('filterProviders', () => {
  it('returns everyone without filters', () => {
    expect(filterProviders(MOCK_PROVIDERS, {})).toHaveLength(MOCK_PROVIDERS.length);
  });

  it('finds health professionals under the health category', () => {
    const result = filterProviders(MOCK_PROVIDERS, { categorySlug: 'health' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(p => p.medicalInfo)).toBe(true);
  });

  it('matches service titles and specialties ignoring case and accents', () => {
    expect(filterProviders(MOCK_PROVIDERS, { query: 'PINTURA' }).map(p => p.id)).toContain('1');
    expect(filterProviders(MOCK_PROVIDERS, { query: 'cardiologia' }).map(p => p.id)).toContain('doc-1');
    expect(filterProviders(MOCK_PROVIDERS, { query: 'instalacao' }).map(p => p.id)).toContain('3');
  });

  it('combines query and category', () => {
    expect(filterProviders(MOCK_PROVIDERS, { query: 'faxina', categorySlug: 'reformas' })).toHaveLength(0);
    expect(filterProviders(MOCK_PROVIDERS, { query: 'faxina', categorySlug: 'limpeza' })).toHaveLength(1);
  });
});

describe('catalog consistency', () => {
  it('every service points to an existing category slug', () => {
    const slugs = new Set(CATEGORIES.map(c => c.slug));
    for (const provider of MOCK_PROVIDERS) {
      for (const service of provider.services) {
        expect(slugs, `${provider.id}/${service.id}`).toContain(service.category);
      }
    }
  });

  it('has unique category slugs and no duplicated subcategory across the catalog', () => {
    const slugs = CATEGORIES.map(c => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const subcategories = CATEGORIES.flatMap(c => c.subcategories ?? []);
    const duplicates = subcategories.filter((s, i) => subcategories.indexOf(s) !== i);
    expect(duplicates).toEqual([]);
  });
});

describe('profilePath', () => {
  it('sends health professionals to the doctor profile', () => {
    const doctor = MOCK_PROVIDERS.find(p => p.medicalInfo)!;
    const painter = MOCK_PROVIDERS.find(p => !p.medicalInfo)!;
    expect(profilePath(doctor)).toBe(`/doctor/${doctor.id}`);
    expect(profilePath(painter)).toBe(`/profile/${painter.id}`);
  });
});
