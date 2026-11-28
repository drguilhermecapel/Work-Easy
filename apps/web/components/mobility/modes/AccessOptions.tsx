import { useEffect } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { useAsync } from '../../../lib/useAsync';
import { rideMarket, type Assistance } from '../../../services/rideMarket';

const names: Record<Assistance, string> = {
  boarding: 'Ajuda para embarcar',
  folding_equipment: 'Equipamento portátil ou dobrável',
  wheelchair_vehicle: 'Veículo adaptado para viajar na cadeira',
};

/** The staffed channel as the area published it: a phone, an e-mail or a short instruction. */
function Channel({ value }: { value: string | null }) {
  if (!value) return <>O canal do plantão ainda não foi publicado para esta área. Consulte outra janela de horário.</>;
  const href = /^[^\s@]+@[^\s@]+$/.test(value)
    ? 'mailto:' + value
    : /^\+?[\d\s().-]{8,}$/.test(value)
      ? 'tel:' + value.replace(/[^\d+]/g, '')
      : null;
  return (
    <>
      Fale com o plantão para combinar outra janela:{' '}
      {href ? (
        <a className="text-primary underline" href={href}>
          {value}
        </a>
      ) : (
        value
      )}
    </>
  );
}

/**
 * Assistance for boarding on a measured route. It asks what helps, never why: there is no field
 * for a diagnosis. An option without a compatible vehicle and driver cannot be chosen, and the
 * text says so instead of promising a vehicle. `refused` is set by the form when the server
 * refused the quote for lack of a compatible vehicle.
 */
export function AccessOptions({
  routeId,
  departure,
  value,
  companion,
  onChange,
  refused = false,
}: {
  routeId: string;
  departure: string | null;
  value: 'none' | Assistance;
  companion: boolean;
  onChange: (assistance: 'none' | Assistance, companion: boolean) => void;
  refused?: boolean;
}) {
  const menu = useAsync(() => rideMarket.accessOptions(routeId, departure), JSON.stringify([routeId, departure]));
  const reload = menu.reload;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);
  if (!menu.data)
    return menu.loading ? (
      <p role="status">Consultando a assistência disponível…</p>
    ) : (
      <div className="space-y-2">
        <ErrorAlert error={menu.error} />
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 font-semibold" onClick={reload}>
          Consultar assistência de novo
        </button>
      </div>
    );
  const options = menu.data.options.filter((o) => o.assistance in names);
  const chosen = options.find((o) => o.assistance === value);
  const none = !options.some((o) => o.available);
  const blocked = refused || none || (value !== 'none' && !chosen?.available);
  return (
    <fieldset className="space-y-2">
      <legend>Assistência no embarque</legend>
      <p className="text-sm">
        Diga só o que ajuda no embarque. Ninguém pede diagnóstico, laudo ou motivo, e a assistência não tem adicional.
        Cão-guia e animal de assistência não precisam ser informados.
      </p>
      <label className="block rounded-lg border p-2">
        <input
          type="radio"
          name={'assistencia-' + routeId}
          checked={value === 'none'}
          onChange={() => onChange('none', false)}
        />{' '}
        Sem assistência especial
      </label>
      {options.map((o) => (
        <label key={o.assistance} className="block rounded-lg border p-2">
          <input
            type="radio"
            name={'assistencia-' + routeId}
            checked={value === o.assistance}
            disabled={!o.available}
            onChange={() => onChange(o.assistance, companion && o.companion)}
          />{' '}
          {names[o.assistance]}
          <span className="block text-sm">
            {o.available
              ? o.boarding_minutes > 0
                ? `Disponível nesta janela · ${o.boarding_minutes} min a mais para o embarque, sem adicional`
                : 'Disponível nesta janela, sem adicional'
              : 'Sem veículo e motorista compatíveis nesta janela'}
          </span>
        </label>
      ))}
      {chosen?.available &&
        (chosen.companion ? (
          <label className="block">
            <input
              type="checkbox"
              checked={companion}
              onChange={(e) => onChange(chosen.assistance, e.target.checked)}
            />{' '}
            Vou com acompanhante (reserva um assento ao meu lado)
          </label>
        ) : (
          <p className="text-sm">Assento para acompanhante indisponível nesta janela.</p>
        ))}
      {blocked && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          {none || refused
            ? 'Não há veículo compatível para este trajeto e horário.'
            : 'A assistência escolhida está sem veículo compatível para este trajeto e horário.'}{' '}
          Nenhuma cotação com assistência é criada sem veículo e motorista conferidos pela operação.{' '}
          <Channel value={menu.data.channel} />
        </p>
      )}
      <ErrorAlert error={menu.error} />
    </fieldset>
  );
}
