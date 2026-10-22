import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Star } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import { listNeighborhoods } from '../../services/neighborhoods';
import { SEARCH_PAGE_SIZE, searchProviders } from '../../services/discovery';
import Avatar from '../Avatar';
import ErrorAlert from '../ErrorAlert';
import RegistryNote from './RegistryNote';
import { formatPriceRange } from './format';
import { inputClass, primaryButton, secondaryButton } from './styles';

interface Props {
  occupationSlug: string;
  occupationName: string;
}

/** Real providers of an occupation (search_providers), optionally by neighborhood. Used with a backend only. */
const ProvidersSection: React.FC<Props> = ({ occupationSlug, occupationName }) => {
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [limit, setLimit] = useState(SEARCH_PAGE_SIZE);

  const neighborhoods = useAsync(() => listNeighborhoods(), 'neighborhoods');
  const providers = useAsync(
    () => searchProviders({ occupation: occupationSlug, neighborhoodId: neighborhoodId || null, limit }),
    `${occupationSlug}:${neighborhoodId}:${limit}`,
  );

  const zones = useMemo(() => {
    const groups = new Map<string, Array<{ id: string; name: string }>>();
    for (const n of neighborhoods.data ?? []) {
      const zone = n.zone || 'Outros';
      groups.set(zone, [...(groups.get(zone) ?? []), { id: n.id, name: n.name }]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [neighborhoods.data]);

  const list = providers.data ?? [];
  const requestLink = `/pedido?servico=${encodeURIComponent(occupationSlug)}`;

  return (
    <section aria-labelledby="ocupacao-profissionais" className="space-y-4">
      <h2 id="ocupacao-profissionais" className="font-bold text-gray-800">Profissionais</h2>

      <div className="max-w-xs">
        <label htmlFor="profissionais-bairro" className="block text-sm text-gray-700 mb-1">Bairro</label>
        <select
          id="profissionais-bairro"
          className={inputClass}
          value={neighborhoodId}
          onChange={e => {
            setNeighborhoodId(e.target.value);
            setLimit(SEARCH_PAGE_SIZE);
          }}
        >
          <option value="">Todos os bairros</option>
          {zones.map(([zone, items]) => (
            <optgroup key={zone} label={zone}>
              {items.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <ErrorAlert error={providers.error} />
      {providers.loading && !providers.data && <p role="status" className="text-sm text-gray-400">Buscando profissionais…</p>}
      {providers.data && list.length === 0 && (
        <p className="text-sm text-gray-600 bg-white border border-gray-100 rounded-2xl p-5">
          {neighborhoodId
            ? `Ainda não há profissionais de ${occupationName} que atendam este bairro.`
            : `Ainda não há profissionais de ${occupationName} com página no WorkEasy.`}{' '}
          Faça um pedido e receba propostas de quem atende o seu bairro.
        </p>
      )}

      {list.length > 0 && (
        <ul className="grid md:grid-cols-2 gap-4">
          {list.map(p => (
            <li key={p.provider_id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
              <div className="flex gap-3">
                <Avatar name={p.display_name} className="w-12 h-12 text-base shrink-0" />
                <div className="min-w-0 space-y-1">
                  <p className="font-bold text-gray-900 break-words">{p.display_name}</p>
                  {p.rating_avg !== null && p.rating_count ? (
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                      <span>
                        {Number(p.rating_avg).toFixed(1).replace('.', ',')} ({p.rating_count}{' '}
                        {p.rating_count === 1 ? 'avaliação' : 'avaliações'})
                      </span>
                    </p>
                  ) : null}
                  <RegistryNote status={p.registry_status} />
                </div>
              </div>
              {p.bio && <p className="text-sm text-gray-600 line-clamp-3 break-words">{p.bio}</p>}
              {p.price_min_cents !== null && (
                <p className="text-sm font-semibold text-gray-800">
                  {formatPriceRange(p.price_min_cents, p.price_max_cents, p.unit)}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-auto">
                <Link to={`/p/${encodeURIComponent(p.slug)}`} className={`${secondaryButton} no-underline`}>Ver página</Link>
                <Link to={`/agendar/${encodeURIComponent(p.slug)}`} className={`${secondaryButton} no-underline`}>
                  <CalendarPlus size={16} aria-hidden="true" /> Agendar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.length >= limit && (
        <button type="button" className={secondaryButton} onClick={() => setLimit(l => l + SEARCH_PAGE_SIZE)} disabled={providers.loading}>
          Ver mais profissionais
        </button>
      )}

      <div>
        <Link to={requestLink} className={`${primaryButton} no-underline`}>Pedir este serviço</Link>
      </div>
    </section>
  );
};

export default ProvidersSection;
