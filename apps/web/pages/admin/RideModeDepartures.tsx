import { useState, type FormEvent } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { inputClass, secondaryButton } from '../../components/admin/styles';
import { EmptyState, Field } from '../../components/admin/ui';
import { toInstant, useModeAction, whenSP } from '../../components/mobility/modes/modeState';
import { formatDateTime } from '../../components/admin/format';
import { useAsync } from '../../lib/useAsync';
import {
  rideRegistry,
  type RegistryDeparture,
  type RegistryDriver,
  type RegistryLine,
} from '../../services/rideModes';
import { FormButtons, Num, Problem } from './rideRegistryUi';
import { row } from './rideRegistryFormat';

// The departures of one line: create or change one, designate the driver (the database checks the
// registration on the day, the inspected seats and the pairing again) and mark it departed.

const STATES: Record<RegistryDeparture['state'], string> = { open: 'Aberta', departed: 'Partiu', cancelled: 'Cancelada' };
const VEHICLES: Record<string, string> = { compact: 'Compacto', sedan: 'Sedã', van: 'Van' };
/** São Paulo wall time of an instant, as a datetime-local value. */
const toLocal = (instant: string) => formatDateTime(instant).replace(/^(\d{2})\/(\d{2})\/(\d{4}) /, '$3-$2-$1T');

type Action = ReturnType<typeof useModeAction>;

function DepartureForm({ line, departure, action, close }: { line: RegistryLine; departure?: RegistryDeparture; action: Action; close: () => void }) {
  const [at, setAt] = useState(departure ? toLocal(departure.departs_at) : '');
  const [seats, setSeats] = useState(String(departure?.seats_total ?? 12));
  const [problem, setProblem] = useState('');
  const id = 'partida-' + (departure?.id ?? 'nova-' + line.id);
  function submit(event: FormEvent) {
    event.preventDefault();
    const departsAt = toInstant(at);
    if (!departsAt || Date.parse(departsAt) <= Date.now()) return setProblem('Informe um horário de partida futuro (São Paulo).');
    setProblem('');
    const total = Number(seats);
    void action.run(`departure:${departure?.id ?? 'new'}:${departsAt}:${total}`, async (key) => {
      await rideRegistry.saveDeparture(departure?.id ?? key, line.id, departsAt, total);
      return `Partida de ${whenSP(departsAt)} salva com ${total} assentos.`;
    });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id + '-horario'} label="Horário da partida (São Paulo)">
          <input id={id + '-horario'} type="datetime-local" className={inputClass} required value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Num id={id + '-assentos'} label="Assentos à venda" value={seats} onChange={setSeats} min={1} max={20} hint="Até 20. Com motorista, no máximo os lugares conferidos do veículo." />
      </div>
      <Problem text={problem} />
      <FormButtons busy={action.busy} save="Salvar partida" cancel={close} />
    </form>
  );
}

function Departure({ line, departure, drivers, action }: { line: RegistryLine; departure: RegistryDeparture; drivers: RegistryDriver[]; action: Action }) {
  const [editing, setEditing] = useState(false);
  const [driver, setDriver] = useState('');
  const end = Date.parse(departure.departs_at) + line.minutes * 60_000;
  const fit = drivers.filter((item) => item.seats >= departure.seats_total && Date.parse(item.capacity_until) >= end);
  const when = whenSP(departure.departs_at);
  const open = departure.state === 'open';
  const fieldId = 'motorista-' + departure.id;
  return (
    <li className={row}>
      <p className="font-semibold">Partida {when}</p>
      <p className="text-sm">
        {STATES[departure.state]} · {departure.seats_confirmed} de {departure.seats_total} assentos reservados ·{' '}
        {departure.driver_id
          ? `motorista ${departure.driver_label ?? 'designado'}${departure.driver_valid ? '' : ' (cadastro fora da validade)'}`
          : 'sem motorista designado'}
      </p>
      {open && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <Field id={fieldId} label={'Motorista para a partida ' + when}>
              <select id={fieldId} className={inputClass} value={driver} onChange={(e) => setDriver(e.target.value)}>
                <option value="">Selecione</option>
                {fit.map((item) => (
                  <option key={item.id} value={item.id}>
                    {(item.label ?? 'Motorista') + ' · ' + (VEHICLES[item.vehicle] ?? item.vehicle) + ' com ' + item.seats + ' lugares'}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              className={secondaryButton}
              disabled={action.busy || !driver}
              onClick={() => void action.run(`designate:${departure.id}:${driver}`, async () => {
                await rideRegistry.designate(departure.id, driver);
                return `Motorista designado para a partida ${when}.`;
              })}
            >
              Designar motorista
            </button>
            {departure.driver_id && (
              <button
                type="button"
                className={secondaryButton}
                disabled={action.busy}
                onClick={() => void action.run(`designate:${departure.id}:none`, async () => {
                  await rideRegistry.designate(departure.id, null);
                  return `Designação retirada da partida ${when}.`;
                })}
              >
                Retirar motorista
              </button>
            )}
            <button
              type="button"
              className={secondaryButton}
              disabled={action.busy || !departure.driver_id}
              onClick={() => void action.run(`departed:${departure.id}`, async () => {
                await rideRegistry.markDeparted(departure.id);
                return `Partida ${when} marcada como realizada.`;
              })}
            >
              Marcar como partida
            </button>
            <button type="button" className={secondaryButton} aria-pressed={editing} onClick={() => setEditing(!editing)}>
              Alterar horário ou assentos
            </button>
          </div>
          {fit.length === 0 && <p className="text-sm text-gray-600">Nenhum motorista aprovado tem veículo conferido com lugares para esta partida.</p>}
          {editing && <DepartureForm line={line} departure={departure} action={action} close={() => setEditing(false)} />}
        </div>
      )}
    </li>
  );
}

export default function RideModeDepartures({ line, onChange }: { line: RegistryLine; onChange: () => void }) {
  const { data, loading, error, reload } = useAsync(() => rideRegistry.departures(line.id), 'registro-partidas-' + line.id);
  const action = useModeAction(() => {
    reload();
    onChange();
  });
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 p-4">
      {loading && !data && <p role="status">Consultando partidas…</p>}
      <ErrorAlert error={error} />
      {data && data.departures.length === 0 && <EmptyState>Nenhuma partida desta linha nos próximos dias.</EmptyState>}
      {data && data.departures.length > 0 && (
        <ul className="space-y-3">
          {data.departures.map((departure) => (
            <Departure key={departure.id} line={line} departure={departure} drivers={data.drivers} action={action} />
          ))}
        </ul>
      )}
      {adding ? (
        <DepartureForm line={line} action={action} close={() => setAdding(false)} />
      ) : (
        <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>
          Nova partida de {line.origin_area} → {line.destination_area}
        </button>
      )}
      {action.message}
    </div>
  );
}
