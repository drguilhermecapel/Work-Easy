import React, { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { todayInSaoPaulo } from '../../lib/timezone';
import type { Period } from '../../lib/tstzrange';
import { useAsync } from '../../lib/useAsync';
import { NOTES_MAX, availableSlots, bookDirect, getProviderPage, type PageService, type ProviderPage } from '../../services/discovery';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import TermsGate from '../../components/TermsGate';
import { formatDuration, formatLongDay, formatPriceRange, formatTime } from '../../components/cliente/format';
import { cardClass, inputClass, primaryButton } from '../../components/cliente/styles';

/** When a service has no duration, slots are looked up for one hour. */
const DEFAULT_DURATION = 60;

const slotKey = (period: Period): string => period.start.toISOString();

const BookingForm: React.FC<{ page: ProviderPage; userId: string | null }> = ({ page, userId }) => {
  const location = useLocation();
  const { provider, services } = page;
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : '');
  const [day, setDay] = useState('');
  const [chosen, setChosen] = useState<Period | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  const service: PageService | undefined = services.find(s => s.id === serviceId);
  const duration = service?.duration_minutes ?? DEFAULT_DURATION;
  const ready = service !== undefined && day !== '';
  const slots = useAsync(
    () => (ready ? availableSlots(provider.id, day, duration) : Promise.resolve([] as Period[])),
    ready ? `${provider.id}:${day}:${duration}` : 'idle',
  );
  // A selected slot that the refreshed list no longer has is dropped
  const selected = chosen && (slots.data ?? []).some(s => slotKey(s) === slotKey(chosen)) ? chosen : null;

  // Not a <form>: the terms gate renders its own form when the terms are pending
  const submit = async () => {
    if (!service || !selected) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await bookDirect({ providerId: provider.id, serviceId: service.id, period: selected, notes }));
    } catch (err) {
      setError(err);
      setChosen(null);
      slots.reload(); // the slot may have been taken meanwhile
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="bg-green-50 border border-green-100 text-green-800 rounded-2xl p-5 text-sm space-y-2">
        <p className="font-semibold flex items-center gap-2">
          <CheckCircle2 size={16} aria-hidden="true" /> Pedido de agendamento enviado.
        </p>
        <p>{provider.display_name} precisa aceitar o horário. Acompanhe a resposta em Meus atendimentos.</p>
        <Link to={`/atendimentos/${done}`} className="underline inline-block">Ver atendimento</Link>
      </div>
    );
  }

  const next = `${location.pathname}${location.search}`;

  return (
    <div className="space-y-5">
      <section className={`${cardClass} space-y-3`}>
        <h2 className="font-bold text-gray-800">1. Escolha o serviço</h2>
        <ul className="space-y-2">
          {services.map(s => (
            <li key={s.id}>
              <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="servico"
                  value={s.id}
                  checked={serviceId === s.id}
                  onChange={() => {
                    setServiceId(s.id);
                    setChosen(null);
                  }}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="font-medium break-words">{s.title}</span>
                  <span className="block text-xs text-gray-500">
                    {formatPriceRange(s.price_min_cents, s.price_max_cents, s.unit)}
                    {s.duration_minutes ? ` · ${formatDuration(s.duration_minutes)}` : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${cardClass} space-y-3`}>
        <h2 className="font-bold text-gray-800">2. Escolha o dia e o horário</h2>
        <div className="max-w-xs">
          <label htmlFor="agendar-dia" className="block text-sm text-gray-700 mb-1">Dia</label>
          <input
            id="agendar-dia"
            type="date"
            min={todayInSaoPaulo()}
            className={inputClass}
            value={day}
            onChange={e => {
              setDay(e.target.value);
              setChosen(null);
            }}
          />
        </div>
        <p className="text-xs text-gray-500">Horário de Brasília.{service && !service.duration_minutes && ' Sem duração cadastrada: mostramos horários de 1 hora.'}</p>
        {!ready && <p className="text-sm text-gray-500">Escolha o serviço e o dia para ver os horários livres.</p>}
        {ready && slots.loading && !slots.data && <PageStatus text="Buscando horários…" />}
        {ready && slots.data && slots.data.length === 0 && (
          <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-3">
            Não há horários livres neste dia. Tente outro dia.
          </p>
        )}
        {ready && slots.data && slots.data.length > 0 && (
          <fieldset className="border-0 p-0 m-0">
            <legend className="text-sm text-gray-700 mb-2">{formatLongDay(slots.data[0].start)}</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {slots.data.map(slot => (
                <button
                  key={slotKey(slot)}
                  type="button"
                  aria-pressed={selected !== null && slotKey(selected) === slotKey(slot)}
                  onClick={() => setChosen(slot)}
                  className={`flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl border px-2 py-2.5 ${
                    selected !== null && slotKey(selected) === slotKey(slot)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Clock size={14} aria-hidden="true" />
                  {formatTime(slot.start)} – {formatTime(slot.end)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {ready && slots.error && !error && <ErrorAlert error={slots.error} />}
      </section>

      <section className={`${cardClass} space-y-3`}>
        <h2 className="font-bold text-gray-800">3. Confirme</h2>
        {service && selected ? (
          <p className="text-sm text-gray-700">
            <strong>{service.title}</strong> com {provider.display_name}, {formatLongDay(selected.start)}, das {formatTime(selected.start)} às{' '}
            {formatTime(selected.end)}. O atendimento será registrado pelo valor inicial do serviço ({formatPriceRange(service.price_min_cents, null, service.unit)}).
            Esse valor não é multiplicado pela duração do horário: o valor final é combinado com o profissional.
          </p>
        ) : (
          <p className="text-sm text-gray-500">Escolha um horário para continuar.</p>
        )}
        <div>
          <label htmlFor="agendar-notas" className="block text-sm text-gray-700 mb-1">Observações para o profissional (opcional)</label>
          <textarea
            id="agendar-notas"
            rows={3}
            maxLength={NOTES_MAX}
            className={inputClass}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
        <ErrorAlert error={error} />
        {userId ? (
          <TermsGate userId={userId}>
            <button type="button" className={primaryButton} disabled={busy || !selected} onClick={() => void submit()}>
              {busy ? 'Enviando…' : 'Pedir este horário'}
            </button>
          </TermsGate>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Para pedir o horário, entre na sua conta.</p>
            <Link to={`/entrar?next=${encodeURIComponent(next)}`} className={`${primaryButton} no-underline`}>
              Entrar para agendar
            </Link>
          </div>
        )}
        <p className="text-xs text-gray-500">O profissional precisa aceitar o horário antes de o atendimento ficar confirmado.</p>
      </section>
    </div>
  );
};

const Agendar: React.FC = () => {
  const { slug = '' } = useParams();
  const auth = useAuth();
  const page = useAsync(() => (backendEnabled ? getProviderPage(slug) : Promise.resolve(null)), `${backendEnabled}:${slug}`);

  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Agendamento online ainda não disponível">
        <p>Nesta versão de demonstração, não é possível agendar horários de verdade.</p>
      </BackendNotice>
    );
  }
  // Wait for the session too: otherwise a signed-in user would first see "Entrar para agendar"
  if (auth.loading || (page.loading && !page.data && !page.error)) return <PageStatus />;
  if (page.error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <ErrorAlert error={page.error} />
        <Link to="/categorias" className="text-sm text-primary underline">Ver categorias</Link>
      </div>
    );
  }
  if (!page.data) {
    return (
      <BackendNotice title="Profissional não encontrado">
        <p>Não encontramos um profissional com este endereço.</p>
      </BackendNotice>
    );
  }
  const data = page.data;
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <Link to={`/p/${encodeURIComponent(data.provider.slug)}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary">
        <ChevronLeft size={16} aria-hidden="true" /> Página de {data.provider.display_name}
      </Link>
      <h1 className="text-2xl font-bold text-gray-800">Agendar com {data.provider.display_name}</h1>
      {data.services.length === 0 || data.availability.length === 0 ? (
        <p className="text-sm text-gray-600 bg-white border border-gray-100 rounded-2xl p-5">
          Este profissional ainda não tem serviços e horários cadastrados para agendamento direto. Você pode{' '}
          <Link to="/pedido" className="text-primary underline">fazer um pedido</Link> e receber propostas.
        </p>
      ) : (
        <BookingForm page={data} userId={auth.authUser?.id ?? null} />
      )}
    </div>
  );
};

export default Agendar;
