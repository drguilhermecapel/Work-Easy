import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus, Clock, MapPin, Star } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { backendEnabled } from '../../lib/supabase';
import { formatDateBR } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { getProviderPage, type PageAvailability, type ProviderPage } from '../../services/discovery';
import Avatar from '../../components/Avatar';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RegistryNote from '../../components/cliente/RegistryNote';
import { Stars } from '../../components/cliente/Stars';
import { WEEKDAYS, formatDuration, formatPriceRange, shortTime } from '../../components/cliente/format';
import { cardClass, primaryButton, secondaryButton } from '../../components/cliente/styles';

/** "Segunda-feira: 08:00 às 12:00, 14:00 às 18:00", in weekday order. */
const scheduleByDay = (availability: PageAvailability[]): Array<{ weekday: number; slots: string[] }> => {
  const days = new Map<number, string[]>();
  for (const a of availability) {
    days.set(a.weekday, [...(days.get(a.weekday) ?? []), `${shortTime(a.start_time)} às ${shortTime(a.end_time)}`]);
  }
  return [...days.entries()].sort(([a], [b]) => a - b).map(([weekday, slots]) => ({ weekday, slots }));
};

const average = (ratings: number[]): number => ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

const Page: React.FC<{ page: ProviderPage }> = ({ page }) => {
  const { provider, occupations, neighborhoods, services, availability, reviews } = page;
  const primary = occupations[0];
  const canBook = services.length > 0 && availability.length > 0;
  const schedule = scheduleByDay(availability);
  const publicRatings = occupations.some(o => o.rating_ranking);

  useEffect(() => {
    const previous = document.title;
    document.title = `${provider.display_name} | WorkEasy`;
    return () => {
      document.title = previous;
    };
  }, [provider.display_name]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <header className={`${cardClass} flex flex-col sm:flex-row gap-4 sm:items-start`}>
        <Avatar name={provider.display_name} className="w-16 h-16 text-xl shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-2xl font-bold text-gray-800 break-words">{provider.display_name}</h1>
          {occupations.length > 0 && (
            <p className="text-sm text-gray-600">{occupations.map(o => o.name).join(' · ')}</p>
          )}
          {provider.base_neighborhood && (
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <MapPin size={14} className="shrink-0" aria-hidden="true" /> {provider.base_neighborhood.name}, São Paulo
            </p>
          )}
          {provider.bio && <p className="text-sm text-gray-700 whitespace-pre-line break-words">{provider.bio}</p>}
          <div className="flex flex-wrap gap-3 pt-1">
            {canBook && (
              <Link to={`/agendar/${encodeURIComponent(provider.slug)}`} className={`${primaryButton} no-underline`}>
                <CalendarPlus size={16} aria-hidden="true" /> Agendar
              </Link>
            )}
            {primary && (
              <Link to={`/pedido?servico=${encodeURIComponent(primary.slug)}`} className={`${canBook ? secondaryButton : primaryButton} no-underline`}>
                Pedir este serviço
              </Link>
            )}
          </div>
        </div>
      </header>

      <section aria-labelledby="prestador-profissao" className={`${cardClass} space-y-3`}>
        <h2 id="prestador-profissao" className="font-bold text-gray-800">Profissão e registro</h2>
        <ul className="space-y-2">
          {occupations.map(o => (
            <li key={o.slug} className="text-sm">
              <p className="font-medium text-gray-800">{findOccupation(o.slug)?.name ?? o.name}</p>
              <RegistryNote status={o.registry_status} registryName={o.registry_name} number={o.registry_number} uf={o.registry_uf} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">
          “Informado” é o que o próprio profissional declarou. “Confirmado pelo WorkEasy” aparece só depois que a equipe conferiu o registro.
        </p>
      </section>

      <section aria-labelledby="prestador-servicos" className={`${cardClass} space-y-3`}>
        <h2 id="prestador-servicos" className="font-bold text-gray-800">Serviços</h2>
        {services.length === 0 ? (
          <p className="text-sm text-gray-500">Este profissional ainda não cadastrou serviços com preço.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {services.map(service => (
              <li key={service.id} className="py-3 first:pt-0 last:pb-0">
                <p className="font-medium text-gray-900 break-words">{service.title}</p>
                {service.description && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line break-words">{service.description}</p>}
                <p className="text-sm text-gray-800 mt-1 font-semibold">
                  {formatPriceRange(service.price_min_cents, service.price_max_cents, service.unit)}
                </p>
                {service.duration_minutes && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock size={12} aria-hidden="true" /> Duração estimada: {formatDuration(service.duration_minutes)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="prestador-agenda" className={`${cardClass} space-y-3`}>
        <h2 id="prestador-agenda" className="font-bold text-gray-800 flex items-center gap-2">
          <CalendarClock size={18} className="text-primary" aria-hidden="true" /> Disponibilidade semanal
        </h2>
        {schedule.length === 0 ? (
          <p className="text-sm text-gray-500">Este profissional ainda não informou os horários de atendimento.</p>
        ) : (
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {schedule.map(day => (
              <div key={day.weekday}>
                <dt className="text-gray-500">{WEEKDAYS[day.weekday]}</dt>
                <dd className="text-gray-800">{day.slots.join(', ')}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-xs text-gray-500">Horário de Brasília. Os horários livres de cada dia aparecem ao agendar.</p>
      </section>

      {neighborhoods.length > 0 && (
        <section aria-labelledby="prestador-bairros" className={`${cardClass} space-y-2`}>
          <h2 id="prestador-bairros" className="font-bold text-gray-800">Bairros atendidos</h2>
          <p className="text-sm text-gray-700">{neighborhoods.map(n => n.name).join(', ')}</p>
        </section>
      )}

      <section aria-labelledby="prestador-avaliacoes" className={`${cardClass} space-y-3`}>
        <h2 id="prestador-avaliacoes" className="font-bold text-gray-800 flex items-center gap-2">
          <Star size={18} className="text-amber-500" aria-hidden="true" /> Avaliações
        </h2>
        {!publicRatings ? (
          <p className="text-sm text-gray-500">Nesta profissão, as avaliações de clientes não são exibidas publicamente.</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-gray-500">Ainda não há avaliações publicadas.</p>
        ) : (
          <>
            <p className="text-sm text-gray-700 flex flex-wrap items-center gap-2">
              <Stars value={average(reviews.map(r => r.rating))} />
              <span>
                {average(reviews.map(r => r.rating)).toFixed(1).replace('.', ',')} em {reviews.length}{' '}
                {reviews.length === 1 ? 'avaliação' : 'avaliações'}
              </span>
            </p>
            <ul className="divide-y divide-gray-100">
              {reviews.map((review, index) => (
                <li key={`${review.created_at}-${index}`} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <Stars value={review.rating} />
                    <span>{findOccupation(review.occupation_slug)?.name ?? review.occupation_slug} · {formatDateBR(review.created_at)}</span>
                  </p>
                  {review.comment && <p className="text-sm text-gray-700 whitespace-pre-line break-words">{review.comment}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
};

const PaginaPrestador: React.FC = () => {
  const { slug = '' } = useParams();
  const result = useAsync(() => (backendEnabled ? getProviderPage(slug) : Promise.resolve(null)), `${backendEnabled}:${slug}`);

  if (!backendEnabled) {
    return (
      <BackendNotice title="Páginas de profissionais ainda não disponíveis">
        <p>Nesta versão de demonstração, os profissionais mostrados são fictícios e não têm página própria.</p>
      </BackendNotice>
    );
  }
  if (result.loading && !result.data && !result.error) return <PageStatus />;
  if (result.error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <ErrorAlert error={result.error} />
        <Link to="/categorias" className="text-sm text-primary underline">Ver categorias</Link>
      </div>
    );
  }
  if (!result.data) {
    return (
      <BackendNotice title="Página não encontrada">
        <p>Não encontramos um profissional com este endereço. Ele pode ter mudado o link ou ainda não estar disponível.</p>
      </BackendNotice>
    );
  }
  return <Page page={result.data} />;
};

export default PaginaPrestador;
