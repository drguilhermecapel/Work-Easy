import { useState } from 'react';
import { formatDateTime } from '../../components/admin/format';
import { inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Card, Field } from '../../components/admin/ui';
import { saoPauloDateTime } from '../../lib/timezone';
import { configureDriverShift, removeDriverShift } from '../../services/rides';
import type { ConsoleActions } from './DriverConsole';

const localInstant = (value: string) => {
  const [day, clock] = value.split('T');
  return day && clock ? saoPauloDateTime(day, clock) : null;
};

export default function DriverShifts({ dashboard, run, busy }: Pick<ConsoleActions, 'dashboard' | 'run' | 'busy'>) {
  const [area, setArea] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const start = localInstant(from);
  const end = localInstant(until);
  const hours = start && end ? (end.getTime() - start.getTime()) / 3_600_000 : 0;
  const shifts = dashboard.driver?.shifts ?? [];
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Seus turnos</h2>
      {!shifts.length && (
        <p className="text-sm">
          {dashboard.simulation
            ? 'O ensaio permite experimentar ofertas sem um turno declarado.'
            : 'Informe uma área de partida e um turno para receber ofertas.'}
        </p>
      )}
      <ul className="space-y-2">
        {shifts.map((shift) => (
          <li key={shift.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              {shift.area} · {formatDateTime(shift.starts_at)} até {formatDateTime(shift.ends_at)}
            </span>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => void run(`remove-shift:${shift.id}`, () => removeDriverShift(shift.id))}
            >
              Remover turno
            </button>
          </li>
        ))}
      </ul>
      {dashboard.areas.length > 0 && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (area && start && end && hours > 0 && hours <= 12)
              void run(`shift:${area}:${from}:${until}`, () => configureDriverShift(area, start.toISOString(), end.toISOString()));
          }}
        >
          <Field id="turno-area" label="Área de partida do turno">
            <select id="turno-area" required value={area} onChange={(e) => setArea(e.target.value)} className={inputClass}>
              <option value="">Escolha a área</option>
              {dashboard.areas.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field id="turno-inicio" label="Início do turno (São Paulo)">
              <input
                className={inputClass}
                type="datetime-local"
                id="turno-inicio"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field id="turno-fim" label="Fim do turno (São Paulo)" hint="Até 12 horas por turno.">
              <input
                className={inputClass}
                type="datetime-local"
                id="turno-fim"
                required
                min={from}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </Field>
          </div>
          <button type="submit" className={primaryButton} disabled={busy || !area || hours <= 0 || hours > 12}>
            Cadastrar turno
          </button>
        </form>
      )}
    </Card>
  );
}
