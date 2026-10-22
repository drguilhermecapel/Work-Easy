import React, { useState } from 'react';
import { allowedNext, canStillDispute, transitionBooking, type BookingStatus, type BookingView } from '../../services/bookings';
import ErrorAlert from '../ErrorAlert';
import { dangerButton, inputClass, primaryButton, secondaryButton } from './styles';

interface ActionCopy {
  label: string;
  /** Needs a confirmation step with a reason. */
  confirm?: { text: string; reason: 'optional' | 'required' };
  tone: 'primary' | 'secondary' | 'danger';
  done: string;
}

/** Wording of each transition, by the role that asks for it. */
const actionCopy = (role: 'client' | 'provider', from: BookingStatus, to: BookingStatus): ActionCopy => {
  switch (to) {
    case 'accepted':
      return { label: 'Aceitar atendimento', tone: 'primary', done: 'Atendimento aceito.' };
    case 'in_progress':
      return { label: 'Iniciar atendimento', tone: 'primary', done: 'Atendimento iniciado.' };
    case 'completed':
      return { label: 'Marcar como concluído', tone: 'primary', done: 'Atendimento marcado como concluído.' };
    case 'released':
      return {
        label: 'Liberar atendimento',
        tone: 'primary',
        confirm: { text: 'Ao liberar, você confirma que o serviço foi feito como combinado.', reason: 'optional' },
        done: 'Atendimento liberado.',
      };
    case 'disputed':
      return {
        label: 'Contestar atendimento',
        tone: 'danger',
        confirm: { text: 'Conte o que aconteceu. A plataforma analisa a contestação.', reason: 'required' },
        done: 'Contestação registrada.',
      };
    default:
      return {
        label: role === 'provider' && from === 'requested' ? 'Recusar pedido' : 'Cancelar atendimento',
        tone: 'danger',
        confirm: { text: 'Esta ação não pode ser desfeita.', reason: 'optional' },
        done: 'Atendimento cancelado.',
      };
  }
};

const toneClass = { primary: primaryButton, secondary: secondaryButton, danger: dangerButton } as const;

interface Props {
  booking: BookingView;
  /** Reference time taken when the data was read (keeps render pure). */
  now: number;
  onDone: (message: string) => void;
}

/** Buttons for the transitions the signed-in role may ask for; the database has the last word. */
const BookingActions: React.FC<Props> = ({ booking, now, onDone }) => {
  const role = booking.role;
  const [pending, setPending] = useState<BookingStatus | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!role) return null;

  const disputeClosed = role === 'client' && booking.status === 'completed' && !canStillDispute(booking, now);
  const options = allowedNext(role, booking.status).filter(to => !(to === 'disputed' && disputeClosed));
  if (options.length === 0 && !disputeClosed) return null;

  const run = async (to: BookingStatus, why?: string) => {
    setBusy(true);
    setError(null);
    try {
      const { notice } = await transitionBooking(booking.id, to, why, booking.status);
      setPending(null);
      setReason('');
      const done = actionCopy(role, booking.status, to).done;
      onDone(notice ? `${done} ${notice}` : done);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const choose = (to: BookingStatus) => {
    setError(null);
    if (actionCopy(role, booking.status, to).confirm) {
      setPending(to);
      setReason('');
    } else {
      void run(to);
    }
  };

  const confirming = pending ? actionCopy(role, booking.status, pending) : null;
  const reasonRequired = confirming?.confirm?.reason === 'required';

  return (
    <section aria-labelledby="atendimento-acoes" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-3">
      <h2 id="atendimento-acoes" className="font-bold text-gray-800">O que você pode fazer</h2>
      {!pending && (
        <div className="flex flex-wrap gap-2">
          {options.map(to => {
            const copy = actionCopy(role, booking.status, to);
            return (
              <button key={to} type="button" className={toneClass[copy.tone]} disabled={busy} onClick={() => choose(to)}>
                {busy && !copy.confirm ? 'Enviando…' : copy.label}
              </button>
            );
          })}
        </div>
      )}
      {disputeClosed && (
        <p className="text-xs text-gray-500">O prazo de 7 dias para contestar este atendimento terminou.</p>
      )}
      {pending && confirming?.confirm && (
        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault();
            void run(pending, reason);
          }}
        >
          <p className="text-sm text-gray-700">{confirming.confirm.text}</p>
          <div>
            <label htmlFor="acao-motivo" className="block text-xs text-gray-600 mb-1">
              {reasonRequired ? 'Motivo' : 'Motivo (opcional)'}
            </label>
            <textarea
              id="acao-motivo"
              rows={3}
              maxLength={1000}
              className={inputClass}
              value={reason}
              onChange={e => setReason(e.target.value)}
              required={reasonRequired}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={toneClass[confirming.tone]} disabled={busy || (reasonRequired && reason.trim().length < 5)}>
              {busy ? 'Enviando…' : `Confirmar: ${confirming.label.toLowerCase()}`}
            </button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setPending(null)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      <ErrorAlert error={error} />
    </section>
  );
};

export default BookingActions;
