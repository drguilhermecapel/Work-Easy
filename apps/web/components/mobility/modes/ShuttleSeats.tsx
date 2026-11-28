import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bus } from 'lucide-react';
import ErrorAlert from '../../ErrorAlert';
import { formatCents } from '../../../lib/money';
import { rideShuttle, type ShuttleBoard, type ShuttleSeat } from '../../../services/rideModes';
import {
  SIMULATION,
  banner,
  card,
  danger,
  field,
  isFuture,
  primary,
  secondary,
  useModeAction,
  usePoll,
  whenSP,
} from './modeState';

const SEAT_STATES: Record<ShuttleSeat['state'], string> = {
  confirmed: 'Reservado',
  cancelled: 'Cancelado',
  rebooked: 'Trocado por outra partida',
  released: 'Partida cancelada pela operação',
};
const count = (n: number) => (n === 1 ? '1 assento' : n + ' assentos');

function MySeat({
  seat,
  board,
  busy,
  run,
}: {
  seat: ShuttleSeat;
  board: ShuttleBoard;
  busy: boolean;
  run: ReturnType<typeof useModeAction>['run'];
}) {
  const [mode, setMode] = useState<'' | 'cancel' | 'rebook'>('');
  const [target, setTarget] = useState('');
  const others = (board.lines.find((line) => line.id === seat.line_id)?.departures ?? []).filter(
    (d) => d.state === 'open' && d.id !== seat.departure_id && d.seats_left >= seat.seats,
  );
  // A confirmed seat of a departure already gone can no longer move; the server would refuse it.
  const live = seat.state === 'released' || (seat.state === 'confirmed' && isFuture(seat.departs_at));
  const targetId = `troca-${seat.id}`;
  return (
    <li className="space-y-2 border-l-2 border-primary/30 pl-3">
      <p className="font-medium">
        {seat.origin_area} → {seat.destination_area}
      </p>
      <p className="text-sm">
        Partida {whenSP(seat.departs_at)} · {count(seat.seats)} · {formatCents(seat.seat_cents)} por assento ·{' '}
        {SEAT_STATES[seat.state]}
      </p>
      {seat.state === 'released' && (
        <p role="status" className="text-sm">
          A operação cancelou esta partida e liberou seus assentos. Nenhum valor foi cobrado. Você pode remarcar para
          outra partida da mesma linha pelo mesmo preço.
        </p>
      )}
      {live && mode === '' && (
        <div className="flex flex-wrap gap-2">
          {others.length > 0 && (
            <button type="button" className={secondary} disabled={busy} onClick={() => setMode('rebook')}>
              {seat.state === 'released' ? 'Remarcar em outra partida' : 'Trocar de partida'}
            </button>
          )}
          {seat.state === 'confirmed' && (
            <button type="button" className="text-sm underline" disabled={busy} onClick={() => setMode('cancel')}>
              Cancelar assento
            </button>
          )}
        </div>
      )}
      {live && mode === '' && others.length === 0 && seat.state === 'released' && (
        <p className="text-sm">Não há outra partida aberta nesta linha com assentos suficientes agora.</p>
      )}
      {mode === 'rebook' && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const departure = others.find((d) => d.id === target);
            if (!departure) return;
            void run(`rebook:${seat.id}:${departure.id}`, async (key) => {
              await rideShuttle.rebook(seat.id, departure.id, key);
              setMode('');
              return `Assento remarcado para a partida de ${whenSP(departure.departs_at)}, pelo mesmo preço.`;
            });
          }}
        >
          <label htmlFor={targetId} className="block">
            Nova partida (horário de São Paulo)
          </label>
          <select id={targetId} className={field} required value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Selecione</option>
            {others.map((d) => (
              <option key={d.id} value={d.id}>
                {whenSP(d.departs_at)} · {count(d.seats_left)} livres
              </option>
            ))}
          </select>
          <p className="text-sm">O preço por assento continua {formatCents(seat.seat_cents)}.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primary} disabled={busy || !target}>
              Confirmar troca de partida
            </button>
            <button type="button" className="underline" disabled={busy} onClick={() => setMode('')}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {mode === 'cancel' && (
        <div className="space-y-2">
          <p>
            Ao cancelar, {seat.seats === 1 ? 'o assento volta a ficar livre' : 'os assentos voltam a ficar livres'} para
            outras pessoas. Nenhum valor foi cobrado.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={danger}
              disabled={busy}
              onClick={() =>
                void run(`cancel:${seat.id}`, async (key) => {
                  const result = await rideShuttle.cancel(seat.id, key);
                  setMode('');
                  const due = result.refund_due_cents ?? 0;
                  return due > 0
                    ? `Reserva de assento cancelada. Restituição devida: ${formatCents(due)}.`
                    : 'Reserva de assento cancelada. Nada a restituir: nenhum valor foi cobrado.';
                })
              }
            >
              Confirmar cancelamento do assento
            </button>
            <button type="button" className="underline" disabled={busy} onClick={() => setMode('')}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Seats in a line van: choose the line, see the departures and the seats left, book 1 to 4 seats,
 * then cancel or move the booking. A seat is reserved; no payment is collected for it in this stage.
 */
export default function ShuttleSeats() {
  const result = usePoll(() => rideShuttle.board(null, null), 'shuttle-board');
  const action = useModeAction(result.reload);
  const [lineId, setLineId] = useState('');
  const [seats, setSeats] = useState(1);
  const [departureId, setDepartureId] = useState('');
  const board = result.data;
  if (!board) {
    return (
      <section className={card} aria-labelledby="van-assentos">
        <h2 id="van-assentos" className="text-lg font-semibold">
          Assentos em van de linha
        </h2>
        {result.loading ? <p role="status">Consultando linhas e partidas…</p> : <ErrorAlert error={result.error} />}
        {!result.loading && (
          <button type="button" className={secondary} onClick={result.reload}>
            Tentar novamente
          </button>
        )}
      </section>
    );
  }

  const line = board.lines.find((l) => l.id === lineId) ?? board.lines[0];
  const open = line?.departures.filter((d) => d.state === 'open') ?? [];
  const departure = open.find((d) => d.id === departureId && d.seats_left >= seats);
  const mine = board.my_seats.filter((seat) => seat.state !== 'rebooked');

  function book(event: FormEvent) {
    event.preventDefault();
    if (!line || !departure) return;
    void action.run(`book:${departure.id}:${seats}:${line.seat_cents}`, async (key) => {
      await rideShuttle.book(departure.id, seats, line.seat_cents, key);
      setDepartureId('');
      return `${seats === 1 ? 'Assento reservado' : count(seats) + ' reservados'} para a partida de ${whenSP(
        departure.departs_at,
      )}. Nenhum pagamento foi cobrado.`;
    });
  }

  return (
    <section className="space-y-4" aria-labelledby="van-assentos">
      <header className="space-y-2">
        <h2 id="van-assentos" className="flex items-center gap-2 text-lg font-semibold">
          <Bus aria-hidden="true" />
          Assentos em van de linha
        </h2>
        {board.simulation && (
          <p role="status" className={banner}>
            {SIMULATION}
          </p>
        )}
        <p>
          Reserve de 1 a 4 assentos em uma van com linha e horário fixos. O assento fica reservado em seu nome.{' '}
          {board.simulation
            ? 'Nenhum pagamento é cobrado neste ensaio.'
            : 'Nenhum pagamento é cobrado pelo assento nesta etapa.'}
        </p>
      </header>
      <ErrorAlert error={result.error} />

      {!line ? (
        <p className={card}>
          Nenhuma linha de van tem partidas abertas agora. Para um trajeto só seu, use{' '}
          <Link className="text-primary underline" to="/corridas">
            Corridas
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={book} className={card}>
          <h3 className="font-semibold">Reservar assento</h3>
          <fieldset disabled={action.busy} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                Linha
                <select
                  className={field}
                  value={line.id}
                  onChange={(e) => {
                    setLineId(e.target.value);
                    setDepartureId('');
                  }}
                >
                  {board.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.origin_area} → {l.destination_area} · {formatCents(l.seat_cents)} por assento
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Quantos assentos
                <select className={field} value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {open.length === 0 ? (
              <p>Esta linha não tem partidas abertas agora. Escolha outra linha ou volte mais tarde.</p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="font-medium">Partida (horário de São Paulo)</legend>
                {open.map((d) => {
                  const fits = d.seats_left >= seats;
                  return (
                    <label key={d.id} className="block rounded-lg border p-2">
                      <input
                        type="radio"
                        name="partida-van"
                        value={d.id}
                        checked={departure?.id === d.id}
                        disabled={!fits}
                        onChange={() => setDepartureId(d.id)}
                      />{' '}
                      {whenSP(d.departs_at)} ·{' '}
                      {d.seats_left === 0 ? 'lotada' : `${d.seats_left} de ${d.seats_total} assentos livres`}
                      {!fits && d.seats_left > 0 && ' · não comporta ' + count(seats)}
                    </label>
                  );
                })}
              </fieldset>
            )}
            <p>
              Total de {count(seats)}: {formatCents(seats * line.seat_cents)}. Nada é cobrado agora.
            </p>
            <button type="submit" className={primary} disabled={!departure}>
              {seats === 1 ? 'Reservar assento' : `Reservar ${seats} assentos`}
            </button>
            {!departure && open.length > 0 && <p className="text-sm text-gray-700">Escolha uma partida para reservar.</p>}
          </fieldset>
        </form>
      )}
      {action.message}

      <section className={card} aria-labelledby="meus-assentos">
        <h3 id="meus-assentos" className="font-semibold">
          Meus assentos
        </h3>
        {mine.length === 0 ? (
          <p>Você ainda não tem assento reservado.{line && ' Escolha uma linha e uma partida acima.'}</p>
        ) : (
          <ul className="space-y-4">
            {mine.map((seat) => (
              <MySeat key={seat.id} seat={seat} board={board} busy={action.busy} run={action.run} />
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
