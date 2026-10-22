import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { loadPublicSettings } from '../../config/features';
import { AppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { getPolicies, listMyOccupations } from '../../services/providers';
import {
  addAvailability,
  addTimeOff,
  createOwnBooking,
  listAvailability,
  listMyBookings,
  listTimeOff,
  removeAvailability,
  removeTimeOff,
  transitionBooking,
  type BookingStatus,
  type BookingView,
} from '../../services/proAgenda';
import { listClients } from '../../services/proClients';
import { WEEKDAY_LABELS, formatDaysBR, formatPeriodBR, parseReaisToCents } from '../../services/proFormat';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import ProPage from '../../components/pro/ProPage';
import { useProvider } from '../../components/pro/proContext';
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_STYLES } from '../../components/pro/labels';
import { Badge, Card, ConfirmButton, EmptyState, Field, SectionTitle } from '../../components/pro/ui';
import { inputClass, linkClass, primaryButton, secondaryButton } from '../../components/pro/styles';

/** Monday first, as the Brazilian week is read; the value is availability.weekday (0 = Sunday). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const load = async (providerId: string) => {
  const [bookings, availability, timeOff, clients, occupations, settings] = await Promise.all([
    listMyBookings(providerId),
    listAvailability(providerId),
    listTimeOff(providerId),
    listClients(providerId),
    listMyOccupations(providerId),
    loadPublicSettings(),
  ]);
  const policies = await getPolicies(occupations.map(item => item.occupation_slug));
  return { bookings, availability, timeOff, clients, occupations, policies, settings, now: Date.now(), today: todayInSaoPaulo() };
};

type Data = Awaited<ReturnType<typeof load>>;

// ---- Labor rule notice ----------------------------------------------------------

const LaborLockNotice: React.FC<{ data: Data }> = ({ data }) => {
  const locked = data.occupations.filter(item => data.policies[item.occupation_slug]?.laborLock);
  if (locked.length === 0) return null;
  const limit = data.settings.laborLockDaysPerWeek;
  const names = locked.map(item => findOccupation(item.occupation_slug)?.name ?? item.occupation_slug).join(', ');
  return (
    <section role="note" aria-labelledby="agenda-trava" className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-gray-700 space-y-1">
      <h2 id="agenda-trava" className="flex items-center gap-2 font-semibold text-gray-800">
        <Scale size={16} className="text-amber-700" aria-hidden="true" /> Limite de {limit} dias por semana com o mesmo cliente
      </h2>
      <p>
        {names}: a lei pode tratar o trabalho doméstico em mais de {limit} dias por semana na mesma casa como relação de emprego (LC 150/2015).
        Por isso o WorkEasy não deixa marcar mais de {limit} dias diferentes na mesma semana (de segunda a domingo) com o mesmo cliente.
        Atendimentos cancelados não contam. Quando o limite é atingido, a tela avisa e o atendimento não é criado.
      </p>
    </section>
  );
};

// ---- Weekly availability ----------------------------------------------------------

const AvailabilitySection: React.FC<{ providerId: string; data: Data; onChanged: () => void }> = ({ providerId, data, onChanged }) => {
  const [weekday, setWeekday] = useState('1');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addAvailability({ providerId, weekday: Number(weekday), start, end });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await removeAvailability(id);
      onChanged();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Card as="section">
      <SectionTitle id="agenda-disponibilidade">Horários da semana</SectionTitle>
      <p className="text-sm text-gray-600 mb-3">Os dias e horários em que você atende, no horário de Brasília. Os clientes só marcam dentro deles.</p>
      {data.availability.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">Você ainda não definiu horários.</p>
      ) : (
        <ul className="mb-4 divide-y divide-gray-50">
          {WEEK_ORDER.map(day => {
            const windows = data.availability.filter(item => item.weekday === day);
            if (windows.length === 0) return null;
            return (
              <li key={day} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="w-32 font-medium text-gray-800">{WEEKDAY_LABELS[day]}</span>
                {windows.map(item => (
                  <span key={item.id} className="inline-flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1">
                    {item.start_time} às {item.end_time}
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      onClick={() => remove(item.id)}
                      aria-label={`Remover ${WEEKDAY_LABELS[day]}, ${item.start_time} às ${item.end_time}`}
                    >
                      remover
                    </button>
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end" noValidate aria-label="Adicionar horário">
        <Field id="disp-dia" label="Dia da semana" className="col-span-2 sm:col-span-1">
          <select id="disp-dia" className={inputClass} value={weekday} onChange={e => setWeekday(e.target.value)}>
            {WEEK_ORDER.map(day => (
              <option key={day} value={day}>
                {WEEKDAY_LABELS[day]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="disp-inicio" label="Das">
          <input id="disp-inicio" type="time" className={inputClass} value={start} onChange={e => setStart(e.target.value)} />
        </Field>
        <Field id="disp-fim" label="Até">
          <input id="disp-fim" type="time" className={inputClass} value={end} onChange={e => setEnd(e.target.value)} />
        </Field>
        <button type="submit" className={`${secondaryButton} col-span-2 sm:col-span-1`} disabled={busy}>
          Adicionar horário
        </button>
      </form>
      <ErrorAlert error={error} className="mt-3" />
    </Card>
  );
};

// ---- Time off -----------------------------------------------------------------------

const TimeOffSection: React.FC<{ providerId: string; data: Data; onChanged: () => void }> = ({ providerId, data, onChanged }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addTimeOff({ providerId, fromDay: from, toDay: to || from });
      setFrom('');
      setTo('');
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await removeTimeOff(id);
      onChanged();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Card as="section">
      <SectionTitle id="agenda-folgas">Folgas</SectionTitle>
      <p className="text-sm text-gray-600 mb-3">Dias em que você não atende. Nesses dias ninguém consegue marcar horário com você.</p>
      {data.timeOff.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">Nenhuma folga marcada.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {data.timeOff.map(item => (
            <li key={item.id} className="flex items-center gap-3 text-sm">
              <span>{formatDaysBR(item.period)}</span>
              <button type="button" className="text-xs text-red-700 underline" onClick={() => remove(item.id)} aria-label={`Remover folga de ${formatDaysBR(item.period)}`}>
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end" noValidate aria-label="Adicionar folga">
        <Field id="folga-de" label="Primeiro dia">
          <input id="folga-de" type="date" min={data.today} className={inputClass} value={from} onChange={e => setFrom(e.target.value)} />
        </Field>
        <Field id="folga-ate" label="Último dia" hint="Vazio = só o primeiro dia.">
          <input id="folga-ate" type="date" min={from || data.today} className={inputClass} value={to} onChange={e => setTo(e.target.value)} />
        </Field>
        <button type="submit" className={`${secondaryButton} col-span-2 sm:col-span-1`} disabled={busy}>
          Adicionar folga
        </button>
      </form>
      <ErrorAlert error={error} className="mt-3" />
    </Card>
  );
};

// ---- New own booking ----------------------------------------------------------------

const NewBookingSection: React.FC<{ data: Data; initialClient: string; onCreated: () => void }> = ({ data, initialClient, onCreated }) => {
  // create_own_booking only takes CRM entries the provider brought (origin 'own'); the others came by the platform
  const ownClients = data.clients.filter(client => client.origin === 'own');
  const knownClient = ownClients.some(client => client.id === initialClient) ? initialClient : '';
  const [client, setClient] = useState(knownClient);
  const [occupation, setOccupation] = useState(data.occupations.find(item => item.is_primary)?.occupation_slug ?? data.occupations[0]?.occupation_slug ?? '');
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(false);
    try {
      const priceCents = parseReaisToCents(price);
      if (priceCents === null) throw new AppError('invalid_input', { message: 'Informe o valor combinado em reais, por exemplo 150,00.' });
      await createOwnBooking({ providerClientId: client, occupationSlug: occupation, day, start, end, priceCents, notes });
      setCreated(true);
      setDay('');
      setStart('');
      setEnd('');
      setPrice('');
      setNotes('');
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section">
      <SectionTitle id="agenda-novo">Novo atendimento com cliente seu</SectionTitle>
      {ownClients.length === 0 ? (
        <p className="text-sm text-gray-600">
          Para marcar um atendimento, primeiro cadastre um cliente seu em{' '}
          <Link to="/pro/clientes" className={linkClass}>Clientes</Link>.
          {data.clients.length > 0 && ' Quem chegou pelo WorkEasy é atendido pelos pedidos, não por aqui.'}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate aria-label="Novo atendimento">
          <p className="text-sm text-gray-600">
            Atendimento com cliente que você trouxe: não tem comissão. O horário vale para a sua agenda e o limite semanal do trabalho
            doméstico também vale aqui.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="atd-cliente" label="Cliente">
              <select id="atd-cliente" className={inputClass} value={client} onChange={e => setClient(e.target.value)}>
                <option value="">Escolha…</option>
                {ownClients.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="atd-ocupacao" label="Ocupação">
              <select id="atd-ocupacao" className={inputClass} value={occupation} onChange={e => setOccupation(e.target.value)}>
                {data.occupations.map(item => (
                  <option key={item.occupation_slug} value={item.occupation_slug}>
                    {findOccupation(item.occupation_slug)?.name ?? item.occupation_slug}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field id="atd-dia" label="Dia">
              <input id="atd-dia" type="date" min={data.today} className={inputClass} value={day} onChange={e => setDay(e.target.value)} />
            </Field>
            <Field id="atd-inicio" label="Início">
              <input id="atd-inicio" type="time" className={inputClass} value={start} onChange={e => setStart(e.target.value)} />
            </Field>
            <Field id="atd-fim" label="Término">
              <input id="atd-fim" type="time" className={inputClass} value={end} onChange={e => setEnd(e.target.value)} />
            </Field>
            <Field id="atd-valor" label="Valor combinado (R$)">
              <input id="atd-valor" className={inputClass} inputMode="decimal" placeholder="150,00" value={price} onChange={e => setPrice(e.target.value)} />
            </Field>
          </div>
          <Field id="atd-notas" label="Observações (opcional)">
            <textarea id="atd-notas" className={inputClass} rows={2} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
          <p className="text-xs text-gray-500">Horário de Brasília.</p>
          <ErrorAlert error={error} />
          {created && <p role="status" className="text-sm text-green-700">Atendimento criado.</p>}
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? 'Criando…' : 'Criar atendimento'}
          </button>
        </form>
      )}
    </Card>
  );
};

// ---- Bookings -----------------------------------------------------------------------

const ENDED: BookingStatus[] = ['canceled', 'completed', 'released'];

const BookingActions: React.FC<{ booking: BookingView; onMove: (to: BookingStatus, reason?: string) => Promise<void> }> = ({ booking, onMove }) => {
  const { status } = booking;
  const chargeable = booking.origin === 'own' && (status === 'accepted' || status === 'in_progress' || status === 'completed');
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {status === 'requested' && (
        <button type="button" className={primaryButton} onClick={() => onMove('accepted')}>
          Aceitar
        </button>
      )}
      {(status === 'accepted' || status === 'paid') && (
        <button type="button" className={primaryButton} onClick={() => onMove('in_progress')}>
          Iniciar
        </button>
      )}
      {status === 'in_progress' && (
        <button type="button" className={primaryButton} onClick={() => onMove('completed')}>
          Concluir
        </button>
      )}
      {(status === 'requested' || status === 'accepted') && (
        <ConfirmButton
          label={status === 'requested' ? 'Recusar' : 'Cancelar atendimento'}
          question={status === 'requested' ? 'Recusar este pedido?' : 'Cancelar este atendimento?'}
          confirmLabel="Sim"
          onConfirm={() => onMove('canceled')}
        />
      )}
      {chargeable && (
        <Link to={`/pro/cobrancas?atendimento=${booking.id}`} className={`${linkClass} text-sm`}>
          Cobrar
        </Link>
      )}
    </div>
  );
};

const BookingItem: React.FC<{ booking: BookingView; onMove: (id: string, to: BookingStatus, reason?: string) => Promise<void> }> = ({ booking, onMove }) => (
  <Card as="li">
    <div className="flex flex-wrap items-center gap-2 mb-1">
      <span className="font-semibold text-gray-900">{formatPeriodBR(booking.period)}</span>
      <Badge className={BOOKING_STATUS_STYLES[booking.status]}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
      <Badge className="bg-gray-100 text-gray-700">{booking.origin === 'own' ? 'Cliente seu' : 'Pelo WorkEasy'}</Badge>
    </div>
    <p className="text-sm text-gray-700">
      {booking.clientName ?? 'Cliente'} · {findOccupation(booking.occupation_slug)?.name ?? booking.occupation_slug} · {formatCents(booking.price_cents)}
    </p>
    {booking.notes && <p className="text-sm text-gray-500 mt-1 break-words">{booking.notes}</p>}
    <BookingActions booking={booking} onMove={(to, reason) => onMove(booking.id, to, reason)} />
  </Card>
);

const BookingsSection: React.FC<{ data: Data; onMove: (id: string, to: BookingStatus, reason?: string) => Promise<void> }> = ({ data, onMove }) => {
  const upcoming = data.bookings.filter(item => !ENDED.includes(item.status) && item.period.end.getTime() > data.now);
  const past = data.bookings.filter(item => !upcoming.includes(item)).reverse().slice(0, 20);
  return (
    <div className="space-y-4">
      <section aria-labelledby="agenda-proximos" className="space-y-3">
        <SectionTitle id="agenda-proximos">Próximos atendimentos</SectionTitle>
        {upcoming.length === 0 ? (
          <EmptyState>Nenhum atendimento marcado. Crie um abaixo ou responda aos pedidos em Pedidos.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {upcoming.map(item => (
              <BookingItem key={item.id} booking={item} onMove={onMove} />
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="agenda-anteriores" className="space-y-3">
          <SectionTitle id="agenda-anteriores">Anteriores</SectionTitle>
          <ul className="space-y-3">
            {past.map(item => (
              <BookingItem key={item.id} booking={item} onMove={onMove} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

// ---- Page -----------------------------------------------------------------------------

const Agenda: React.FC = () => {
  const { provider } = useProvider();
  const [params] = useSearchParams();
  const data = useAsync(() => load(provider.id), provider.id);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (data.loading && !data.data) return <PageStatus />;

  const move = async (id: string, to: BookingStatus, reason?: string) => {
    setError(null);
    setNotice(null);
    try {
      const from = data.data?.bookings.find(item => item.id === id)?.status;
      setNotice(await transitionBooking(id, to, reason, from));
      data.reload();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-5">
      <ErrorAlert error={data.error} />
      <ErrorAlert error={error} />
      {notice && (
        <p role="status" className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">
          Atendimento cancelado. {notice}
        </p>
      )}
      {data.data && (
        <>
          <LaborLockNotice data={data.data} />
          <BookingsSection data={data.data} onMove={move} />
          <NewBookingSection data={data.data} initialClient={params.get('cliente') ?? ''} onCreated={data.reload} />
          <AvailabilitySection providerId={provider.id} data={data.data} onChanged={data.reload} />
          <TimeOffSection providerId={provider.id} data={data.data} onChanged={data.reload} />
        </>
      )}
    </div>
  );
};

const AgendaPage: React.FC = () => (
  <ProPage title="Agenda">
    <Agenda />
  </ProPage>
);

export default AgendaPage;
