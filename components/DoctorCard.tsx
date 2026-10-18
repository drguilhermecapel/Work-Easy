import React from 'react';
import { Star, MapPin, Video, Calendar, ShieldCheck, ThumbsUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Provider } from '../types';

interface DoctorCardProps {
  provider: Provider;
}

const DoctorCard: React.FC<DoctorCardProps> = ({ provider }) => {
  if (!provider.medicalInfo) return null;

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const isToday = (isoString: string) => {
    const date = new Date(isoString);
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all flex flex-col md:flex-row">
      {/* Left Info Section */}
      <div className="p-5 flex-1 flex flex-col sm:flex-row gap-5">
        <div className="flex-shrink-0 flex flex-col items-center sm:items-start">
          <img 
            src={provider.image} 
            alt={provider.name} 
            className="w-24 h-24 rounded-full object-cover border-4 border-teal-50 shadow-sm"
          />
          {provider.verified && (
            <div className="flex items-center gap-1 text-[10px] text-teal-600 font-bold mt-2 bg-teal-50 px-2 py-1 rounded-full">
              <ShieldCheck size={12} /> VERIFICADO
            </div>
          )}
        </div>
        
        <div className="flex-1 text-center sm:text-left">
          <Link to={`/doctor/${provider.id}`} className="hover:underline decoration-teal-500">
             <h3 className="text-xl font-bold text-gray-900">{provider.name}</h3>
          </Link>
          <p className="text-gray-600 font-medium">{provider.title}</p>
          <p className="text-xs text-gray-400 mb-2">CRM: {provider.medicalInfo.crm}</p>
          
          <div className="flex items-center justify-center sm:justify-start gap-1 mb-3">
             <div className="flex text-yellow-400">
               {[...Array(5)].map((_, i) => (
                 <Star key={i} size={14} className={i < Math.round(provider.rating) ? "fill-current" : "text-gray-200 fill-gray-200"} />
               ))}
             </div>
             <span className="text-xs font-bold text-gray-700 underline cursor-pointer">{provider.totalReviews} opiniões</span>
          </div>

          <div className="space-y-1">
             <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-gray-600">
                <MapPin size={16} className="text-gray-400" />
                <span className="line-clamp-1">{provider.medicalInfo.address.city} - {provider.medicalInfo.address.neighborhood}</span>
             </div>
             <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-gray-600">
                <Video size={16} className="text-teal-500" />
                <span>Telemedicina disponível</span>
             </div>
          </div>
          
          <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
            {provider.services.slice(0, 3).map(s => (
              <span key={s.id} className="text-xs border border-gray-200 text-gray-500 px-2 py-1 rounded">
                {s.title}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Booking Section */}
      <div className="bg-gray-50 p-5 md:w-64 border-t md:border-t-0 md:border-l border-gray-100 flex flex-col justify-between">
         <div>
           <div className="mb-4">
             <p className="text-xs text-gray-500 font-bold uppercase mb-2">Próxima Disponibilidade</p>
             <div className="grid grid-cols-2 gap-2">
                {provider.medicalInfo.nextAvailableSlots.slice(0, 4).map((slot, idx) => (
                  <Link 
                    to={`/doctor/${provider.id}?slot=${slot}`}
                    key={idx} 
                    className="text-center bg-teal-600 text-white text-sm font-medium py-1.5 rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    {isToday(slot) ? 'Hoje' : 'Amanhã'} <br/>
                    <span className="font-bold">{formatDate(slot)}</span>
                  </Link>
                ))}
             </div>
           </div>
           
           <div className="text-center mb-4">
             <Link to={`/doctor/${provider.id}`} className="text-xs text-teal-600 font-bold hover:underline">
               Ver mais horários
             </Link>
           </div>
         </div>

         <Link 
           to={`/doctor/${provider.id}`}
           className="w-full block text-center bg-white border border-teal-600 text-teal-700 font-bold py-2 rounded-lg hover:bg-teal-50 transition-colors"
         >
           Ver Perfil
         </Link>
      </div>
    </div>
  );
};

export default DoctorCard;