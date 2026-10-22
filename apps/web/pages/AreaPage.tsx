import React, { Suspense, use } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { findArea, loadPolicies } from '../catalog';
import type { Occupation, OccupationPolicy } from '../catalog/types';
import { MOCK_PROVIDERS } from '../constants';
import { filterProviders } from '../utils/search';

const badgesFor = (policy: OccupationPolicy | undefined): string[] => {
  if (!policy) return [];
  const badges: string[] = [];
  if (policy.regulated) badges.push(`Regulamentada · ${policy.registryName || policy.regulatorBody}`);
  if (policy.providerType === 'somente_empresa_licenciada') badges.push('Só empresas licenciadas');
  return badges;
};

const OccupationList: React.FC<{ occupations: Occupation[]; policies?: Record<string, OccupationPolicy> }> = ({ occupations, policies }) => (
  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {occupations.map(o => (
      <li key={o.slug}>
        <Link
          to={`/servicos/${o.slug}`}
          className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 h-full hover:border-primary transition-colors"
        >
          <span className="min-w-0">
            <span className="block font-medium text-gray-800">{o.name}</span>
            {badgesFor(policies?.[o.slug]).map(badge => (
              <span key={badge} className="inline-block mt-1 mr-1 text-[11px] bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">
                {badge}
              </span>
            ))}
          </span>
          <ChevronRight size={16} className="shrink-0 text-gray-400" />
        </Link>
      </li>
    ))}
  </ul>
);

const OccupationListWithPolicies: React.FC<{ occupations: Occupation[] }> = ({ occupations }) => {
  const policies = use(loadPolicies());
  return <OccupationList occupations={occupations} policies={policies} />;
};

const AreaPage: React.FC = () => {
  const { slug } = useParams();
  const area = findArea(slug);
  if (!area) return <Navigate to="/categorias" replace />;

  const occupations = [...area.occupations].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const hasDemoProviders = filterProviders(MOCK_PROVIDERS, { categorySlug: area.slug }).length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen">
      <nav aria-label="Caminho" className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link to="/categorias" className="hover:text-primary">Categorias</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{area.name}</span>
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
            <Link to="/health" className="text-sm font-medium bg-teal-50 text-teal-700 px-4 py-2 rounded-full hover:bg-teal-100">
              Buscar profissionais de saúde
            </Link>
          )}
          {hasDemoProviders && (
            <Link to={`/search?category=${encodeURIComponent(area.slug)}`} className="text-sm font-medium bg-primary/10 text-primary px-4 py-2 rounded-full hover:bg-primary/20">
              Ver profissionais de demonstração
            </Link>
          )}
        </div>
      )}

      <Suspense fallback={<OccupationList occupations={occupations} />}>
        <OccupationListWithPolicies occupations={occupations} />
      </Suspense>
    </div>
  );
};

export default AreaPage;
