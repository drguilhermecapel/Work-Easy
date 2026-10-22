import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Star, MapPin, Video, ShieldCheck, ChevronLeft,
  ChevronRight, ThumbsUp, GraduationCap, Building, Stethoscope 
} from 'lucide-react';
import { MOCK_PROVIDERS } from '../constants';
import Avatar from '../components/Avatar';
import { dayIndexFromIso } from '../utils/date';
import { formatBRL } from '../utils/format';

const CALENDAR_DAYS = 4;
const MOCK_SLOTS = [
  { time: '08:00', available: true },
  { time: '09:30', available: true },
  { time: '11:00', available: false },
  { time: '14:00', available: true },
  { time: '15:30', available: true },
  { time: '17:00', available: false },
];

const DoctorProfile: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const provider = MOCK_PROVIDERS.find(p => p.id === id);

  const [activeTab, setActiveTab] = useState<'about' | 'insurance' | 'reviews'>('about');
  // Preselect the day of a slot chosen on the search card (`?slot=<ISO date>`)
  const [selectedDay, setSelectedDay] = useState(() => dayIndexFromIso(searchParams.get('slot'), CALENDAR_DAYS));

  if (!provider || !provider.medicalInfo) {
    return <div className="p-8 text-center">Médico não encontrado</div>;
  }

  const { medicalInfo } = provider;

  // Mock calendar: same slots every day, but times already past today are unavailable
  const now = new Date();
  const calendarDays = Array.from({ length: CALENDAR_DAYS }, (_, offset) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return {
      date: d,
      slots: MOCK_SLOTS.map(slot => {
        const [hours, minutes] = slot.time.split(':').map(Number);
        const slotStart = new Date(d);
        slotStart.setHours(hours, minutes, 0, 0);
        return { ...slot, available: slot.available && slotStart > now };
      }),
    };
  });

  const handleBooking = (time: string) => {
    const confirm = window.confirm(`Deseja agendar consulta com ${provider.name} às ${time}?`);
    if (confirm) {
      alert('Demonstração: nenhum agendamento real foi feito.');
      navigate('/dashboard');
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      {/* Breadcrumb / Nav */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center text-sm text-gray-500">
          <button onClick={() => navigate(-1)} className="mr-4 hover:text-teal-600">
            <ChevronLeft size={20} />
          </button>
          <span>Saúde</span>
          <ChevronRight size={14} className="mx-2" />
          <span>{medicalInfo.specialties[0]}</span>
          <ChevronRight size={14} className="mx-2" />
          <span className="text-gray-900 font-medium">{provider.name}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-3 gap-6">
        
        {/* Left Column: Profile Info */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Main Card */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 flex flex-col sm:flex-row gap-6">
            <div className="shrink-0">
              <Avatar name={provider.name} className="w-32 h-32 text-4xl border border-gray-100" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{provider.name}</h1>
              <p className="text-gray-600 text-lg">{provider.title}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={16} className={i < Math.round(provider.rating) ? "fill-current" : "text-gray-200 fill-gray-200"} />
                  ))}
                </div>
                <span className="text-sm font-bold underline cursor-pointer">{provider.totalReviews} opiniões</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">CRM: {medicalInfo.crm} · informado, não verificado</p>
              
              <div className="flex flex-wrap gap-2 mt-4">
                {medicalInfo.specialties.map(s => (
                  <span key={s} className="bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-x-auto">
            <button 
              onClick={() => setActiveTab('about')}
              className={`px-6 py-4 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === 'about' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              Sobre mim
            </button>
            <button 
              onClick={() => setActiveTab('insurance')}
              className={`px-6 py-4 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === 'insurance' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              Convênios
            </button>
            <button 
              onClick={() => setActiveTab('reviews')}
              className={`px-6 py-4 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === 'reviews' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              Opiniões
            </button>
          </div>

          {/* Content Area */}
          <div className="bg-white rounded-b-xl shadow-xs border border-gray-200 border-t-0 p-6 min-h-[300px]">
            {activeTab === 'about' && (
              <div className="space-y-8 animate-in fade-in">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg mb-3">Apresentação</h3>
                  <p className="text-gray-600 leading-relaxed">{provider.description}</p>
                </div>

                <div>
                   <h3 className="font-bold text-gray-800 text-lg mb-3 flex items-center gap-2">
                     <Stethoscope size={20} className="text-teal-500" /> Áreas de atuação (exemplo)
                   </h3>
                   <div className="flex flex-wrap gap-2">
                     {medicalInfo.diseases.map(d => (
                       <span key={d} className="px-3 py-1.5 bg-gray-100 rounded-sm text-gray-700 text-sm">{d}</span>
                     ))}
                   </div>
                </div>

                <div>
                   <h3 className="font-bold text-gray-800 text-lg mb-3 flex items-center gap-2">
                     <GraduationCap size={20} className="text-teal-500" /> Formação Acadêmica
                   </h3>
                   <ul className="space-y-2">
                     {medicalInfo.education.map((edu, idx) => (
                       <li key={idx} className="flex items-start gap-2 text-gray-600 text-sm">
                         <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 shrink-0"></div>
                         {edu}
                       </li>
                     ))}
                   </ul>
                </div>

                <div>
                   <h3 className="font-bold text-gray-800 text-lg mb-3 flex items-center gap-2">
                     <MapPin size={20} className="text-teal-500" /> Endereços
                   </h3>
                   <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                     <h4 className="font-bold text-gray-800">Consultório Principal</h4>
                     <p className="text-gray-600">{medicalInfo.address.street}</p>
                     <p className="text-gray-600">{medicalInfo.address.neighborhood} - {medicalInfo.address.city}, {medicalInfo.address.zip}</p>
                     <div className="mt-3 h-32 bg-gray-200 rounded-sm flex items-center justify-center text-gray-400 text-sm">
                        Mapa Interativo (Simulação)
                     </div>
                   </div>
                </div>
              </div>
            )}

            {activeTab === 'insurance' && (
              <div className="animate-in fade-in">
                <h3 className="font-bold text-gray-800 text-lg mb-4">Convênios Aceitos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {medicalInfo.insurances.map(ins => (
                    <div key={ins} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-teal-50 transition-colors cursor-default">
                      <ShieldCheck className="text-teal-500" size={20} />
                      <span className="text-gray-700 font-medium">{ins}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'reviews' && (
               <div className="space-y-6 animate-in fade-in">
                 <h3 className="font-bold text-gray-800 text-lg">O que os pacientes dizem</h3>
                 {provider.reviews.map(review => (
                   <div key={review.id} className="border-b border-gray-100 pb-6 last:border-0">
                     <div className="flex justify-between mb-2">
                        <div className="font-bold text-gray-800">{review.clientName}</div>
                        <div className="text-sm text-gray-400">{review.date}</div>
                     </div>
                     <div className="flex text-yellow-400 mb-2">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={14} className={i < review.rating ? "fill-current" : "text-gray-200 fill-gray-200"} />
                        ))}
                     </div>
                     <p className="text-gray-600 italic">"{review.comment}"</p>
                     <div className="flex gap-2 mt-3">
                       {review.tags.map(tag => (
                         <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-sm flex items-center gap-1">
                           <ThumbsUp size={10} /> {tag}
                         </span>
                       ))}
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>

        {/* Right Column: Sticky Booking Widget */}
        <div className="md:col-span-1">
           <div className="bg-white rounded-xl shadow-lg border border-teal-100 p-4 sticky top-24">
              <h3 className="font-bold text-gray-800 mb-4 text-center">Agende sua consulta</h3>
              
              {/* Type Selector */}
              <div className="flex gap-2 mb-4">
                 <button className="flex-1 py-2 text-xs font-bold border border-teal-600 bg-teal-50 text-teal-700 rounded-lg flex items-center justify-center gap-1">
                   <Building size={14} /> Presencial
                 </button>
                 <button
                   disabled
                   title="Teleconsulta: funcionalidade futura"
                   className="flex-1 py-2 text-xs font-medium border border-gray-200 text-gray-400 rounded-lg flex items-center justify-center gap-1 cursor-not-allowed"
                 >
                   <Video size={14} /> Teleconsulta (em breve)
                 </button>
              </div>

              {/* Price */}
              <div className="bg-gray-50 p-3 rounded-lg text-center mb-4">
                <span className="text-gray-500 text-xs uppercase font-bold">Valor da consulta</span>
                <div className="text-xl font-bold text-gray-900">
                  {medicalInfo.inPersonPrice !== undefined ? formatBRL(medicalInfo.inPersonPrice) : 'A combinar'}
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2 px-1">
                  <button 
                    disabled={selectedDay === 0}
                    onClick={() => setSelectedDay(d => Math.max(0, d - 1))}
                    className="p-1 hover:bg-gray-100 rounded-sm disabled:opacity-30"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="font-bold text-gray-700 text-sm">
                    {calendarDays[selectedDay].date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  <button 
                    disabled={selectedDay === calendarDays.length - 1}
                    onClick={() => setSelectedDay(d => Math.min(calendarDays.length - 1, d + 1))}
                    className="p-1 hover:bg-gray-100 rounded-sm disabled:opacity-30"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {calendarDays[selectedDay].slots.map((slot, idx) => (
                    <button
                      key={idx}
                      disabled={!slot.available}
                      onClick={() => handleBooking(slot.time)}
                      className={`py-2 text-sm font-medium rounded-md transition-colors ${
                        slot.available 
                        ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-xs' 
                        : 'bg-gray-100 text-gray-300 cursor-not-allowed box-decoration-slice line-through'
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="text-center text-xs text-gray-400">
                <p>
                  Agendar não tem custo para o paciente. O valor da consulta é mostrado antes da confirmação.
                </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorProfile;