import React, { Suspense, use } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { findArea, loadPolicies } from '../catalog';
import type { Area, Occupation, OccupationPolicy } from '../catalog/types';
import { LAUNCH_AREA_SLUGS, SECTION, areaFacts, areaMeta, policyBadges } from '../catalog/prose.mjs';
import { MOCK_PROVIDERS } from '../constants';
import { filterProviders } from '../utils/search';
import { LAUNCH_NEIGHBORHOODS } from '../components/seo/launch';
import { Notice, OccupationCard, Paragraphs } from '../components/seo/Prose';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const OccupationList: React.FC<{ occupations: Occupation[]; policies?: Record<string, OccupationPolicy> }> = ({ occupations, policies }) => (
  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {occupations.map(o => (
      <li key={o.slug}>
        <OccupationCard to={`/servicos/${o.slug}`} name={o.name} badges={policyBadges(policies?.[o.slug])} />
      </li>
    ))}
  </ul>
);

const OccupationListWithPolicies: React.FC<{ occupations: Occupation[] }> = ({ occupations }) => {
  const policies = use(loadPolicies());
  return <OccupationList occupations={occupations} policies={policies} />;
};

/** How many of the services are regulated and whether the area is a launch one: the same sentences as the static page, which needs the policies. */
const AreaFacts: React.FC<{ area: Area }> = ({ area }) => {
  const policies = use(loadPolicies());
  const regulated = area.occupations.filter(o => policies[o.slug]?.regulated).length;
  const launch = LAUNCH_AREA_SLUGS.includes(area.slug) && LAUNCH_NEIGHBORHOODS.length > 0;
  return (
    <div className="mt-6 space-y-2">
      <Paragraphs texts={areaFacts({ area, count: area.occupations.length, regulated, launch })} />
    </div>
  );
};

const AreaPage: React.FC = () => {
  const { slug } = useParams();
  const area = findArea(slug);
  useDocumentTitle(area ? areaMeta(area, area.occupations.map(o => o.name)).title : null);
  if (!area) return <Navigate to="/categorias" replace />;

  const occupations = [...area.occupations].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const hasDemoProviders = filterProviders(MOCK_PROVIDERS, { categorySlug: area.slug }).length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen">
      <nav aria-label="Caminho" className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link to="/categorias" className="inline-flex items-center max-sm:min-h-11 hover:text-primary">Categorias</Link>
        <ChevronRight size={14} />
        <span aria-current="page" className="text-gray-700">{area.name}</span>
      </nav>

      <header className="flex items-start gap-4 mb-6">
        <span className="w-14 h-14 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <area.icon size={28} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{area.name}</h1>
          <p className="text-gray-600 mt-1">{area.description}</p>
          <p className="text-sm text-gray-500 mt-1">{area.occupations.length} serviços e profissões</p>
        </div>
      </header>

      {(area.slug === 'health' || hasDemoProviders) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {area.slug === 'health' && (
            <Link to="/health" className="inline-flex items-center min-h-11 text-sm font-medium bg-teal-50 text-teal-700 px-4 py-2 rounded-full hover:bg-teal-100">
              Buscar profissionais de saúde
            </Link>
          )}
          {hasDemoProviders && (
            <Link to={`/search?category=${encodeURIComponent(area.slug)}`} className="inline-flex items-center min-h-11 text-sm font-medium bg-primary/10 text-secondary px-4 py-2 rounded-full hover:bg-primary/20">
              Ver profissionais de demonstração
            </Link>
          )}
        </div>
      )}

      <h2 className="font-bold text-gray-800 mb-3">{SECTION.areaServices}</h2>
      <Suspense fallback={<OccupationList occupations={occupations} />}>
        <OccupationListWithPolicies occupations={occupations} />
      </Suspense>

      {/* After the list, so that nothing above it moves when the policies arrive */}
      <Suspense fallback={null}>
        <AreaFacts area={area} />
      </Suspense>

      <div className="mt-6">
        <Notice />
      </div>
    </div>
  );
};

export default AreaPage;
