import React, { Suspense, use } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { findArea, findOccupation, loadPolicies } from '../catalog';
import type { Area, Occupation } from '../catalog/types';
import { DEFAULT_CITY, LOCAL_NEIGHBORHOODS } from '../config/neighborhoods';
import type { LocalNeighborhood } from '../config/neighborhoods';
import { features } from '../config/features';
import { SECTION, neighborhoodIntro, neighborhoodMeta, occupationSentences, requestHref, rotateNeighbors, zoneLabel } from '../catalog/prose.mjs';
import { LinkList, Notice, Paragraphs, PolicySections, ProseSection } from '../components/seo/Prose';
import { labelOf } from '../components/seo/launch';
import { useDocumentTitle } from '../lib/useDocumentTitle';

// /servicos/:slug/:bairro. The static copy of this page for the launch
// categories is written by scripts/prerender.mjs; this one serves anyone
// navigating inside the app. Both say the same thing (catalog/prose.mjs).

const Requirements: React.FC<{ occupation: Occupation; area: Area | undefined; neighborhood: LocalNeighborhood }> = ({ occupation, area, neighborhood }) => {
  const policy = use(loadPolicies())[occupation.slug];
  if (!policy) return null;

  return (
    <>
      <div className="space-y-2">
        <Paragraphs texts={neighborhoodIntro({ name: occupation.name, policy, bairro: neighborhood.name, zone: neighborhood.zone, city: DEFAULT_CITY })} />
      </div>
      <PolicySections
        sentences={occupationSentences(occupation, area, policy)}
        hiringTitle={SECTION.hiringIn(neighborhood.name)}
        requirementsTitle={SECTION.requirementsLocal}
      />
    </>
  );
};

const OccupationNeighborhoodPage: React.FC = () => {
  const { slug, bairro } = useParams();
  const occupation = findOccupation(slug);
  const neighborhood = LOCAL_NEIGHBORHOODS.find(n => n.slug === bairro);
  useDocumentTitle(
    occupation && neighborhood
      ? neighborhoodMeta({ label: labelOf(occupation), bairro: neighborhood.name, zone: neighborhood.zone, city: DEFAULT_CITY, units: '', places: '' }).title
      : null,
  );

  if (!occupation) return <Navigate to="/categorias" replace />;
  if (!neighborhood) return <Navigate to={`/servicos/${occupation.slug}`} replace />;

  const area = findArea(occupation.areaSlug);
  const canRequest = features.backendEnabled || features.conciergeWhatsApp !== null;
  const base = `/servicos/${occupation.slug}`;
  const neighbors = rotateNeighbors(
    LOCAL_NEIGHBORHOODS.filter(n => n.zone === neighborhood.zone),
    neighborhood.slug,
  );
  const requestTo = requestHref(occupation.slug, neighborhood.slug);
  const secondary = 'text-sm font-semibold bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50';

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
            className={canRequest ? secondary : 'text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700'}
          >
            Ver {occupation.name}
          </Link>
          <Link to={`/search?q=${encodeURIComponent(occupation.name)}`} className={secondary}>
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

      {/* Tall on purpose: what loads in here is long, and the sections below must not slide up the screen while it does */}
      <Suspense fallback={<div role="status" className="min-h-[70vh] text-sm text-gray-400">Carregando regras deste serviço…</div>}>
        <Requirements occupation={occupation} area={area} neighborhood={neighborhood} />
      </Suspense>

      {neighbors.length > 0 && (
        <ProseSection title={SECTION.otherNeighborhoods(occupation.name)}>
          <LinkList links={neighbors.map(n => ({ to: `${base}/${n.slug}`, label: `${occupation.name} em ${n.name}` }))} />
        </ProseSection>
      )}

      <ProseSection title={SECTION.seeAlso}>
        <LinkList
          links={[
            { to: base, label: `${occupation.name}: como contratar` },
            ...(area ? [{ to: `/categorias/${area.slug}`, label: `Todos os serviços de ${area.name}` }] : []),
          ]}
        />
      </ProseSection>

      <Notice />
    </div>
  );
};

export default OccupationNeighborhoodPage;
