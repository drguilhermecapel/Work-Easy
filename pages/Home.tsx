import React, { useMemo, useState } from 'react';
import { Search, MapPin, LayoutGrid } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AREAS, OCCUPATIONS, featuredAreas, findArea } from '../catalog';
import { searchOccupations } from '../utils/search';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const suggestions = useMemo(() => searchOccupations(OCCUPATIONS, searchTerm, 6), [searchTerm]);
  const featured = featuredAreas();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
  };

  const handleCategoryClick = (slug: string) => {
    navigate(slug === 'health' ? '/health' : `/categorias/${encodeURIComponent(slug)}`);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="bg-linear-to-br from-primary to-secondary text-white pb-16 pt-10 px-4 rounded-b-4xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
             <div className="absolute right-0 top-0 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-30 animate-blob"></div>
             <div className="absolute left-0 bottom-0 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-30 animate-blob" style={{ animationDelay: '2s' }}></div>
        </div>
        
        <div className="max-w-xl mx-auto text-center relative z-10">
          <h1 className="text-3xl md:text-5xl font-bold mb-4">
            Contrate serviços <br/> sem complicação
          </h1>
          <p className="text-purple-100 mb-8 text-lg">
            Serviços de todas as áreas e profissionais liberais. <br className="hidden md:block"/> Encontre quem sabe fazer perto de você.
          </p>

          <form onSubmit={handleSearch} className="bg-white p-2 rounded-2xl shadow-lg flex items-center max-w-md mx-auto">
            <div className="pl-3 text-gray-400">
              <Search size={20} />
            </div>
            <input 
              type="text" 
              placeholder="O que você precisa?"
              aria-label="O que você precisa?"
              className="flex-1 min-w-0 p-3 text-gray-800 placeholder-gray-400 outline-hidden bg-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button type="submit" className="shrink-0 bg-secondary text-white p-3 rounded-xl font-semibold hover:bg-purple-800 transition-colors">
              Buscar
            </button>
          </form>

          {suggestions.length > 0 && (
            <ul aria-label="Sugestões" className="max-w-md mx-auto mt-2 bg-white rounded-2xl shadow-lg text-left overflow-hidden">
              {suggestions.map(o => (
                <li key={o.slug}>
                  <Link
                    to={`/servicos/${o.slug}`}
                    className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <span className="text-gray-800 font-medium truncate">{o.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{findArea(o.areaSlug)?.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-center mt-4 text-purple-200 text-sm">
            <MapPin size={14} className="mr-1" />
            <span>São Paulo, SP</span>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="max-w-7xl mx-auto px-4 py-12 w-full">
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">Categorias</h2>
          <Link to="/categorias" className="text-primary text-sm font-bold hover:bg-primary/5 px-3 py-1 rounded-full transition-colors">
            Ver todas
          </Link>
        </div>

        <div className="grid grid-cols-3 min-[480px]:grid-cols-4 md:grid-cols-6 gap-x-4 gap-y-8">
          {featured.map((cat) => (
            <button
              type="button"
              key={cat.slug}
              onClick={() => handleCategoryClick(cat.slug)}
              className="flex flex-col items-center gap-3 cursor-pointer group"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl shadow-xs border border-gray-100 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white group-hover:shadow-lg group-hover:shadow-primary/30 transition-all duration-300 ease-out transform group-hover:-translate-y-1">
                <cat.icon strokeWidth={1.5} className="w-8 h-8 sm:w-10 sm:h-10 transition-transform duration-300 group-hover:scale-110" />
              </div>
              <span className="text-xs sm:text-sm font-medium text-gray-600 group-hover:text-primary transition-colors text-center leading-tight w-full px-1 line-clamp-2 h-8 flex items-start justify-center">
                {cat.name}
              </span>
            </button>
          ))}
          <Link to="/categorias" className="flex flex-col items-center gap-3 group">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 ease-out transform group-hover:-translate-y-1">
              <LayoutGrid strokeWidth={1.5} className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <span className="text-xs sm:text-sm font-medium text-primary text-center leading-tight w-full px-1 line-clamp-2 h-8 flex items-start justify-center">
              Todas as {AREAS.length} áreas
            </span>
          </Link>
        </div>
      </section>

      {/* Value Props / How it works */}
      <section className="bg-gray-100 py-16 px-4">
        <div className="max-w-7xl mx-auto">
           <h2 className="text-2xl font-bold text-gray-800 text-center mb-10">Como funciona o WorkEasy?</h2>
           
           <div className="grid md:grid-cols-3 gap-8">
             <div className="bg-white p-6 rounded-xl shadow-xs text-center hover:shadow-md transition-shadow duration-300">
                <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">1</div>
                <h3 className="font-bold text-lg mb-2">Escolha o Profissional</h3>
                <p className="text-gray-600 text-sm">Compare avaliações, preços e distância para encontrar o melhor prestador.</p>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-xs text-center hover:shadow-md transition-shadow duration-300">
                <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">2</div>
                <h3 className="font-bold text-lg mb-2">Solicite e Combine</h3>
                <p className="text-gray-600 text-sm">Envie seu pedido. O profissional responde com uma proposta e vocês combinam os detalhes.</p>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-xs text-center hover:shadow-md transition-shadow duration-300">
                <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">3</div>
                <h3 className="font-bold text-lg mb-2">Avalie o Serviço</h3>
                <p className="text-gray-600 text-sm">Depois do serviço, conte como foi e ajude outras pessoas a escolher.</p>
             </div>
           </div>
        </div>
      </section>
    </div>
  );
};

export default Home;