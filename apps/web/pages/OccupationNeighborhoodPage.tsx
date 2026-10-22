import React, { Suspense, use, useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight, ClipboardList, MapPin } from 'lucide-react';
import { findArea, findOccupation, loadPolicies } from '../catalog';
import { LOCATION_LABELS, PRICE_UNIT_LABELS, PROVIDER_KIND_LABELS, VERIFICATION_LABELS } from '../catalog/labels';
import { DEFAULT_CITY, LOCAL_NEIGHBORHOODS } from '../config/neighborhoods';
import { features } from '../config/features';

// /servicos/:slug/:bairro. The static copy of this page for the launch
// categories is written by scripts/prerender.mjs; this one serves anyone
// navigating inside the app.

const ZONE_LABELS: Record<string, string> = { Sul: 'Zona Sul', Norte: 'Zona Norte', Leste: 'Zona Leste', Oeste: 'Zona Oeste', Centro: 'Centro' };
const NEIGHBOR_LIMIT = 8;

const zoneLabel = (zone: string): string => ZONE_LABELS[zone] ?? zone;

const Requirements: React.FC<{ slug: string; name: string; neighborhood: string }> = ({ slug, name, neighborhood }) => {
  const policy = use(loadPolicies())[slug];
  if (!policy) return null;
  const registry = policy.registryName || policy.regulatorBody;

  return (
    <>
      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
        <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-3">
          <MapPin size={18} className="text-primary" /> Como se contrata em {neighborhood}
        </h2>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-500">Preço combinado</dt>
            <dd className="text-gray-800">{policy.priceUnits.map(u => PRICE_UNIT_LABELS[u]).join(', ')}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Onde</dt>
            <dd className="text-gray-800">{policy.locations.map(l => LOCATION_LABELS[l]).join(', ')}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Quem pode prestar</dt>
            <dd className="text-gray-800">{PROVIDER_KIND_LABELS[policy.providerType]}</dd>
          </div>
        </dl>
        <p className="text-sm text-gray-600 mt-4">
          Os profissionais de {name} aparecem na busca quando houver cadastros aprovados que atendam {neighborhood}; nesta fase, a lista pode estar vazia.
        </p>
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
        <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-1">
          <ClipboardList size={18} className="text-primary" /> O que será exigido do profissional
        </h2>
        <p className="text-xs text-gray-500 mb-3">Regra prevista. Nesta demonstração, nada é coletado ou conferido.</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
          {policy.verification.map(step => (
            <li key={step}>{VERIFICATION_LABELS[step]}</li>
          ))}
        </ul>
        <p className="text-sm text-gray-700 mt-4">
          {policy.regulated
            ? `${name} é profissão regulamentada: registro no ${registry}${policy.regulatorBody && policy.regulatorBody !== registry ? ` (${policy.regulatorBody})` : ''}.`
            : `${name} não exige registro em conselho profissional.`}
        </p>
        {policy.audienceMinors && (
          <p className="text-sm text-gray-700 mt-2">Atende crianças ou adolescentes: certidão de antecedentes obrigatória.</p>
        )}
      </section>
    </>
  );
};

const OccupationNeighborhoodPage: React.FC = () => {
  const { slug, bairro } = useParams();
  const occupation = findOccupation(slug);
  const neighborhood = LOCAL_NEIGHBORHOODS.find(n => n.slug === bairro);
  const title = occupation && neighborhood ? `${occupation.name} em ${neighborhood.name}, ${DEFAULT_CITY} | WorkEasy` : null;

  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  if (!occupation) return <Navigate to="/categorias" replace />;
  if (!neighborhood) return <Navigate to={`/servicos/${occupation.slug}`} replace />;

  const area = findArea(occupation.areaSlug);
  const canRequest = features.backendEnabled || features.conciergeWhatsApp !== null;
  const base = `/servicos/${occupation.slug}`;
  const neighbors = LOCAL_NEIGHBORHOODS.filter(n => n.zone === neighborhood.zone && n.slug !== neighborhood.slug).slice(0, NEIGHBOR_LIMIT);
  const requestTo = `/pedido?servico=${encodeURIComponent(occupation.slug)}&bairro=${encodeURIComponent(neighborhood.slug)}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-screen space-y-6">
      <nav aria-label="Caminho" className="text-sm text-gray-500 flex flex-wrap items-center gap-1">
        <Link to="/categorias" className="hover:text-primary">Categorias</Link>
        <ChevronRight size={14} />
        {area && (
          <>
            <Link to={`/categorias/${area.slug}`} className="hover:text-primary">{area.name}</Link>
            <ChevronRight size={14} />
          </>
        )}
        <Link to={base} className="hover:text-primary">{occupation.name}</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{neighborhood.name}</span>
      </nav>

      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
          {occupation.name} em {neighborhood.name}
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          {neighborhood.zone ? `${zoneLabel(neighborhood.zone)}, ` : ''}
          {DEFAULT_CITY}
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          {/* Demo without the concierge number: /pedido has nothing to offer, so the search stays the main action */}
          {canRequest && (
            <Link to={requestTo} className="text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700">
              Pedir este serviço
            </Link>
          )}
          <Link
            to={base}
            className={
              canRequest
                ? 'text-sm font-semibold bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50'
                : 'text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700'
            }
          >
            Ver {occupation.name}
          </Link>
        </div>
      </header>

      <Suspense fallback={<div role="status" className="text-sm text-gray-400">Carregando regras deste serviço…</div>}>
        <Requirements slug={occupation.slug} name={occupation.name} neighborhood={neighborhood.name} />
      </Suspense>

      {neighbors.length > 0 && (
        <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
          <h2 className="font-bold text-gray-800 mb-3">{occupation.name} em outros bairros</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {neighbors.map(n => (
              <li key={n.slug}>
                <Link to={`${base}/${n.slug}`} className="inline-block bg-gray-50 border border-gray-100 rounded-full px-3 py-1 text-primary hover:underline">
                  {n.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default OccupationNeighborhoodPage;
