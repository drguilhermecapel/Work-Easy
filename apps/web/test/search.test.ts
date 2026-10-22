import { describe, expect, it } from 'vitest';
import { MOCK_PROVIDERS } from '../constants';
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

describe('profilePath', () => {
  it('sends health professionals to the doctor profile', () => {
    const doctor = MOCK_PROVIDERS.find(p => p.medicalInfo)!;
    const painter = MOCK_PROVIDERS.find(p => !p.medicalInfo)!;
    expect(profilePath(doctor)).toBe(`/doctor/${doctor.id}`);
    expect(profilePath(painter)).toBe(`/profile/${painter.id}`);
  });
});
