import { findOccupation } from '../catalog';
import { db } from './client';

/**
 * Names (pt-BR) of occupations by slug: the static catalog first, then the database, because an occupation may
 * exist only there (the catalog ships with the app, the table is edited at the server). A slug that neither
 * knows is left out of the map, and the caller shows the slug.
 */
export const occupationNames = async (slugs: string[]): Promise<Map<string, string>> => {
  const names = new Map<string, string>();
  const unknown: string[] = [];
  for (const slug of new Set(slugs)) {
    const known = findOccupation(slug)?.name;
    if (known) names.set(slug, known);
    else unknown.push(slug);
  }
  if (unknown.length > 0) {
    try {
      const { data } = await db().from('occupations').select('slug, name').in('slug', unknown);
      for (const row of (data ?? []) as Array<{ slug: string; name: string }>) names.set(row.slug, row.name);
    } catch {
      // Without the name, the screen shows the slug
    }
  }
  return names;
};
