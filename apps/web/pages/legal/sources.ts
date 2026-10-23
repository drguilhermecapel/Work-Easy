import type { LegalDocId } from '../../config/legal';

// The texts are Markdown files in content/legal/, bundled as strings (?raw) in
// a chunk of their own: they load only when a legal page opens.
const LOADERS: Record<LegalDocId, () => Promise<{ default: string }>> = {
  termos: () => import('../../content/legal/termos.md?raw'),
  privacidade: () => import('../../content/legal/privacidade.md?raw'),
  sac: () => import('../../content/legal/sac.md?raw'),
};

const cache = new Map<LegalDocId, Promise<string>>();

/** Markdown source of a legal text, loaded once (a failed load is forgotten, so a retry loads again). */
export const loadLegalSource = (id: LegalDocId): Promise<string> => {
  let source = cache.get(id);
  if (!source) {
    source = LOADERS[id]().then(
      module => module.default,
      error => {
        cache.delete(id); // a failed load (e.g. offline) can be tried again
        throw error;
      },
    );
    cache.set(id, source);
  }
  return source;
};
