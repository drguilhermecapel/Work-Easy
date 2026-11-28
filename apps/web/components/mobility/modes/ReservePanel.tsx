import { useState, type FormEvent } from 'react';
import {
  rideReserve,
  type ContingencyChoice,
  type ReserveState,
  type ReserveTerms,
  type ShiftReason,
} from '../../../services/rideModes';
import {
  danger,
  failureAlert,
  field,
  inset,
  isFuture,
  primary,
  secondary,
  toInstant,
  useModeAction,
  usePoll,
  whenSP,
} from './modeState';

/** The leg as the passenger page already has it. `reserve` may come with it; otherwise it is read here. */
export interface ReserveLeg {
  id: string;
  status: string;
  pickup_at?: string | null;
  reserve?: ReserveTerms | null;
}

const STATES: Record<ReserveState, string> = {
  awaiting_driver: 'Aguardando a confirmação de um motorista',
  confirmed: 'Motorista confirmado',
  contingency: 'Sem motorista confirmado no prazo',
  released: 'Reserva encerrada',
};
// A reservation can still move or be rebooked until the driver leaves for the pickup.
const OPEN = ['requested', 'offered', 'assigned', 'accepted'];

/**
 * Reserve terms of a scheduled leg: the confirmation deadline, the flight reference, the request to
 * move the pickup after a flight delay and the choices when no driver confirmed in time.
 * Renders nothing for a leg without reserve terms.
 */
export function ReservePanel({
  leg,
  passenger = true,
  onChanged,
}: {
  leg: ReserveLeg;
  /** Only the passenger moves, rebooks or cancels the reservation. */
  passenger?: boolean;
  onChanged?: () => void;
}) {
  const open = OPEN.includes(leg.status) && !!leg.pickup_at;
  const given = leg.reserve;
  const terms = usePoll(
    async () => (!open ? null : given !== undefined ? given : rideReserve.state(leg.id)),
    JSON.stringify([leg.id, open, given ?? null]),
    30_000,
    (read, failed) => open && given === undefined && (!!read || failed),
  );
  const action = useModeAction(() => {
    terms.reload();
    onChanged?.();
  });
  const [form, setForm] = useState<'' | 'shift' | 'rebook' | 'cancel'>('');
  const [time, setTime] = useState('');
  const [validation, setValidation] = useState('');
  const data = terms.data;
  if (!data) {
    return (
      <>
        {open && failureAlert(terms.error)}
        {action.message}
      </>
    );
  }

  const airport = !!(data.flight_ref || data.terminal);
  const reason: ShiftReason = airport ? 'flight_delay' : 'passenger';
  const pending = data.shift?.state === 'proposed' ? data.shift : null;
  const close = () => {
    setForm('');
    setTime('');
    setValidation('');
  };
  const chosen = (): string | null => {
    const instant = toInstant(time);
    if (!isFuture(instant)) {
      setValidation('Escolha um horário futuro, no horário de São Paulo.');
      return null;
    }
    setValidation('');
    return instant;
  };

  async function shift(event: FormEvent) {
    event.preventDefault();
    const instant = chosen();
    if (!instant) return;
    const limit = data?.max_shift_minutes;
    if (limit != null && leg.pickup_at && Math.abs(Date.parse(instant) - Date.parse(leg.pickup_at)) > limit * 60_000) {
      setValidation(`Esta reserva aceita mudança de até ${limit} min em relação ao horário atual.`);
      return;
    }
    const done = await action.run(`shift:${instant}:${reason}`, async (key) => {
      const result = await rideReserve.shift(leg.id, instant, reason, key);
      return result.state === 'applied'
        ? `Horário alterado para ${whenSP(result.new_pickup)}. Preço e pagador continuam os mesmos.`
        : `Pedido enviado ao motorista${result.expires_at ? ', que responde até ' + whenSP(result.expires_at) : ''}. ` +
            'Se ele não puder, a reserva volta à busca no novo horário.';
    });
    if (done) close();
  }

  async function contingency(choice: ContingencyChoice, instant: string | null, notice: string) {
    const done = await action.run(`contingency:${choice}:${instant ?? ''}`, async (key) => {
      await rideReserve.contingency(leg.id, choice, instant, key);
      return notice;
    });
    if (done) close();
  }

  return (
    <section aria-label="Reserva agendada" className={inset}>
      <h4 className="font-semibold">Reserva agendada · {STATES[data.state]}</h4>
      <p>Embarque previsto para {whenSP(leg.pickup_at)}.</p>
      {data.state === 'awaiting_driver' && (
        <p className="text-sm text-gray-700">
          Um motorista precisa confirmar até {whenSP(data.confirm_by)}. Se ninguém confirmar até lá, você escolhe
          entre continuar a busca, remarcar ou cancelar.
        </p>
      )}
      {data.state === 'confirmed' && <p className="text-sm text-gray-700">Um motorista confirmou esta reserva.</p>}
      {airport && (
        <p className="text-sm text-gray-700">
          {[data.terminal && 'Terminal ' + data.terminal, data.flight_ref && 'Voo ' + data.flight_ref]
            .filter(Boolean)
            .join(' · ')}
          . A referência do voo é apagada 24 horas após o fim do trecho.
        </p>
      )}
      {pending && (
        <p role="status" className="text-sm">
          Pedido de novo horário para {whenSP(pending.new_pickup)}
          {pending.expires_at ? `, aguardando o motorista até ${whenSP(pending.expires_at)}` : ', aguardando o motorista'}.
          Se ele não puder, a reserva volta à busca no novo horário.
        </p>
      )}
      {data.shift?.state === 'declined' && (
        <p className="text-sm">
          O motorista anterior não pôde atender o novo horário. A busca continua para {whenSP(data.shift.new_pickup)}.
        </p>
      )}

      {passenger && (data.state === 'awaiting_driver' || data.state === 'confirmed') && !pending && form === '' && (
        <button type="button" className={secondary} disabled={action.busy} onClick={() => setForm('shift')}>
          {airport ? 'Meu voo atrasou' : 'Mudar o horário da reserva'}
        </button>
      )}
      {form === 'shift' && (
        <form onSubmit={shift} className="space-y-2">
          <label className="block">
            Novo horário de embarque (São Paulo)
            <input
              className={field}
              type="datetime-local"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <p className="text-sm text-gray-700">
            {data.max_shift_minutes != null && `Mudança aceita nesta reserva: até ${data.max_shift_minutes} min. `}
            Preço e pagador não mudam.
            {data.state === 'confirmed' && ' O motorista confirmado precisa aceitar o novo horário.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primary} disabled={action.busy}>
              Pedir novo horário
            </button>
            <button type="button" className="underline" disabled={action.busy} onClick={close}>
              Voltar
            </button>
          </div>
        </form>
      )}

      {data.state === 'contingency' && (
        <div className="space-y-2">
          <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Nenhum motorista confirmou até {whenSP(data.confirm_by)}.{' '}
            {passenger ? 'Escolha como seguir.' : 'O passageiro escolhe entre continuar a busca, remarcar ou cancelar.'}
          </p>
          {passenger && form === '' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primary}
                disabled={action.busy}
                onClick={() =>
                  void contingency(
                    'keep_searching',
                    null,
                    'A busca por motorista continua. Você ainda pode remarcar ou cancelar por aqui.',
                  )
                }
              >
                Continuar buscando motorista
              </button>
              <button type="button" className={secondary} disabled={action.busy} onClick={() => setForm('rebook')}>
                Remarcar para outro horário
              </button>
              <button type="button" className={danger} disabled={action.busy} onClick={() => setForm('cancel')}>
                Cancelar reserva
              </button>
            </div>
          )}
          {form === 'rebook' && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                const instant = chosen();
                if (instant)
                  void contingency(
                    'rebook',
                    instant,
                    `Reserva remarcada para ${whenSP(instant)}. A busca por motorista recomeça para o novo horário.`,
                  );
              }}
            >
              <label className="block">
                Novo horário de embarque (São Paulo)
                <input
                  className={field}
                  type="datetime-local"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={primary} disabled={action.busy}>
                  Confirmar novo horário
                </button>
                <button type="button" className="underline" disabled={action.busy} onClick={close}>
                  Voltar
                </button>
              </div>
            </form>
          )}
          {form === 'cancel' && (
            <div className="space-y-2">
              <p>
                O cancelamento encerra este trecho. As ordens de pagamento ainda não usadas neste trecho são
                canceladas junto.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={danger}
                  disabled={action.busy}
                  onClick={() => void contingency('cancel', null, 'Reserva cancelada. O trecho foi encerrado.')}
                >
                  Confirmar cancelamento da reserva
                </button>
                <button type="button" className="underline" disabled={action.busy} onClick={close}>
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {validation && (
        <p role="alert" className="text-red-700">
          {validation}
        </p>
      )}
      {action.message}
    </section>
  );
}

export default ReservePanel;
