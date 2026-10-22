import React, { Suspense, use } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight, ClipboardList, Info, MapPin } from 'lucide-react';
import { findArea, findOccupation, loadPolicies } from '../catalog';
import {
  BILLING_LABELS,
  LOCATION_LABELS,
  PRICE_UNIT_LABELS,
  PROVIDER_KIND_LABELS,
  VERIFICATION_LABELS,
} from '../catalog/labels';
import { MOCK_PROVIDERS } from '../constants';
import ProviderCard from '../components/ProviderCard';
import { filterProviders } from '../utils/search';
import { features } from '../config/features';
import ProvidersSection from '../components/cliente/ProvidersSection';

const PolicyDetails: React.FC<{ slug: string }> = ({ slug }) => {
  const policy = use(loadPolicies())[slug];
  if (!policy) return null;

  return (
    <>
      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
        <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-3">
          <MapPin size={18} className="text-primary" /> Como se contrata
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
        {policy.laborLock && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-4">
            Trabalho doméstico: o app vai limitar a 2 dias por semana na mesma casa. Acima disso, a lei trata a
            relação como emprego doméstico (LC 150/2015) e a contratação passa a ser direta pela família.
          </p>
        )}
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
        <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-1">
          <ClipboardList size={18} className="text-primary" /> O que o WorkEasy vai pedir de quem presta este serviço
        </h2>
        <p className="text-xs text-gray-500 mb-3">Regra prevista. Nesta demonstração, nada é coletado ou conferido.</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
          {policy.verification.map(step => (
            <li key={step}>{VERIFICATION_LABELS[step]}</li>
          ))}
        </ul>
        <div className="space-y-2 text-sm text-gray-700 mt-4">
          {policy.regulated && (
            <p>
              <strong>Profissão regulamentada:</strong> registro no {policy.registryName || policy.regulatorBody}
              {policy.regulatorBody && policy.registryName !== policy.regulatorBody ? ` (${policy.regulatorBody})` : ''}.
              {policy.legalBasis && <> Base: {policy.legalBasis}.</>}
            </p>
          )}
          <p>
            <strong>Cobrança da plataforma:</strong> {BILLING_LABELS[policy.billing]}.
          </p>
          {!policy.ratingRanking && <p>Os profissionais não são ordenados por nota, por regra do conselho.</p>}
          {policy.audienceMinors && <p>Atende crianças ou adolescentes: certidão de antecedentes obrigatória.</p>}
          {policy.notes && <p>{policy.notes}</p>}
        </div>
        {policy.confidence === 'a_confirmar' && (
          <p className="inline-flex items-center gap-1 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1 mt-4">
            <Info size={12} /> Base legal a confirmar com advogado
          </p>
        )}
        {policy.sources.length > 0 && (
          <details className="mt-4 text-xs text-gray-500">
            <summary className="cursor-pointer">Fontes consultadas</summary>
            <ul className="mt-2 space-y-1 break-all">
              {policy.sources.map(url => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{url}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </>
  );
};

const OccupationPage: React.FC = () => {
  const { slug } = useParams();
  const occupation = findOccupation(slug);
  if (!occupation) return <Navigate to="/categorias" replace />;

  const area = findArea(occupation.areaSlug);
  const terms = [occupation.name, ...occupation.synonyms];
  const canRequest = features.backendEnabled || features.conciergeWhatsApp !== null;
  const providers = MOCK_PROVIDERS.filter(p => terms.some(query => filterProviders([p], { query }).length > 0));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-screen space-y-6">
      <nav aria-label="Caminho" className="text-sm text-gray-500 flex flex-wrap items-center gap-1">
        <Link to="/categorias" className="hover:text-primary">Categorias</Link>
        <ChevronRight size={14} />
        {area && <Link to={`/categorias/${area.slug}`} className="hover:text-primary">{area.name}</Link>}
        <ChevronRight size={14} />
        <span className="text-gray-700">{occupation.name}</span>
      </nav>

      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{occupation.name}</h1>
        {occupation.synonyms.length > 0 && (
          <p className="text-sm text-gray-500 mt-2">Também procurado como: {occupation.synonyms.join(', ')}</p>
        )}
        <div className="flex flex-wrap gap-3 mt-4">
          {/* Demo without the concierge number: /pedido has nothing to offer, so the demo search stays the main action */}
          {canRequest && (
            <Link
              to={`/pedido?servico=${encodeURIComponent(occupation.slug)}`}
              className="text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700"
            >
              Pedir este serviço
            </Link>
          )}
          <Link
            to={`/search?q=${encodeURIComponent(occupation.name)}`}
            className={
              canRequest
                ? 'text-sm font-semibold bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50'
                : 'text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700'
            }
          >
            Procurar profissionais
          </Link>
          <Link
            to={`/register-provider?ocupacao=${encodeURIComponent(occupation.slug)}`}
            className="text-sm font-semibold bg-white border border-primary text-primary px-4 py-2.5 rounded-xl hover:bg-primary/5"
          >
            Ofereço este serviço
          </Link>
        </div>
      </header>

      <Suspense fallback={<div role="status" className="text-sm text-gray-400">Carregando regras deste serviço…</div>}>
        <PolicyDetails slug={occupation.slug} />
      </Suspense>

      {features.backendEnabled ? (
        <ProvidersSection occupationSlug={occupation.slug} occupationName={occupation.name} />
      ) : (
        <section>
          <h2 className="font-bold text-gray-800 mb-3">Profissionais de demonstração</h2>
          {providers.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {providers.map(p => (
                <ProviderCard key={p.id} provider={p} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Ainda não há perfis de demonstração para este serviço.</p>
          )}
        </section>
      )}
    </div>
  );
};

export default OccupationPage;
