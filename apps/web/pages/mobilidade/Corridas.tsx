import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CarFront } from 'lucide-react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import { TripProgress } from '../../components/mobility/TripProgress';
import { RouteCases } from '../../components/mobility/RouteCases';
import { listRideRouteCases } from '../../services/rideRoutes';
import { RideCheckout } from '../../components/mobility/RideCheckout';
import { RideAftercare } from '../../components/mobility/RideAftercare';
import { useAuth } from '../../contexts/AuthContext';
import { formatCents } from '../../lib/money';
import { backendEnabled } from '../../lib/supabase';
import { APP_TIME_ZONE } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { getBooking, listMyBookings } from '../../services/bookings';
import { consentToRide, getRideDashboard, transitionRide, type RideLeg, type RidePayer, type RideQuote } from '../../services/rides';
import Ensaio from './Ensaio';
import QuoteForm from './QuoteForm';
import RideDriverIdentity from './RideDriverIdentity';

const fare = (value: number | null | undefined) => typeof value === 'number' ? formatCents(value) : 'Restrito ao pagador';
const payers: Record<RidePayer, string> = { passenger: 'Passageiro', client: 'Cliente', provider: 'Profissional' };
const formatTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: APP_TIME_ZONE });
const when = (iso: string) => formatTime.format(new Date(iso));
const statusNames: Record<string, string> = {
  requested: 'Aguardando motorista', offered: 'Em oferta', assigned: 'Motorista confirmado', accepted: 'Motorista confirmado',
  arriving: 'Motorista a caminho do embarque', boarded: 'Em viagem', completed: 'Viagem concluída', cancelled: 'Cancelada',
  unknown: 'Verificação pela operação', scheduled: 'Agendada', awaiting_consent: 'Aguardando aceites',
  declined: 'Recusada', expired: 'Expirada', superseded: 'Substituída', pending: 'Pendente',
};
const primary = 'rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
const secondary = 'rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 disabled:opacity-50';

function QuoteCard({ quote, now, servicePrice, canRequest, onChange }: { quote: RideQuote; now: number; servicePrice?: number; canRequest: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const sending = useRef(false);
  const expired = Date.parse(quote.expires_at) <= now;
  async function decide(accept: boolean) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await consentToRide(quote.id, accept);
      setNotice(accept ? (result.ride_id ? 'Solicitação registrada.' : 'Seu aceite foi registrado. Aguardando os demais participantes.') : 'Transporte recusado.');
      onChange();
    } catch (err) {
      setError(err);
      onChange();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return <article className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
    <h3 className="font-semibold">Proposta de transporte · {fare(quote.total_cents)}</h3>
    <p className="text-sm text-gray-600">Válida até {when(quote.expires_at)} (São Paulo). {expired && quote.status === 'awaiting_consent' ? 'Expirada. Solicite outra cotação.' : statusNames[quote.status] ?? quote.status}</p>
    {servicePrice !== undefined && <p className="text-sm">Serviço {fare(servicePrice)} · Mobilidade {fare(quote.total_cents)} · Total dos componentes {fare(servicePrice + quote.total_cents)}</p>}
    <ol className="space-y-3">{quote.legs.map(leg => <li key={leg.seq} className="border-l-2 border-primary/30 pl-3">
      <p>{leg.origin === 'Reservado ao passageiro' ? 'Trajeto reservado ao profissional' : `${leg.origin} → ${leg.destination}`}</p>
      <p className="text-sm text-gray-600">{leg.pickup_at ? when(leg.pickup_at) : 'Saída imediata'} · Pagador: {payers[leg.payer]}</p>
      {typeof leg.duration_minutes === 'number' && <p className="text-sm">
        Rede direta WorkEasy · {leg.duration_minutes} min{typeof leg.meters === 'number' && ` · ${(leg.meters / 1000).toLocaleString('pt-BR')} km`}
      </p>}
      <p className="text-sm">Preço {fare(leg.fare_cents)} · Extras incluídos {fare(leg.extras_cents)} · Limite {fare(leg.limit_cents)}</p>
    </li>)}</ol>
    {quote.required_from_me && quote.status === 'awaiting_consent' && !expired &&
      <div className="flex flex-wrap gap-3">
        {!quote.accepted_by_me && <button className={primary} disabled={busy || !canRequest} onClick={() => void decide(true)}>Aceitar transporte</button>}
        <button className={secondary} disabled={busy} onClick={() => void decide(false)}>{quote.accepted_by_me ? 'Retirar meu aceite' : 'Recusar transporte'}</button>
      </div>}
    {quote.accepted_by_me && quote.status === 'awaiting_consent' && <p>Seu aceite já foi registrado.</p>}
    {notice && <p role="status">{notice}</p>}
    <ErrorAlert error={error} />
  </article>;
}

function JourneyLeg({ leg, onChange, canCancel, simulation }: { leg: RideLeg; onChange: () => void; canCancel: boolean; simulation: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const cancelKey = useRef<string | null>(null);
  const active = !['completed', 'cancelled', 'unknown'].includes(leg.status);
  async function cancel() {
    setBusy(true);
    setFailure(null);
    cancelKey.current ??= crypto.randomUUID();
    try {
      await transitionRide(leg.id, 'cancelled', cancelKey.current);
      setConfirm(false);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
      onChange();
    }
  }
  return <li className="space-y-2 border-l-2 border-primary/30 pl-3">
    <p className="font-medium">{leg.origin === 'Reservado ao passageiro' ? 'Trajeto reservado ao profissional' : `${leg.origin} → ${leg.destination}`}</p>
    <p>{statusNames[leg.status] ?? leg.status} · {leg.pickup_at ? when(leg.pickup_at) : 'Saída imediata'}</p>
    <p className="text-sm">Pagador: {payers[leg.payer]} · Preço: {fare(leg.fare_cents)}</p>
    {leg.next_booking_id && <Link className="text-sm text-primary underline" to={`/atendimentos/${leg.next_booking_id}`}>Abrir meu atendimento seguinte</Link>}
    {leg.can_view_driver_identity && <RideDriverIdentity legId={leg.id} />}
    {leg.dispatch_state==='no_driver' && <p role="status">A busca terminou sem motorista disponível. Consulte o plantão para reagendar ou cancelar.</p>}
    {leg.pickup_estimate && <p>Previsão de embarque deste trecho: {when(leg.pickup_estimate)}.</p>}
    {leg.status === 'unknown' && <p className="rounded-xl bg-amber-50 p-3 text-sm">A operação está conferindo este trecho e os valores devidos. Aguarde a conciliação antes de solicitar outra viagem.</p>}
    <TripProgress legId={leg.id} />
    {leg.status === 'completed' && <RideCheckout legId={leg.id} simulation={simulation} />}
    <RideAftercare legId={leg.id} completed={leg.status === 'completed'} />
    {active && canCancel && (confirm ? <div className="space-y-2">
      <p>Solicitar cancelamento deste trecho? A operação apura os custos devidos. O atendimento tem regras próprias.</p>
      <button type="button" className={secondary} disabled={busy} onClick={() => void cancel()}>Confirmar cancelamento do trecho</button>{' '}
      <button type="button" className="underline" disabled={busy} onClick={() => setConfirm(false)}>Voltar</button>
    </div> : <button type="button" className="text-sm underline" onClick={() => setConfirm(true)}>Cancelar trecho</button>)}
    <ErrorAlert error={failure} />
  </li>;
}

function PassengerArea({ id, userId }: { id: string | null; userId: string }) {
  const result = useAsync(async () => {
    const [dashboard, booking] = await Promise.all([getRideDashboard(), id ? getBooking(id, userId) : Promise.resolve(null)]);
    return { dashboard, booking, loaded: Date.now() };
  }, JSON.stringify([id, userId]));
  const provider = result.data?.booking?.role === 'provider' && result.data.dashboard.quote_enabled;
  const laterBookings = useAsync(async () => {
    if (!provider || !id) return [];
    const current = result.data?.booking;
    const cutoff = Math.max(Date.now(), current?.when?.end.getTime() ?? 0);
    return (await listMyBookings(userId))
      .filter(b => b.id !== id && b.role === 'provider' && b.origin === 'platform' &&
        ['paid', 'accepted'].includes(b.status) && b.when && b.when.start.getTime() >= cutoff)
      .sort((a, b) => a.when!.start.getTime() - b.when!.start.getTime())
      .map(b => ({ id: b.id, label: b.when!.start.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' · ' + b.occupation_slug }));
  }, JSON.stringify([provider, id, userId]));
  const [notice, setNotice] = useState('');
  const caseAccess = !!result.data?.dashboard.quote_enabled && !result.data.dashboard.simulation;
  const cases = useAsync(() => caseAccess ? listRideRouteCases() : Promise.resolve([]), JSON.stringify([id, userId, caseAccess]));
  const [replacement, setReplacement] = useState<string | null>(null);
  const reload = result.reload;
  const enabled = result.data?.dashboard.enabled;
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (document.visibilityState === 'visible') reload(); };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, reload]);
  if (!result.data && result.loading) return <PageStatus />;
  if (!result.data) return <div className="mx-auto max-w-3xl space-y-3 px-4 py-8"><ErrorAlert error={result.error} /><button type="button" onClick={result.reload} className={secondary}>Tentar novamente</button></div>;
  const { dashboard, booking, loaded } = result.data;
  const linked = !!id;
  const canQuote = !linked || (booking?.role && booking.origin === 'platform' &&
    ['accepted', 'paid', 'in_progress'].includes(booking.status) && !dashboard.rides.some(ride => ride.booking_id === id));
  const routesFor = (bookingId: string | null) => (cases.data ?? []).filter(r =>
    r.booking_id === bookingId && r.can_quote && r.status === 'verified' && r.valid_until && Date.parse(r.valid_until) > loaded
  );
  const quotes = dashboard.quotes.filter(quote => !linked || quote.booking_id === id);
  const rides = dashboard.rides.filter(ride => ride.in_my_journeys && (!linked || ride.booking_id === id));
  return <section className="mx-auto max-w-3xl space-y-5 px-4 py-8 text-gray-800">
    {id && <Link to={`/atendimentos/${id}`} className="text-primary underline">Voltar ao atendimento</Link>}
    <header className="space-y-2">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><CarFront aria-hidden="true" />{linked ? 'Transporte do profissional' : 'Corridas'}</h1>
      {linked && <p>A mobilidade é opcional. Se houver outra forma de chegar, o atendimento pode seguir com o trajeto combinado.</p>}
      {dashboard.enabled && dashboard.simulation && <p role="status" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">Ambiente de ensaio. Os pontos, valores e viagens são fictícios. Use apenas contas de teste.</p>}
    </header>
    <ErrorAlert error={result.error} />
    {caseAccess && (canQuote || rides.some(ride => ride.legs.some(leg => leg.can_requote))) && <>
      <RouteCases bookingId={id} areas={dashboard.areas} isServiceClient={booking?.role === 'client'} onChange={cases.reload} />
      <ErrorAlert error={cases.error} />
    </>}
    {dashboard.enabled && dashboard.quote_enabled && canQuote && <QuoteForm requiresRoute={!dashboard.simulation} areas={dashboard.areas} bookingId={id} nextBookings={laterBookings.data} routes={routesFor(id)} extras={dashboard.extra_options} onQuoted={() => { setNotice('Cotação registrada. Confira os trechos e os pagadores abaixo.'); result.reload(); }} />}
    {(!dashboard.enabled || !dashboard.quote_enabled) && <p>Novas cotações estão indisponíveis neste ambiente.</p>}
    {dashboard.enabled && !dashboard.dispatch_enabled && <p>Reservas e chamadas de motoristas estão desativadas.</p>}
    {dashboard.enabled && !canQuote && <p>Este atendimento não permite uma nova solicitação de transporte.</p>}
    {notice && <p role="status">{notice}</p>}
    {quotes.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">Cotações</h2>{quotes.map(quote => <QuoteCard key={quote.id} quote={quote} now={loaded} servicePrice={booking?.price_cents} canRequest={dashboard.enabled && dashboard.dispatch_enabled} onChange={result.reload} />)}</section>}
    {rides.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">Viagens</h2>{rides.map(ride => <article key={ride.id} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="font-semibold">{ride.booking_id ? 'Viagem vinculada ao atendimento' : 'Corrida avulsa'}</h3>
      {ride.booking_id && <Link className="text-sm text-primary underline" to={`/atendimentos/${ride.booking_id}`}>Ver atendimento</Link>}
      <ol className="space-y-4">{ride.legs.map(leg => <JourneyLeg key={leg.id} leg={leg} canCancel={leg.can_cancel} simulation={dashboard.simulation} onChange={result.reload} />)}</ol>
      {dashboard.quote_enabled && ride.legs.filter(leg => leg.status === 'cancelled' && leg.can_requote).map(leg => <div key={leg.id}>
        {replacement === leg.id ? <>
          <QuoteForm requiresRoute={!dashboard.simulation} areas={dashboard.areas} bookingId={ride.booking_id} nextBookings={ride.booking_id === id ? laterBookings.data : undefined} routes={routesFor(ride.booking_id)} extras={dashboard.extra_options} replaces={leg.id} onQuoted={() => { setReplacement(null); setNotice('Nova cotação registrada. Confira o preço e autorize o novo trecho.'); reload(); }} />
          <button className="mt-2 underline" onClick={() => setReplacement(null)}>Fechar nova cotação</button>
        </> : <button className={secondary} onClick={() => setReplacement(leg.id)}>Recotar trecho cancelado {leg.seq}</button>}
      </div>)}
    </article>)}</section>}
    <div className="flex flex-wrap items-center gap-4"><button type="button" onClick={result.reload} disabled={result.loading} className={secondary}>Atualizar corridas</button>
    <Link className="text-primary underline" to="/corridas/motorista">Área do motorista</Link></div>
  </section>;
}

export default function Corridas() {
  const auth = useAuth();
  const { id } = useParams();
  if (!backendEnabled || auth.mode !== 'backend') return <Ensaio />;
  return <RequireSession><PassengerArea key={JSON.stringify([auth.authUser?.id, id])} id={id ?? null} userId={auth.authUser?.id ?? ''} /></RequireSession>;
}
