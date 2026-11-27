import { useEffect, useRef } from 'react';
import { useAsync } from '../../../lib/useAsync';
import { offerAssistance, readPickupCue, sendPickupCue } from '../../../services/rideSafety';
import { TaskButton } from './common';
import { useAction, useSafetyPoll, label } from './state';

export function OfferAssistance({ leg }: { leg: string }) {
  const result = useAsync(() => offerAssistance(leg), leg);
  return result.data && result.data !== 'none' ? (
    <p>Assistência pedida: {label(result.data)} · sem adicional.</p>
  ) : null;
}
export function DriverCue({ leg }: { leg: string }) {
  const a = useAction();
  return (
    <div>
      <TaskButton
        disabled={a.busy}
        onClick={() =>
          void a.run('arrival-cue', async (key) => {
            await sendPickupCue(leg, key);
            return 'Sinal de chegada registrado para o passageiro.';
          })
        }
      >
        Sinalizar presença no embarque
      </TaskButton>
      {a.message}
    </div>
  );
}
export function PassengerCue({ leg }: { leg: string }) {
  const result = useSafetyPoll(() => readPickupCue(leg), leg);
  const player = useRef<AudioContext | null>(null);
  const lastAt = useRef<string | null>(null);
  const a = useAction();
  useEffect(
    () => () => {
      void player.current?.close();
    },
    [],
  );
  useEffect(() => {
    const data = result.data;
    const context = player.current;
    if (data?.mode !== 'sound' || context?.state !== 'running' || lastAt.current === data.at) return;
    lastAt.current = data.at;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 560;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
  }, [result.data]);
  return (
    <div>
      {result.data && (
        <p
          role="status"
          className={result.data.mode === 'visual' ? 'rounded-lg border-4 border-current p-3 font-bold' : ''}
        >
          O motorista sinalizou que está no ponto de embarque.
        </p>
      )}
      <TaskButton
        onClick={() =>
          void a.run('enable-audio', async () => {
            player.current ??= new AudioContext();
            await player.current.resume();
            result.reload();
            return 'Som habilitado neste aparelho para a preferência de aviso sonoro.';
          })
        }
      >
        Habilitar som do sinal neste aparelho
      </TaskButton>
      {a.message}
    </div>
  );
}
