import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

// catalog/policies.json stays the one source of the rules (1,710 policies, about 1.8 MB). Loaded
// whole it costs every page that shows one rule 192 kB gzip, so this plugin cuts it per area at
// build time and the app loads only the area of the page (catalog/index.ts):
//
//   virtual:policies-by-area   { "<area slug>": () => import("virtual:policies/<area slug>"), ... }
//   virtual:policies/policies-<area>    { "<occupation slug>": policy, ... }  (the occupations of that area)
//
// The module is called policies-<area> so the chunk is too: scripts/check-bundle-size.mjs measures the
// chunks with that prefix as data, the way it measures the catalog.
//
// Nothing is written to the repository: the cut is made from the two catalog files on every build,
// so a second copy of the rules cannot drift from the first. The same plugin serves Vitest.

const INDEX = 'virtual:policies-by-area';
const AREA = 'virtual:policies/';
const PREFIX = 'policies-';
const RESOLVED = '\0';

interface AreasFile {
  areas: Array<{ slug: string; occupations: Array<{ slug: string }> }>;
}

export const policiesByArea = (): Plugin => {
  const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(`./catalog/${file}`, import.meta.url), 'utf8')) as T;
  let areas: Map<string, string[]> | undefined;
  let policies: Record<string, unknown> | undefined;

  const load = () => {
    areas ??= new Map(read<AreasFile>('areas.json').areas.map(area => [area.slug, area.occupations.map(o => o.slug)]));
    policies ??= read<Record<string, unknown>>('policies.json');
    return { areas, policies };
  };

  return {
    name: 'policies-by-area',
    resolveId(id) {
      return id === INDEX || id.startsWith(AREA) ? RESOLVED + id : null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return null;
      const name = id.slice(RESOLVED.length);
      const data = load();
      if (name === INDEX) {
        const entries = [...data.areas.keys()].map(slug => `${JSON.stringify(slug)}: () => import(${JSON.stringify(AREA + PREFIX + slug)})`);
        return `export default {\n${entries.join(',\n')}\n};`;
      }
      if (name.startsWith(AREA)) {
        const area = name.slice(AREA.length);
        const slugs = area.startsWith(PREFIX) ? data.areas.get(area.slice(PREFIX.length)) : undefined;
        if (!slugs) return null;
        const subset: Record<string, unknown> = {};
        for (const slug of slugs) if (data.policies[slug] !== undefined) subset[slug] = data.policies[slug];
        return `export default ${JSON.stringify(subset)};`;
      }
      return null;
    },
  };
};
