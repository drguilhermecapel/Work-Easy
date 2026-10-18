import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, ChevronDown } from 'lucide-react';
import ProviderCard from '../components/ProviderCard';
import { MOCK_PROVIDERS, CATEGORIES } from '../constants';
import { Provider } from '../types';

const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const categorySlug = searchParams.get('category');
  
  const [providers, setProviders] = useState<Provider[]>(MOCK_PROVIDERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    // Mock filtering logic
    let filtered = MOCK_PROVIDERS;

    if (query) {
      const lowerQ = query.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(lowerQ) || 
        p.title.toLowerCase().includes(lowerQ) ||
        p.services.some(s => s.title.toLowerCase().includes(lowerQ))
      );
    }

    if (categorySlug) {
      const categoryName = CATEGORIES.find(c => c.slug === categorySlug)?.name;
      if (categoryName) {
         filtered = filtered.filter(p => 
          p.services.some(s => s.category === categoryName)
        );
      }
    }

    setProviders(filtered);
  }, [query, categorySlug]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 min-h-screen">
      
      {/* Search Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {categorySlug 
            ? `Profissionais de ${CATEGORIES.find(c => c.slug === categorySlug)?.name || '...'}`
            : query ? `Resultados para "${query}"` : 'Todos os profissionais'
          }
        </h1>
        <p className="text-gray-500 text-sm">{providers.length} profissionais encontrados próximos a você</p>
      </div>

      {/* Filters Bar (Mobile Optimized) */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-2 sticky top-16 bg-gray-50 z-40 py-2 -mx-4 px-4 md:static md:bg-transparent md:mx-0 md:px-0">
        <button 
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 whitespace-nowrap shadow-sm active:bg-gray-50"
        >
          <Filter size={16} /> Filtros
        </button>
        <button className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 whitespace-nowrap shadow-sm">
          Distância <ChevronDown size={14} />
        </button>
        <button className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 whitespace-nowrap shadow-sm">
          Preço <ChevronDown size={14} />
        </button>
        <button className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 whitespace-nowrap shadow-sm">
          Avaliação 4.5+
        </button>
      </div>

      {/* Simple Filter Drawer Mock */}
      {isFilterOpen && (
        <div className="bg-white p-4 mb-6 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-4">
           <div className="flex justify-between items-center mb-4">
             <h3 className="font-semibold">Filtros</h3>
             <button onClick={() => setIsFilterOpen(false)} className="text-primary text-sm">Aplicar</button>
           </div>
           <div className="space-y-4">
             <div>
               <label className="text-sm text-gray-600 block mb-2">Raio de atendimento</label>
               <input type="range" className="w-full accent-primary" />
               <div className="flex justify-between text-xs text-gray-400">
                 <span>1km</span>
                 <span>50km</span>
               </div>
             </div>
             <div className="flex items-center gap-2">
                <input type="checkbox" id="verified" className="rounded text-primary focus:ring-primary" />
                <label htmlFor="verified" className="text-sm text-gray-700">Apenas verificados</label>
             </div>
           </div>
        </div>
      )}

      {/* Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {providers.map(provider => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
        
        {providers.length === 0 && (
          <div className="col-span-full text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
              <Filter size={32} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Nenhum profissional encontrado</h3>
            <p className="text-gray-500">Tente ajustar seus filtros ou buscar por outra categoria.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
