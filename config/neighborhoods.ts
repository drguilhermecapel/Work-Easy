// Neighborhoods for the concierge request form (no backend). With a backend,
// the list comes from the `neighborhoods` table, whose ids the request needs.
//
// data/neighborhoods.json (the seed source) is used when present; otherwise
// the small provisional list below.
// TODO: remover a lista provisória quando data/neighborhoods.json estiver no repositório.

export interface LocalNeighborhood {
  name: string;
  slug: string;
  zone: string;
}

const PROVISIONAL: LocalNeighborhood[] = [
  { name: 'Bela Vista', slug: 'bela-vista', zone: 'Centro' },
  { name: 'República', slug: 'republica', zone: 'Centro' },
  { name: 'Santana', slug: 'santana', zone: 'Norte' },
  { name: 'Tucuruvi', slug: 'tucuruvi', zone: 'Norte' },
  { name: 'Lapa', slug: 'lapa', zone: 'Oeste' },
  { name: 'Pinheiros', slug: 'pinheiros', zone: 'Oeste' },
  { name: 'Butantã', slug: 'butanta', zone: 'Oeste' },
  { name: 'Moema', slug: 'moema', zone: 'Sul' },
  { name: 'Saúde', slug: 'saude', zone: 'Sul' },
  { name: 'Santo Amaro', slug: 'santo-amaro', zone: 'Sul' },
  { name: 'Mooca', slug: 'mooca', zone: 'Leste' },
  { name: 'Tatuapé', slug: 'tatuape', zone: 'Leste' },
  { name: 'Itaquera', slug: 'itaquera', zone: 'Leste' },
];

// import.meta.glob returns {} when the file does not exist, so the build never breaks
const dataFiles = import.meta.glob<{ default: unknown }>('../data/neighborhoods.json', { eager: true });

const isNeighborhood = (value: unknown): value is LocalNeighborhood =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as LocalNeighborhood).name === 'string' &&
  typeof (value as LocalNeighborhood).slug === 'string';

const fromDataFile = (): LocalNeighborhood[] => {
  const raw = Object.values(dataFiles)[0]?.default;
  const list = Array.isArray(raw) ? raw : (raw as { neighborhoods?: unknown } | undefined)?.neighborhoods;
  return Array.isArray(list)
    ? list.filter(isNeighborhood).map(n => ({ name: n.name, slug: n.slug, zone: typeof n.zone === 'string' ? n.zone : '' }))
    : [];
};

const sortByName = (list: LocalNeighborhood[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export const LOCAL_NEIGHBORHOODS: LocalNeighborhood[] = sortByName(fromDataFile().length > 0 ? fromDataFile() : PROVISIONAL);

export const DEFAULT_CITY = 'São Paulo';
