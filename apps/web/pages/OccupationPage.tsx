import React, { Suspense, use } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { findArea, findOccupation, loadPolicies } from '../catalog';
import type { Area, Occupation } from '../catalog/types';
import {
  LAUNCH_AREA_SLUGS,
  SECTION,
  introSentences,
  occupationMeta,
  occupationSentences,
  relatedWindow,
  scopeNote,
} from '../catalog/prose.mjs';
import { MOCK_PROVIDERS } from '../constants';
import ProviderCard from '../components/ProviderCard';
import { filterProviders } from '../utils/search';
import { features } from '../config/features';
import ProvidersSection from '../components/cliente/ProvidersSection';
import { LinkList, NeighborhoodLinks, Notice, Paragraph, Paragraphs, PolicySections, ProseSection } from '../components/seo/Prose';
import { LAUNCH_NEIGHBORHOODS, labelOf } from '../components/seo/launch';
import { useDocumentTitle } from '../lib/useDocumentTitle';

// The text and the links of this page are the ones scripts/prerender.mjs writes into the static HTML
// (catalog/prose.mjs), so nothing a crawler read there is missing once React takes over.

const PolicyDetails: React.FC<{ occupation: Occupation; area: Area | undefined }> = ({ occupation, area }) => {
  const policy = use(loadPolicies())[occupation.slug];
  if (!policy) return null;
  const note = scopeNote(policy);

  return (
    <>
      {note && <Paragraph text={note} />}
      <PolicySections
        sentences={occupationSentences(occupation, area, policy)}
        hiringTitle={SECTION.hiring}
        requirementsTitle={SECTION.requirements}
        sources={policy.sources}
      />
    </>
  );
};

const OccupationPage: React.FC = () => {
  const { slug } = useParams();
  const occupation = findOccupation(slug);
  useDocumentTitle(occupation ? occupationMeta({ label: labelOf(occupation), name: occupation.name, units: '', places: '' }).title : null);
  if (!occupation) return <Navigate to="/categorias" replace />;

  const area = findArea(occupation.areaSlug);
  const terms = [occupation.name, ...occupation.synonyms];
  const canRequest = features.backendEnabled || features.conciergeWhatsApp !== null;
  const providers = MOCK_PROVIDERS.filter(p => terms.some(query => filterProviders([p], { query }).length > 0));
  const base = `/servicos/${occupation.slug}`;
  const bairros = area && LAUNCH_AREA_SLUGS.includes(area.slug) ? LAUNCH_NEIGHBORHOODS : [];
  const related = area ? relatedWindow(area.occupations, area.occupations.findIndex(o => o.slug === occupation.slug)) : [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-screen space-y-6">
      <nav aria-label="Caminho" className="text-sm text-gray-500 flex flex-wrap items-center gap-1">
        <Link to="/categorias" className="inline-flex items-center max-sm:min-h-11 hover:text-primary">Categorias</Link>
        <ChevronRight size={14} />
        {area && <Link to={`/categorias/${area.slug}`} className="inline-flex items-center max-sm:min-h-11 hover:text-primary">{area.name}</Link>}
        <ChevronRight size={14} />
        <span aria-current="page" className="text-gray-700">{occupation.name}</span>
      </nav>

      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{occupation.name}</h1>
        <div className="mt-2 space-y-2">
          <Paragraphs texts={introSentences(occupation, area)} />
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          {/* Demo without the concierge number: /pedido has nothing to offer, so the demo search stays the main action */}
          {canRequest && (
            <Link
              to={`/pedido?servico=${encodeURIComponent(occupation.slug)}`}
              className="inline-flex items-center min-h-11 text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700"
            >
              Pedir este serviço
            </Link>
          )}
          <Link
            to={`/search?q=${encodeURIComponent(occupation.name)}`}
            className={
              canRequest
                ? 'inline-flex items-center min-h-11 text-sm font-semibold bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50'
                : 'inline-flex items-center min-h-11 text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700'
            }
          >
            Procurar profissionais
          </Link>
          <Link
            to={`/register-provider?ocupacao=${encodeURIComponent(occupation.slug)}`}
            className="inline-flex items-center min-h-11 text-sm font-semibold bg-white border border-primary text-primary px-4 py-2.5 rounded-xl hover:bg-primary/5"
          >
            Ofereço este serviço
          </Link>
        </div>
      </header>

      {/* Tall on purpose: what loads in here is long, and the sections below must not slide up the screen while it does */}
      <Suspense fallback={<div role="status" className="min-h-[70vh] text-sm text-gray-500">Carregando regras deste serviço…</div>}>
        <PolicyDetails occupation={occupation} area={area} />
      </Suspense>

      {bairros.length > 0 && <NeighborhoodLinks name={occupation.name} base={base} bairros={bairros} />}

      {area && related.length > 0 && (
        <ProseSection title={SECTION.related(area.name)}>
          <LinkList links={related.map(o => ({ to: `/servicos/${o.slug}`, label: o.name }))} />
        </ProseSection>
      )}

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

      <Notice />
    </div>
  );
};

export default OccupationPage;
