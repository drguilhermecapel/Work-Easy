import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import { AREAS, OCCUPATIONS, findArea } from '../catalog';
import { searchOccupations } from '../utils/search';

const PREVIEW = 6;

const Categories: React.FC = () => {
  const [filter, setFilter] = useState('');
  const matches = useMemo(() => searchOccupations(OCCUPATIONS, filter, 30), [filter]);
  const filtering = filter.trim().length >= 2;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">Todas as categorias</h1>
      <p className="text-gray-500 mb-6">
        {AREAS.length} áreas e {OCCUPATIONS.length} serviços e profissões.
      </p>

      <div className="relative max-w-xl mb-8">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Procure um serviço ou profissão"
          aria-label="Procure um serviço ou profissão"
          className="w-full min-w-0 pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl outline-hidden focus:border-primary"
        />
      </div>

      {filtering ? (
        <section aria-label="Resultados">
          {matches.length === 0 ? (
            <p className="text-gray-500">Nada encontrado para "{filter}". Tente outra palavra.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {matches.map(o => (
                <li key={o.slug}>
                  <Link
                    to={`/servicos/${o.slug}`}
                    className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-primary transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-800 truncate">{o.name}</span>
                      <span className="block text-xs text-gray-500 truncate">{findArea(o.areaSlug)?.name}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {AREAS.map(area => (
            <section key={area.slug} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
              <Link to={`/categorias/${area.slug}`} className="flex items-start gap-3 group">
                <span className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <area.icon size={22} strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <h2 className="font-bold text-gray-800 group-hover:text-primary transition-colors">{area.name}</h2>
                  <p className="text-xs text-gray-500">{area.occupations.length} serviços</p>
                </span>
              </Link>
              <p className="text-sm text-gray-600 mt-3">{area.description}</p>
              <ul className="flex flex-wrap gap-2 mt-3">
                {area.occupations.slice(0, PREVIEW).map(o => (
                  <li key={o.slug}>
                    <Link to={`/servicos/${o.slug}`} className="inline-block text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full hover:bg-primary/10 hover:text-primary">
                      {o.name}
                    </Link>
                  </li>
                ))}
              </ul>
              {area.occupations.length > PREVIEW && (
                <Link to={`/categorias/${area.slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-3">
                  Ver todos os {area.occupations.length} <ChevronRight size={14} />
                </Link>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default Categories;
