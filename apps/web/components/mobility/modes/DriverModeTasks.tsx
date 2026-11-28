import { useState } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { dangerButton, primaryButton, secondaryButton } from '../../admin/styles';
import { Card } from '../../admin/ui';
import { formatCents } from '../../../lib/money';
import {
  driverModes,
  rideBlocks,
  rideReserve,
  rideShuttle,
  type DriverShiftTask,
  type ShuttleManifest,
} from '../../../services/rideModes';
import { useModeAction, usePoll, whenSP } from './modeState';

const REASONS: Record<string, string> = {
  flight_delay: 'atraso de voo',
  passenger: 'pedido do passageiro',
  contingency: 'remarcação da reserva',
};

function ShiftTask({
  task,
  busy,
  decide,
}: {
  task: DriverShiftTask;
  busy: boolean;
  decide: (accept: boolean) => void;
}) {
  const [declining, setDeclining] = useState(false);
  return (
    <li className="space-y-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
      <p className="font-semibold">
        {task.origin} → {task.destination}
      </p>
      <p className="text-sm">
        Novo horário pedido: de {whenSP(task.old_pickup)} para {whenSP(task.new_pickup)}. Motivo:{' '}
        {REASONS[task.reason] ?? 'mudança de horário'}.
      </p>
      <p className="text-sm text-gray-700">
        {task.expires_at && `Responda até ${whenSP(task.expires_at)}. `}O preço e a sua parte não mudam.
      </p>
      {declining ? (
        <div className="space-y-2">
          <p className="text-sm">Ao recusar, você deixa esta reserva e ela volta ao despacho no novo horário.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={dangerButton} disabled={busy} onClick={() => decide(false)}>
              Confirmar recusa e devolver a reserva
            </button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setDeclining(false)}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButton} disabled={busy} onClick={() => decide(true)}>
            Aceitar novo horário
          </button>
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => setDeclining(true)}>
            Não posso neste horário
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * The driver's pending decisions of the stage 6 modes: a new pickup time of a reservation, an
 * extension of an hourly block, and the seat count of the line vans the driver runs.
 */
export default function DriverModeTasks({ onChanged }: { onChanged?: () => void }) {
  const result = usePoll(async () => {
    const tasks = await driverModes.tasks();
    // Counts only. A manifest that cannot be read leaves the other tasks usable.
    const manifests = await Promise.all(
      tasks.departures.map((d) => rideShuttle.manifest(d.id).catch((): ShuttleManifest | null => null)),
    );
    return { tasks, manifests };
  }, 'driver-mode-tasks');
  const action = useModeAction(() => {
    result.reload();
    onChanged?.();
  });
  const data = result.data;
  if (!data) return <ErrorAlert error={result.error} />;
  const { shifts, extensions, departures } = data.tasks;
  const empty = shifts.length + extensions.length + departures.length === 0;
  return (
    <section aria-labelledby="tarefas-modalidades" className="space-y-2">
      <h2 id="tarefas-modalidades" className="text-lg font-semibold">
        Horários, extensões e vans
      </h2>
      <ErrorAlert error={result.error} />
      {empty && (
        <p className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500">
          Nenhuma decisão pendente agora. Pedidos de novo horário e de extensão aparecem aqui.
        </p>
      )}
      {shifts.length > 0 && (
        <Card className="space-y-3">
          <h3 className="font-semibold text-gray-900">Pedidos de novo horário</h3>
          <ul className="space-y-3">
            {shifts.map((task) => (
              <ShiftTask
                key={task.id}
                task={task}
                busy={action.busy}
                decide={(accept) =>
                  void action.run(`shift:${task.id}:${accept}`, async () => {
                    const state = await rideReserve.decideShift(task.id, accept);
                    if (!accept) return 'Reserva devolvida ao despacho no novo horário.';
                    return state === 'applied'
                      ? `Novo horário confirmado: ${whenSP(task.new_pickup)}.`
                      : 'O novo horário não coube na sua agenda. A reserva voltou ao despacho.';
                  })
                }
              />
            ))}
          </ul>
        </Card>
      )}
      {extensions.length > 0 && (
        <Card className="space-y-3">
          <h3 className="font-semibold text-gray-900">Extensões de bloco por hora</h3>
          <ul className="space-y-3">
            {extensions.map((task) => (
              <li key={task.id} className="space-y-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                <p className="font-semibold">
                  {task.origin} → {task.destination}
                </p>
                <p className="text-sm">
                  Extensão pedida: +{task.minutes} min · +{task.km} km · {formatCents(task.cents)}
                  {task.driver_cents != null && ` · Sua parte ${formatCents(task.driver_cents)}`}
                </p>
                <p className="text-sm text-gray-700">
                  Válida até {whenSP(task.expires_at)}. Ela só se aplica com o seu aceite e o do pagador; sem isso, o
                  bloco termina no horário contratado.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(`extension:${task.id}:true`, async () => {
                        const state = await rideBlocks.decide(task.id, true);
                        return state === 'applied'
                          ? 'Extensão aplicada ao bloco.'
                          : 'Aceite registrado. Falta o aceite do pagador.';
                      })
                    }
                  >
                    Aceitar extensão
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(`extension:${task.id}:false`, async () => {
                        await rideBlocks.decide(task.id, false);
                        return 'Extensão recusada. O bloco contratado continua valendo.';
                      })
                    }
                  >
                    Recusar extensão
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {departures.length > 0 && (
        <Card className="space-y-3">
          <h3 className="font-semibold text-gray-900">Vans de linha</h3>
          <ul className="space-y-3">
            {departures.map((d, i) => {
              const m = data.manifests[i];
              return (
                <li key={d.id} className="space-y-1 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                  <p className="font-semibold">
                    {d.origin_area} → {d.destination_area}
                  </p>
                  <p className="text-sm">Partida {whenSP(d.departs_at)}</p>
                  {m ? (
                    <p className="text-sm">
                      {m.seats_confirmed} de {m.seats_total} assentos reservados, em{' '}
                      {m.bookings === 1 ? '1 reserva' : m.bookings + ' reservas'}.
                      {m.state === 'cancelled' && ' Partida cancelada pela operação.'}
                    </p>
                  ) : (
                    <p className="text-sm">Contagem de assentos indisponível agora.</p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-gray-700">A lista mostra apenas contagens. Dados dos passageiros não aparecem aqui.</p>
        </Card>
      )}
      {action.message}
    </section>
  );
}
