import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Filter, ChevronDown, Stethoscope, Check } from 'lucide-react';
import { MOCK_PROVIDERS } from '../constants';
import DoctorCard from '../components/DoctorCard';

const HealthSearch: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState('São Paulo');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);
  
  // Extract all unique specialties from available providers
  const availableSpecialties = useMemo(() => {
    const specs = MOCK_PROVIDERS
      .filter(p => p.medicalInfo)
      .flatMap(p => p.medicalInfo!.specialties);
    return Array.from(new Set(specs)).sort();
  }, []);

  // Filter logic
  const doctors = MOCK_PROVIDERS.filter(p => p.medicalInfo).filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      p.name.toLowerCase().includes(term) ||
      p.title.toLowerCase().includes(term) ||
      p.medicalInfo?.specialties.some(s => s.toLowerCase().includes(term)) ||
      p.medicalInfo?.diseases.some(d => d.toLowerCase().includes(term))
    );

    const matchesSpecialty = !selectedSpecialty || p.medicalInfo?.specialties.includes(selectedSpecialty);

    return matchesSearch && matchesSpecialty;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Search Hero */}
      <div className="bg-teal-600 pb-12 pt-8 px-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-6 text-center">
            Encontre o especialista certo e agende sua consulta
          </h1>
          
          <div className="bg-white p-2 rounded-lg shadow-lg flex flex-col md:flex-row gap-2">
            <div className="flex-1 flex items-center bg-gray-100 rounded-md px-3 py-3">
              <Search className="text-gray-400 mr-2" size={20} />
              <input 
                type="text" 
                placeholder="Especialidade, doença ou nome do médico"
                className="bg-transparent w-full outline-none text-gray-700 placeholder-gray-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex-1 flex items-center bg-gray-100 rounded-md px-3 py-3 relative">
              <MapPin className="text-gray-400 mr-2" size={20} />
              <input 
                type="text" 
                placeholder="Cidade ou Bairro"
                className="bg-transparent w-full outline-none text-gray-700 placeholder-gray-500"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            
            <button className="bg-teal-800 text-white font-bold py-3 px-8 rounded-md hover:bg-teal-900 transition-colors uppercase tracking-wide">
              Buscar
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Specialty Filter Section */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Especialidades em destaque</h3>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            <button 
              onClick={() => setSelectedSpecialty(null)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap border ${
                selectedSpecialty === null 
                ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-200' 
                : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'
              }`}
            >
              Todas
            </button>
            {availableSpecialties.map(spec => (
              <button 
                key={spec}
                onClick={() => setSelectedSpecialty(selectedSpecialty === spec ? null : spec)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap border ${
                  selectedSpecialty === spec 
                  ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-200' 
                  : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'
                }`}
              >
                {selectedSpecialty === spec && <Check size={14} />}
                {spec}
              </button>
            ))}
          </div>
        </div>

        {/* General Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
             <Filter size={16} /> Filtros
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
             Convênio <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
             Disponibilidade <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
             Tipo de consulta <ChevronDown size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex-1 space-y-6">
             <div className="flex justify-between items-center">
               <h2 className="text-lg font-bold text-gray-800">{doctors.length} especialistas encontrados</h2>
               {selectedSpecialty && (
                 <button 
                   onClick={() => setSelectedSpecialty(null)}
                   className="text-xs text-teal-600 font-bold hover:underline"
                 >
                   Limpar filtro de {selectedSpecialty}
                 </button>
               )}
             </div>
             
             {doctors.map(doctor => (
               <DoctorCard key={doctor.id} provider={doctor} />
             ))}

             {doctors.length === 0 && (
               <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                  <Stethoscope className="mx-auto text-gray-300 mb-4" size={48} />
                  <h3 className="text-xl font-bold text-gray-700">Nenhum médico encontrado</h3>
                  <p className="text-gray-500">Tente buscar por termos mais genéricos ou mude a especialidade selecionada.</p>
               </div>
             )}
          </div>

          {/* Sidebar / Map Placeholder */}
          <div className="hidden lg:block w-80">
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm sticky top-24">
               <h3 className="font-bold text-gray-800 mb-4">Dúvidas Frequentes</h3>
               <div className="space-y-4 text-sm">
                 <div>
                   <h4 className="font-bold text-teal-700">Como agendar uma consulta?</h4>
                   <p className="text-gray-600 mt-1">Escolha um horário no perfil do especialista e confirme seus dados.</p>
                 </div>
                 <div>
                   <h4 className="font-bold text-teal-700">Os perfis são reais?</h4>
                   <p className="text-gray-600 mt-1">Não. Nesta demonstração, os perfis, os números de CRM e as avaliações são fictícios.</p>
                 </div>
                 <div>
                   <h4 className="font-bold text-teal-700">Tem teleconsulta?</h4>
                   <p className="text-gray-600 mt-1">Ainda não. A teleconsulta exige empresa registrada no CRM e prontuário certificado.</p>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthSearch;