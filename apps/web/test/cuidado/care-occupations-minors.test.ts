// DD45: the care line does not offer occupations aimed at children or newborns. The database is blocked here so the
// static catalog answers, which is the path that holds the audience rule.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/client', () => ({
  db: () => {
    throw new Error('database unavailable in this test');
  },
  unwrap: (r: { data: unknown }) => r.data,
  unwrapMaybe: (r: { data: unknown }) => r.data,
}));

const { listCareOccupations } = await import('../../services/care');
const { loadPolicies } = await import('../../catalog');

describe('care occupations', () => {
  it('does not offer an occupation aimed at minors (DD45)', async () => {
    const offered = (await listCareOccupations()).map(o => o.slug);
    const policies = await loadPolicies();
    const minors = Object.entries(policies).filter(([, p]) => p.priceUnits.includes('plantao') && p.audienceMinors).map(([s]) => s);
    for (const slug of minors) expect(offered, slug).not.toContain(slug);
  });

  it('keeps the adult care occupations that are priced by shift', async () => {
    const offered = (await listCareOccupations()).map(o => o.slug);
    const policies = await loadPolicies();
    const adults = Object.entries(policies).filter(([, p]) => p.priceUnits.includes('plantao') && !p.audienceMinors).map(([s]) => s);
    expect(adults.length).toBeGreaterThan(0);
    for (const slug of adults) expect(offered, slug).toContain(slug);
  });
});
