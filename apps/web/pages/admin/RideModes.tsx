import { lazy, Suspense, useState } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { dangerButton, inputClass, secondaryButton } from '../../components/admin/styles';
import { Card, EmptyState, Field } from '../../components/admin/ui';
import { useModeAction, usePoll, whenSP } from '../../components/mobility/modes/modeState';
import { rideShuttle, type AdminDeparture } from '../../services/rideModes';

const STATES: Record<AdminDeparture['state'], string> = {
  open: 'Aberta',
  departed: 'Já partiu',
  cancelled: 'Cancelada',
};
const seatCount = (n: number) => (n === 1 ? '1 assento' : n + ' assentos');

function Departure({
  departure,
  busy,
  cancel,
}: {
  departure: AdminDeparture;
  busy: boolean;
  cancel: (reason: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const text = reason.trim();
  const fieldId = `motivo-${departure.id}`;
  return (
    <li className="space-y-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
      <h3 className="font-semibold">
        {departure.origin_area} → {departure.destination_area}
      </h3>
      <p className="text-sm">
        Partida {whenSP(departure.departs_at)} · {STATES[departure.state]} ·{' '}
        {departure.driver_assigned ? 'Motorista designado' : 'Sem motorista designado'}
      </p>
      <p className="text-sm text-gray-700">
        {departure.seats_confirmed} de {seatCount(departure.seats_total)} reservados
      </p>
      {departure.state === 'open' && !open && (
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => setOpen(true)}>
          Cancelar partida
        </button>
      )}
      {departure.state === 'open' && open && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.length < 4) return;
            void cancel(text).then((done) => {
              if (done) setOpen(false);
            });
          }}
        >
          <p className="text-sm">
            O cancelamento não pode ser desfeito. {seatCount(departure.seats_confirmed)}{' '}
            {departure.seats_confirmed === 1 ? 'será liberado' : 'serão liberados'}; quem reservou recebe o aviso e a
            opção de remarcar em outra partida da linha.
          </p>
          <Field id={fieldId} label="Motivo do cancelamento" hint="Sem nomes nem dados pessoais. De 4 a 200 caracteres.">
            <input
              id={fieldId}
              className={inputClass}
              required
              minLength={4}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={dangerButton} disabled={busy || text.length < 4}>
              Confirmar cancelamento da partida
            </button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setOpen(false)}>
              Voltar
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

// The registry of what these modes sell (DD125). Each panel is its own chunk, read only when opened.
const PANELS = [
  { id: 'linhas', label: 'Linhas e partidas', Panel: lazy(() => import('./RideModeLines')) },
  { id: 'blocos', label: 'Blocos por hora', Panel: lazy(() => import('./RideModeBlocks')) },
  { id: 'corredores', label: 'Corredores entre municípios', Panel: lazy(() => import('./RideModeCorridors')) },
  { id: 'reservas', label: 'Políticas de reserva', Panel: lazy(() => import('./RideModePolicies')) },
];

function Registry() {
  const [open, setOpen] = useState<string | null>(null);
  const chosen = PANELS.find((panel) => panel.id === open);
  return (
    <section aria-labelledby="cadastros-modalidades" className="space-y-3">
      <h2 id="cadastros-modalidades" className="text-lg font-semibold text-gray-900">
        Cadastros da operação
      </h2>
      <p className="text-sm text-gray-700">
        Linhas, partidas, blocos, corredores e políticas de reserva são cadastrados aqui, com a referência da evidência
        conferida e a validade. Cada alteração fica na auditoria.
      </p>
      <div className="flex flex-wrap gap-2">
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className={secondaryButton}
            aria-pressed={open === panel.id}
            onClick={() => setOpen(open === panel.id ? null : panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </div>
      {chosen && (
        <Card>
          <Suspense fallback={<p role="status">Carregando…</p>}>
            <chosen.Panel />
          </Suspense>
        </Card>
      )}
    </section>
  );
}

/** /admin/corridas/modalidades: operation of the stage 6 modes: the van departures and the registry. */
export default function RideModes() {
  const result = usePoll(rideShuttle.adminDepartures, 'admin-shuttle-departures');
  const action = useModeAction(result.reload);
  const data = result.data;
  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Modalidades de corrida</h1>
        <button type="button" className={secondaryButton} disabled={result.loading} onClick={result.reload}>
          Atualizar
        </button>
      </div>
      {data?.simulation && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Ensaio com dados fictícios. As partidas e os assentos desta tela não acionam veículos, cobranças ou repasses.
        </p>
      )}
      <ErrorAlert error={result.error} />
      <Card className="space-y-3">
        <h2 className="font-semibold text-gray-900">Partidas de van por assento</h2>
        <p className="text-sm text-gray-700">
          Cancele uma partida quando o motorista ou o veículo não puder atendê-la. Nenhum valor é cobrado por assento
          nesta etapa, então não há restituição a processar.
        </p>
        {!data && result.loading && <p role="status">Consultando partidas…</p>}
        {data && data.departures.length === 0 && (
          <EmptyState>Nenhuma partida cadastrada. As partidas abertas aparecem aqui para acompanhamento.</EmptyState>
        )}
        {data && data.departures.length > 0 && (
          <ul className="space-y-3">
            {data.departures.map((departure) => (
              <Departure
                key={departure.id}
                departure={departure}
                busy={action.busy}
                cancel={(reason) =>
                  action.run(`cancel:${departure.id}:${reason}`, async (key) => {
                    const done = await rideShuttle.cancelDeparture(departure.id, reason, key);
                    return typeof done.released_seats === 'number'
                      ? `Partida cancelada. ${seatCount(done.released_seats)} ${
                          done.released_seats === 1 ? 'liberado' : 'liberados'
                        }.`
                      : 'Partida cancelada. Os assentos reservados foram liberados.';
                  })
                }
              />
            ))}
          </ul>
        )}
        {action.message}
      </Card>
      <Registry />
    </main>
  );
}
