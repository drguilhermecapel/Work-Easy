import React from 'react';
import { Star, MapPin, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Provider } from '../types';

interface ProviderCardProps {
  provider: Provider;
}

const ProviderCard: React.FC<ProviderCardProps> = ({ provider }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-4 flex gap-4">
        <div className="flex-shrink-0">
          <img 
            src={provider.image} 
            alt={provider.name} 
            className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 truncate flex items-center gap-1">
              {provider.name}
              {provider.verified && <CheckCircle size={14} className="text-blue-500 fill-current" />}
            </h3>
            <div className="flex items-center bg-yellow-50 px-2 py-0.5 rounded text-xs font-medium text-yellow-700">
              <Star size={12} className="fill-yellow-400 text-yellow-400 mr-1" />
              {provider.rating}
            </div>
          </div>
          <p className="text-sm text-gray-600 truncate">{provider.title}</p>
          <div className="flex items-center mt-1 text-xs text-gray-500">
            <MapPin size={12} className="mr-1" />
            {provider.location} • {provider.distance}km
          </div>
        </div>
      </div>
      
      <div className="px-4 pb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {provider.services.slice(0, 2).map(s => (
            <span key={s.id} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
              {s.title}
            </span>
          ))}
          {provider.services.length > 2 && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-500">
              +{provider.services.length - 2}
            </span>
          )}
        </div>
        <Link 
          to={`/profile/${provider.id}`}
          className="block w-full text-center bg-primary text-white font-medium py-2 rounded-lg hover:bg-purple-700 transition-colors"
        >
          Ver Perfil
        </Link>
      </div>
    </div>
  );
};

export default ProviderCard;
