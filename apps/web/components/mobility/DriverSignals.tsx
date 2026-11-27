import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { db } from '../../services/client';
import { enableRideAlerts, startRideLocation } from '../../platform/rideSignals';

const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold';
function SignalControl({ legId }: { legId?: string }) {
  const active = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('');
  const [on, setOn] = useState(false);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [legId],
  );
  if (!Capacitor.isNativePlatform()) return null;
  async function toggle() {
    if (active.current) {
      active.current.abort();
      active.current = null;
      setOn(false);
      setStatus('Desativado.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setOn(true);
    setStatus('Solicitando autorização…');
    const update = (text: string) => {
      if (!controller.signal.aborted) setStatus(text);
    };
    try {
      if (legId) await startRideLocation(legId, controller.signal, update);
      else await enableRideAlerts(controller.signal, update);
    } catch (error) {
      if (!controller.signal.aborted) {
        setStatus(error instanceof Error ? error.message : 'Não foi possível ativar.');
        controller.abort();
        active.current = null;
        setOn(false);
      }
    }
  }
  return (
    <div>
      <button type="button" className={button} onClick={toggle}>
        {on ? 'Desativar' : 'Ativar'} {legId ? 'localização deste trecho' : 'alertas de ofertas'}
      </button>
      <p role="status" className="text-sm">
        {status}
      </p>
    </div>
  );
}

export default function DriverSignals({ legId }: { legId: string }) {
  const [minutes, setMinutes] = useState('');
  const [status, setStatus] = useState('');
  return (
    <div className="space-y-2">
      <SignalControl key={legId} legId={legId} />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await db().rpc('ride_report_eta', { p_leg: legId, p_minutes: Number(minutes) });
          setStatus(error ? 'Falha ao enviar a previsão.' : 'Previsão enviada.');
        }}
      >
        <label className="text-sm">
          Previsão de chegada (minutos)
          <input
            className="ml-2 w-20 rounded border p-2"
            type="number"
            required
            min={1}
            max={180}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <button className={button}>Informar previsão</button>
      </form>
      <p role="status" className="text-sm">
        {status}
      </p>
    </div>
  );
}
export function DriverAlerts() {
  return <SignalControl />;
}
