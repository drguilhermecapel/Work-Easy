import { useEffect, useState } from 'react';
import { getClassOptions, type ClassOption } from '../../services/rideLocalMap';
import { formatCents } from '../../lib/money';

export function RideClassChoices({
  routeId,
  departure,
  selected,
  onSelect,
}: {
  routeId: string;
  departure: string | null;
  selected: string;
  onSelect: (code: string) => void;
}) {
  const [result, setResult] = useState<{
    route: string;
    departure: string | null;
    options: ClassOption[] | null;
  }>();
  useEffect(() => {
    let active = true;
    if (routeId)
      void getClassOptions(routeId, departure).then(
        (options) => {
          if (active) setResult({ route: routeId, departure, options });
        },
        () => {
          if (active) setResult({ route: routeId, departure, options: null });
        },
      );
    return () => {
      active = false;
    };
  }, [routeId, departure]);
  if (!result || result.route !== routeId || result.departure !== departure) return null;
  const list = result.options;
  if (!list) return <p role="status">Não foi possível atualizar a capacidade disponível.</p>;
  if (!list.length) return null;
  return (
    <fieldset className="space-y-2">
      <legend>Veículo e capacidade disponível</legend>
      {list.map((c) => (
        <label key={c.code} className="block rounded-lg border p-2">
          <input
            type="radio"
            required
            name={'classe-' + routeId}
            value={c.code}
            checked={selected === c.code}
            disabled={!c.available}
            onChange={() => onSelect(c.code)}
          />{' '}
          {c.label} · {c.seats} lugares
          {c.tools ? ' · espaço para equipamentos e bagagem' : ''}
          {c.accessible ? ' · acessibilidade verificada' : ''}
          <span className="block">
            {formatCents(c.fare_cents)} antes dos adicionais
            {c.duration_minutes !== null && ' · ' + c.duration_minutes + ' min de percurso'}
            {c.approach_minutes !== null && ' · ' + c.approach_minutes + ' min estimados até o embarque'}
            {!c.available && ' · sem motorista elegível nesta janela'}
          </span>
        </label>
      ))}
      <p className="text-sm">
        Estimativa consultada às{' '}
        {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(
          new Date(list[0].observed_at),
        )}
        . O motorista confirma após o aceite do preço final.
      </p>
    </fieldset>
  );
}
