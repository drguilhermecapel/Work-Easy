import { useState } from 'react';
import { formatDateTime } from '../../components/admin/format';
import { inputClass, secondaryButton } from '../../components/admin/styles';
import { Card, Field } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import { formatCents } from '../../lib/money';
import { saoPauloDateTime } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import {
  devicePoint,
  type DriverPreferences,
  driverWorkspace,
  interestInRide,
  joinAirport,
  saveDriverPreferences,
} from '../../services/driverJourney';
import type { ConsoleActions } from './DriverConsole';

function Preferences({ prefs, areas, busy, save }: {
  prefs: DriverPreferences;
  areas: string[];
  busy: boolean;
  save: (area: string | null, time: string | null, cost: number | null) => void;
}) {
  const [area, setArea] = useState(prefs.destination ?? '');
  const [arrive, setArrive] = useState(
    prefs.arrive_by
      ? formatDateTime(prefs.arrive_by).replace(/(\d+)\/(\d+)\/(\d+) (\d+:\d+)/, '$3-$2-$1T$4')
      : '',
  );
  const [cost, setCost] = useState(prefs.cost_per_km == null ? '' : String(prefs.cost_per_km));
  return (
    <form
      className='space-y-3'
      onSubmit={(e) => {
        e.preventDefault();
        const [day, clock] = arrive.split('T');
        const time = area && day && clock ? saoPauloDateTime(day, clock)?.toISOString() : null;
        if (area && !time) return;
        save(area || null, time || null, cost === '' ? null : Number(cost));
      }}
    >
      <h3 className='font-semibold'>Preferência para a próxima corrida</h3>
      <Field id='driver-priority-area' label='Destino desejado'>
        <select
          id='driver-priority-area'
          className={inputClass}
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value=''>Todas as áreas</option>
          {areas.map((o) => <option key={o}>{o}</option>)}
        </select>
      </Field>
      {area && (
        <Field id='driver-arrive-by' label='Chegar até (São Paulo)'>
          <input
            type='datetime-local'
            id='driver-arrive-by'
            required
            className={inputClass}
            value={arrive}
            onChange={(e) => setArrive(e.target.value)}
          />
        </Field>
      )}
      <Field id='driver-cost' label='Custo próprio estimado por km (centavos)'>
        <input
          id='driver-cost'
          type='number'
          min='0'
          max='2000'
          step='1'
          className={inputClass}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </Field>
      <button type='submit' className={secondaryButton} disabled={busy}>Salvar preferência</button>
    </form>
  );
}

export default function DriverWorkspace({ dashboard, busy, userId, run }: ConsoleActions) {
  const view = useAsync(
    driverWorkspace,
    userId + ':' + String(dashboard.driver?.online) + ':' + dashboard.offers.map((o) => o.leg_id).join(','),
  );
  const act = (key: string, fn: () => Promise<unknown>) =>
    run(key, async () => {
      await fn();
      view.reload();
    });
  const data = view.data;
  if (!data) return <ErrorAlert error={view.error} />;
  return (
    <Card className='space-y-5'>
      <ErrorAlert error={view.error} />
      <Preferences
        key={JSON.stringify([
          data.preferences.destination,
          data.preferences.arrive_by,
          data.preferences.cost_per_km,
        ])}
        areas={dashboard.areas}
        prefs={data.preferences}
        busy={busy}
        save={(area, time, cost) =>
          void act('driver-preference', () => saveDriverPreferences(area, time, cost))}
      />
      {data.preferences.terminals.length > 0 && (
        <section className='space-y-2'>
          <h3 className='font-semibold'>Fila de aeroporto</h3>
          {data.preferences.terminals.map((t) => (
            <div key={t.id} className='space-y-2'>
              <p>{t.name} · {t.instruction}</p>
              <p className='text-sm'>
                Ordem de entrada. Confirme sua presença a cada 10 minutos dentro de {t.radius_m}{' '}
                m da área de espera. Referência {t.reference}.
                {t.position != null &&
                  ' Sua posição é ' + t.position + ', válida até ' + formatDateTime(t.until) + '.'}
              </p>
              <button
                className={secondaryButton}
                disabled={busy || !dashboard.driver?.online}
                onClick={() =>
                  void act('join:' + t.id, async () => {
                    const point = dashboard.simulation
                      ? { lat: t.lat, lng: t.lng, accuracy: 1 }
                      : await devicePoint();
                    await joinAirport(t.id, true, point);
                  })}
              >
                {t.position
                  ? 'Renovar presença'
                  : dashboard.simulation
                  ? 'Entrar na fila com posição fictícia'
                  : 'Conferir posição e entrar na fila'}
              </button>
              {t.position != null && (
                <button
                  className={secondaryButton}
                  disabled={busy}
                  onClick={() => void act('leave:' + t.id, () => joinAirport(t.id, false))}
                >
                  Sair da fila
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <section className='space-y-2'>
        <h3 className='font-semibold'>Oportunidades e reservas futuras</h3>
        {data.opportunities.length === 0 ? <p>Nenhuma oportunidade compatível agora.</p> : (
          <ul>
            {data.opportunities.map((o) => (
              <li className='space-y-1 py-2' key={o.id}>
                <p>
                  {o.scheduled ? 'Reserva' : 'Corrida'} · {o.origin} → {o.destination} ·{' '}
                  {formatDateTime(o.pickup_at)} · {formatCents(o.driver_cents)}
                </p>
                <button
                  disabled={busy || o.interested}
                  className={secondaryButton}
                  onClick={() => void act('interest:' + o.id, () => interestInRide(o.id))}
                >
                  {o.interested ? 'Interesse registrado, aguardando oferta' : 'Tenho interesse'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className='text-sm'>A viagem só é atribuída ao aceitar uma oferta dentro da validade.</p>
      </section>
    </Card>
  );
}
