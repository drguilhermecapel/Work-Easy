import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, MapPin, Clock, MessageCircle, X } from 'lucide-react';
import { MOCK_PROVIDERS } from '../constants';
import Avatar from '../components/Avatar';

const Profile: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const provider = MOCK_PROVIDERS.find(p => p.id === id);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(provider?.services[0]?.id || '');
  const [description, setDescription] = useState('');

  if (!provider) {
    return <div className="p-8 text-center">Profissional não encontrado</div>;
  }

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Prototype: nothing is sent. A real request needs a backend.
    setIsModalOpen(false);
    navigate('/dashboard');
    alert('Demonstração: nenhuma solicitação real foi enviada.');
  };

  return (
    <div className="bg-white min-h-screen pb-20">
      {/* Header Image/Background */}
      <div className="h-40 bg-gradient-to-r from-primary to-secondary relative">
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 text-white bg-black/20 p-2 rounded-full backdrop-blur-sm">
           <X size={20} />
        </button>
      </div>
      
      {/* Profile Info */}
      <div className="max-w-4xl mx-auto px-4 -mt-16 relative">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row gap-6 items-start">
          <Avatar name={provider.name} className="w-24 h-24 md:w-32 md:h-32 text-3xl border-4 border-white shadow-md" />

          <div className="flex-1 mt-2 md:mt-10">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  {provider.name}
                </h1>
                <p className="text-gray-600 font-medium">{provider.title}</p>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1 bg-yellow-50 px-3 py-1 rounded-lg">
                   <Star className="text-yellow-400 fill-yellow-400" size={16} />
                   <span className="font-bold text-yellow-700">{provider.rating}</span>
                   <span className="text-xs text-yellow-600">({provider.totalReviews})</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
               <div className="flex items-center gap-1">
                 <MapPin size={16} /> {provider.location}
               </div>
               <div className="flex items-center gap-1">
                 <Clock size={16} /> {provider.yearsExperience} anos exp.
               </div>
               <div className="flex items-center gap-1">
                 Perfil informado (não verificado)
               </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-6">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">Sobre</h2>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                {provider.description}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">Serviços e Preços</h2>
              <div className="space-y-3">
                {provider.services.map(service => (
                  <div key={service.id} className="border border-gray-100 rounded-xl p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div>
                      <h3 className="font-semibold text-gray-800">{service.title}</h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{service.description}</p>
                    </div>
                    <div className="text-right">
                      <span className="block font-bold text-primary">R$ {service.priceMin} - {service.priceMax}</span>
                      <span className="text-xs text-gray-400">/ {service.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">Avaliações Recentes</h2>
              <div className="space-y-4">
                {provider.reviews.length > 0 ? provider.reviews.map(review => (
                  <div key={review.id} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500">
                          {review.clientName.charAt(0)}
                        </div>
                        <span className="font-medium text-sm">{review.clientName}</span>
                      </div>
                      <div className="flex text-yellow-400">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={12} className={i < review.rating ? "fill-current" : "text-gray-300"} />
                        ))}
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm mb-2">"{review.comment}"</p>
                    <div className="flex flex-wrap gap-2">
                      {review.tags.map(tag => (
                        <span key={tag} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-500">{tag}</span>
                      ))}
                    </div>
                  </div>
                )) : (
                  <p className="text-gray-500 italic">Nenhuma avaliação ainda.</p>
                )}
              </div>
            </section>
          </div>

          {/* Sticky CTA for Mobile (rendered as sidebar on desktop) */}
          <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 md:static md:border-0 md:bg-transparent md:p-0 z-40">
            <div className="md:bg-white md:p-6 md:rounded-2xl md:shadow-sm md:border md:border-gray-100 md:sticky md:top-24">
               <div className="hidden md:block mb-4">
                 <span className="text-sm text-gray-500">Preço médio</span>
                 <div className="text-2xl font-bold text-primary">R$ {provider.services[0]?.priceMin} <span className="text-sm font-normal text-gray-400">/ {provider.services[0]?.unit}</span></div>
               </div>
               <button 
                 onClick={() => setIsModalOpen(true)}
                 className="w-full bg-primary text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 transition-transform active:scale-95 flex items-center justify-center gap-2"
               >
                 Solicitar Serviço
               </button>
               <button className="w-full mt-3 bg-white text-gray-700 border border-gray-200 font-medium py-3 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2">
                 <MessageCircle size={18} /> Chat (Dúvidas)
               </button>
               <p className="text-center text-xs text-gray-400 mt-3 hidden md:block">
                 Protótipo: pedidos e pagamentos ainda não são processados.
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Solicitar Orçamento</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleRequestSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Qual serviço?</label>
                <select 
                  value={selectedService} 
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {provider.services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Para quando?</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                   <label className="block text-sm font-medium text-gray-700">Detalhes do pedido</label>
                </div>
                <textarea
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                  placeholder="Descreva o que precisa ser feito..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                ></textarea>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-purple-700 transition-colors">
                  Enviar Solicitação
                </button>
                <p className="text-center text-xs text-gray-400 mt-2">
                  Demonstração: o pedido não é enviado ao profissional.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
