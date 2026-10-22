import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ChevronLeft } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { AppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { saoPauloDateTime, todayInSaoPaulo } from '../../lib/timezone';
import { acceptProposal, getRequest, listProposals, type ProposalWithProvider } from '../../services/requests';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import { PROPOSAL_STATUS_LABELS, REQUEST_STATUS_LABELS, REQUEST_STATUS_STYLES, formatDate, isExpired } from './labels';

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base bg-white focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary';
const primaryButton =
  'inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryButton =
  'bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-gray-50';

/** Day and times typed by the user, always in São Paulo time (not the device's zone) → the period of the booking. */
const toPeriod = (day: string, start: string, end: string) => {
  const from = saoPauloDateTime(day, start);
  const to = saoPauloDateTime(day, end);
  if (!from || !to) throw new AppError('invalid_input', { message: 'Informe o dia e os horários.' });
  if (to.getTime() <= from.getTime()) throw new AppError('invalid_input', { message: 'O horário de término precisa ser depois do início.' });
  if (from.getTime() <= Date.now()) throw new AppError('invalid_input', { message: 'Escolha um horário no futuro.' });
  return { start: from, end: to };
};

const AcceptForm: React.FC<{ proposal: ProposalWithProvider; onAccepted: (bookingId: string | null) => void; onCancel: () => void }> = ({
  proposal,
  onAccepted,
  onCancel,
}) => {
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const prefix = `aceitar-${proposal.id}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const bookingId = await acceptProposal(proposal.id, toPeriod(day, start, end));
      onAccepted(bookingId);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-gray-100 pt-4" noValidate>
      <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
        <CalendarClock size={16} className="text-primary" aria-hidden="true" /> Quando será o atendimento?
      </p>
      <p className="text-xs text-gray-500">Horário de Brasília.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${prefix}-dia`} className="block text-xs text-gray-600 mb-1">Dia</label>
          <input id={`${prefix}-dia`} type="date" min={todayInSaoPaulo()} className={inputClass} value={day} onChange={e => setDay(e.target.value)} required />
        </div>
        <div>
          <label htmlFor={`${prefix}-inicio`} className="block text-xs text-gray-600 mb-1">Início</label>
          <input id={`${prefix}-inicio`} type="time" className={inputClass} value={start} onChange={e => setStart(e.target.value)} required />
        </div>
        <div>
          <label htmlFor={`${prefix}-fim`} className="block text-xs text-gray-600 mb-1">Término</label>
          <input id={`${prefix}-fim`} type="time" className={inputClass} value={end} onChange={e => setEnd(e.target.value)} required />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Ao aceitar, as outras propostas deste pedido são recusadas e o atendimento é criado com este profissional.
      </p>
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={busy || !day || !start || !end}>
          {busy ? 'Aceitando…' : 'Confirmar e aceitar'}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

const RequestDetail: React.FC<{ id: string }> = ({ id }) => {
  const result = useAsync(async () => {
    const [request, proposals] = await Promise.all([getRequest(id), listProposals(id)]);
    // Reference time for "expired", taken when the data is read (not during render)
    return { request, proposals, loadedAt: Date.now() };
  }, id);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{ bookingId: string | null } | null>(null);

  // Shown in every branch: if reloading after the accept fails, the user still knows it worked
  const acceptedBanner = accepted && (
    <div role="status" className="bg-green-50 border border-green-100 text-green-800 rounded-2xl p-4 text-sm">
      <p className="font-semibold flex items-center gap-2">
        <CheckCircle2 size={16} aria-hidden="true" /> Proposta aceita. O atendimento foi criado.
      </p>
      <Link to={accepted.bookingId ? `/atendimentos/${accepted.bookingId}` : '/atendimentos'} className="underline mt-1 inline-block">
        Ver atendimento
      </Link>
    </div>
  );

  if (result.loading && !result.data) return <PageStatus />;
  if (!result.data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        {acceptedBanner}
        <ErrorAlert error={result.error} />
        <Link to="/pedidos" className="text-sm text-primary underline">Voltar para Meus pedidos</Link>
      </div>
    );
  }

  const { request, proposals, loadedAt } = result.data;
  const occupationName = findOccupation(request.occupation_slug)?.name ?? request.occupation_slug;
  const canAccept = request.status === 'open';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <Link to="/pedidos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary">
        <ChevronLeft size={16} aria-hidden="true" /> Meus pedidos
      </Link>

      <header className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-sm ${REQUEST_STATUS_STYLES[request.status]}`}>
            {REQUEST_STATUS_LABELS[request.status]}
          </span>
          {request.urgent && <span className="text-xs font-bold px-2 py-0.5 rounded-sm bg-amber-100 text-amber-800">Urgente</span>}
          <span className="text-xs text-gray-400">Feito em {formatDate(request.created_at)}</span>
        </div>
        <h1 className="text-xl font-bold text-gray-800">{occupationName}</h1>
        <p className="text-sm text-gray-700 mt-2 whitespace-pre-line break-words">{request.description}</p>
        {request.preferred_dates && <p className="text-sm text-gray-500 mt-2">Quando: {request.preferred_dates}</p>}
        {request.status === 'open' && (
          <p className="text-xs text-gray-500 mt-2">Recebe propostas até {formatDate(request.expires_at)}.</p>
        )}
      </header>

      {acceptedBanner}
      <ErrorAlert error={result.error} />

      <section aria-labelledby="pedido-propostas">
        <h2 id="pedido-propostas" className="font-bold text-gray-800 mb-3">Propostas recebidas ({proposals.length})</h2>
        {proposals.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-2xl p-5">
            Ainda não chegaram propostas. Você recebe um aviso quando um profissional mandar a dele, se as notificações estiverem
            configuradas na plataforma.
          </p>
        ) : (
          <ul className="space-y-3">
            {proposals.map(proposal => {
              const expired = isExpired(proposal.valid_until, loadedAt);
              const acceptable = canAccept && proposal.status === 'sent' && !expired;
              return (
                <li key={proposal.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{proposal.provider_name ?? 'Profissional'}</p>
                      <p className="text-xs text-gray-500">
                        {PROPOSAL_STATUS_LABELS[proposal.status]}
                        {proposal.valid_until && ` · ${expired ? 'venceu em' : 'válida até'} ${formatDate(proposal.valid_until)}`}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{formatCents(proposal.price_cents)}</p>
                  </div>
                  {proposal.message && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line break-words">{proposal.message}</p>}
                  {proposal.provider_slug && (
                    <Link to={`/p/${proposal.provider_slug}`} className="text-xs text-primary underline mt-2 inline-block">
                      Ver página do profissional
                    </Link>
                  )}
                  {acceptable &&
                    (choosing === proposal.id ? (
                      <AcceptForm
                        proposal={proposal}
                        onCancel={() => setChoosing(null)}
                        onAccepted={bookingId => {
                          setChoosing(null);
                          setAccepted({ bookingId });
                          result.reload();
                        }}
                      />
                    ) : (
                      <button type="button" className={`${primaryButton} mt-3`} onClick={() => setChoosing(proposal.id)}>
                        Aceitar proposta
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

const PedidoDetalhe: React.FC = () => {
  const auth = useAuth();
  const { id = '' } = useParams();
  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Pedidos online ainda não disponíveis">
        <p>Nesta versão de demonstração, os pedidos não ficam guardados no app.</p>
      </BackendNotice>
    );
  }
  return (
    <RequireSession>
      <RequestDetail key={id} id={id} />
    </RequireSession>
  );
};

export default PedidoDetalhe;
