import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardList, Inbox } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { formatCents } from '../../lib/money';
import { todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { getPolicies, listMyDocuments, listMyNeighborhoodIds, listMyOccupations } from '../../services/providers';
import { listAvailability, listMyBookings, type BookingView } from '../../services/proAgenda';
import { listOpenRequests } from '../../services/proMarketplace';
import { listMyServices } from '../../services/proServices';
import type { ProviderRow } from '../../services/types';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import ProPage from '../../components/pro/ProPage';
import { useProvider } from '../../components/pro/proContext';
import { Badge, Card, EmptyState, SectionTitle } from '../../components/pro/ui';
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_STYLES, PROVIDER_STATUS_HELP, PROVIDER_STATUS_LABELS, PROVIDER_STATUS_STYLES } from '../../components/pro/labels';
import { computePendencies } from '../../components/pro/pendencies';
import { dayRange, formatPeriodBR, overlaps, weekRange } from '../../services/proFormat';
import { linkClass } from '../../components/pro/styles';

/** Runs a read that may fail on its own (e.g. RLS) without taking the whole panel down. */
const settle = async <T,>(read: () => Promise<T>, fallback: T, errors: unknown[]): Promise<T> => {
  try {
    return await read();
  } catch (err) {
    errors.push(err);
    return fallback;
  }
};

const loadPanel = async (provider: ProviderRow) => {
  const errors: unknown[] = [];
  const approved = provider.status === 'approved';
  const [bookings, occupations, neighborhoodIds, documents, services, availability, requests] = await Promise.all([
    settle(() => listMyBookings(provider.id), [], errors),
    settle(() => listMyOccupations(provider.id), [], errors),
    settle(() => listMyNeighborhoodIds(provider.id), [], errors),
    settle(() => listMyDocuments(provider.id), [], errors),
    settle(() => listMyServices(provider.id), [], errors),
    settle(() => listAvailability(provider.id), [], errors),
    // Only an approved provider receives requests; the function answers empty for the others
    approved ? settle(() => listOpenRequests(), [], errors) : Promise.resolve([]),
  ]);
  const policies = await settle(() => getPolicies(occupations.map(item => item.occupation_slug)), {}, errors);
  const today = todayInSaoPaulo();
  const day = dayRange(today);
  const week = weekRange(today);
  const live = bookings.filter(item => item.status !== 'canceled');
  return {
    error: errors[0] ?? null,
    today: live.filter(item => overlaps(item.period, day)),
    laterThisWeek: live.filter(item => item.period.start >= day.end && overlaps(item.period, week)),
    openRequests: requests.filter(item => item.my_proposal_id === null).length,
    pendencies: computePendencies({
      provider,
      occupations,
      policies,
      documents,
      neighborhoodCount: neighborhoodIds.length,
      services,
      availabilityCount: availability.length,
    }),
  };
};

const BookingList: React.FC<{ items: BookingView[]; empty: string }> = ({ items, empty }) =>
  items.length === 0 ? (
    <p className="text-sm text-gray-500">{empty}</p>
  ) : (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm border-b border-gray-50 pb-2 last:border-0">
          <span className="font-medium text-gray-800">{formatPeriodBR(item.period)}</span>
          <span className="text-gray-600">
            {item.clientName ?? 'Cliente'} · {findOccupation(item.occupation_slug)?.name ?? item.occupation_slug} · {formatCents(item.price_cents)}
          </span>
          <Badge className={BOOKING_STATUS_STYLES[item.status]}>{BOOKING_STATUS_LABELS[item.status]}</Badge>
        </li>
      ))}
    </ul>
  );

const Panel: React.FC = () => {
  const { provider } = useProvider();
  // The status and plan are part of the key: they change on the server and the panel must follow
  const panel = useAsync(() => loadPanel(provider), `${provider.id}:${provider.status}`);
  const approved = provider.status === 'approved';

  return (
    <div className="space-y-5">
      <Card as="section">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h2 className="text-lg font-bold text-gray-800">Seu cadastro</h2>
          <Badge className={PROVIDER_STATUS_STYLES[provider.status]}>{PROVIDER_STATUS_LABELS[provider.status]}</Badge>
          <Badge className={provider.plan === 'pro' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}>
            {provider.plan === 'pro' ? 'Plano Pro' : 'Plano grátis'}
          </Badge>
        </div>
        <p className="text-sm text-gray-600">{PROVIDER_STATUS_HELP[provider.status]}</p>
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <Link to="/pro/cadastro" className={linkClass}>Cadastro</Link>
          {approved && <Link to={`/p/${provider.slug}`} className={linkClass}>Ver minha página</Link>}
          <Link to="/pro/assinatura" className={linkClass}>{provider.plan === 'pro' ? 'Minha assinatura' : 'Conhecer o plano Pro'}</Link>
        </div>
      </Card>

      {panel.loading && !panel.data ? (
        <PageStatus />
      ) : (
        panel.data && (
          <>
            <ErrorAlert error={panel.error ?? panel.data.error} />
            <div className="grid md:grid-cols-2 gap-5">
              <Card as="section">
                <SectionTitle id="painel-hoje">
                  <span className="inline-flex items-center gap-2"><CalendarDays size={18} className="text-primary" aria-hidden="true" /> Hoje</span>
                </SectionTitle>
                <BookingList items={panel.data.today} empty="Nenhum atendimento hoje." />
              </Card>
              <Card as="section">
                <SectionTitle id="painel-semana">Nos próximos dias da semana</SectionTitle>
                <BookingList items={panel.data.laterThisWeek} empty="Nenhum atendimento nos próximos dias desta semana." />
                <Link to="/pro/agenda" className={`${linkClass} text-sm inline-block mt-3`}>Abrir a agenda</Link>
              </Card>
              <Card as="section">
                <SectionTitle id="painel-pedidos">
                  <span className="inline-flex items-center gap-2"><Inbox size={18} className="text-primary" aria-hidden="true" /> Pedidos abertos</span>
                </SectionTitle>
                {approved ? (
                  <p className="text-sm text-gray-700">
                    {panel.data.openRequests === 0
                      ? 'Nenhum pedido novo para os seus bairros e ocupações agora.'
                      : `${panel.data.openRequests} ${panel.data.openRequests === 1 ? 'pedido espera' : 'pedidos esperam'} a sua proposta.`}{' '}
                    <Link to="/pro/pedidos" className={linkClass}>Ver pedidos</Link>
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">Os pedidos aparecem aqui depois que o seu cadastro for aprovado.</p>
                )}
              </Card>
              <Card as="section">
                <SectionTitle id="painel-pendencias">
                  <span className="inline-flex items-center gap-2"><ClipboardList size={18} className="text-primary" aria-hidden="true" /> Pendências do cadastro</span>
                </SectionTitle>
                {panel.data.pendencies.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 size={16} aria-hidden="true" /> Nada pendente.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {panel.data.pendencies.map(item => (
                      <li key={item.id}>
                        <Link to={item.to} className="text-gray-800 hover:text-primary">
                          {item.text}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            {panel.data.today.length + panel.data.laterThisWeek.length === 0 && !approved && (
              <EmptyState>Sua agenda ainda está vazia. Ela mostra os seus atendimentos assim que houver algum.</EmptyState>
            )}
          </>
        )
      )}
    </div>
  );
};

const Painel: React.FC = () => (
  <ProPage title="Painel do profissional" banner={false}>
    <Panel />
  </ProPage>
);

export default Painel;
