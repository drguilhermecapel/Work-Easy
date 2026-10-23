import React, { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { OCCUPATIONS, findArea } from '../../catalog';
import { searchOccupations } from '../../utils/search';

const LIMIT = 30;

const SearchBox: React.FC<{ initial: string; onSearch: (query: string) => void }> = ({ initial, onSearch }) => {
  const [value, setValue] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={event => {
        event.preventDefault();
        onSearch(value.trim());
      }}
      className="flex gap-2 max-w-xl mb-6"
    >
      <label htmlFor="busca-servico" className="sr-only">
        Procure um serviço ou profissão
      </label>
      <div className="relative flex-1 min-w-0">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          id="busca-servico"
          type="search"
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder="Procure um serviço ou profissão"
          className="w-full min-w-0 pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl outline-hidden focus:border-primary"
        />
      </div>
      <button type="submit" className="shrink-0 bg-primary text-white font-semibold px-5 rounded-xl hover:bg-purple-700">
        Buscar
      </button>
    </form>
  );
};

/**
 * /search with a backend: the services and professions of the catalog that match
 * the words typed (names and synonyms). Each result opens its service page, which
 * shows what the service requires, how to ask for it and the professionals who offer it.
 */
const CatalogSearch: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const category = params.get('category');
  const results = useMemo(() => searchOccupations(OCCUPATIONS, query, LIMIT), [query]);

  // The prototype filtered fictitious professionals by area; the area page lists its services
  if (category && findArea(category)) return <Navigate to={`/categorias/${encodeURIComponent(category)}`} replace />;

  const ready = query.length >= 2;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-screen">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4">{ready ? `Resultados para "${query}"` : 'Buscar serviço'}</h1>

      <SearchBox key={query} initial={query} onSearch={next => setParams(next ? { q: next } : {})} />

      {!ready && (
        <p className="text-gray-600">
          Digite pelo menos duas letras para buscar. Ou veja <Link to="/categorias" className="text-primary font-medium hover:underline">todas as categorias</Link>.
        </p>
      )}

      {ready && results.length === 0 && (
        <div role="status" className="text-gray-600 space-y-2">
          <p>Nenhum serviço encontrado para "{query}". Tente outra palavra.</p>
          <p>
            Veja <Link to="/categorias" className="text-primary font-medium hover:underline">todas as categorias</Link> ou{' '}
            <Link to="/pedido" className="text-primary font-medium hover:underline">descreva o que você precisa</Link>.
          </p>
        </div>
      )}

      {ready && results.length > 0 && (
        <>
          <p role="status" className="text-sm text-gray-500 mb-4">
            {results.length === LIMIT
              ? `Mostrando os ${LIMIT} resultados mais próximos.`
              : `${results.length} ${results.length === 1 ? 'serviço encontrado' : 'serviços encontrados'}.`}
          </p>
          <ul aria-label="Serviços encontrados" className="grid sm:grid-cols-2 gap-3">
            {results.map(occupation => (
              <li key={occupation.slug}>
                <Link
                  to={`/servicos/${occupation.slug}`}
                  className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-primary transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-800 truncate">{occupation.name}</span>
                    <span className="block text-xs text-gray-500 truncate">{findArea(occupation.areaSlug)?.name}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default CatalogSearch;
