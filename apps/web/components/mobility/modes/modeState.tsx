import { useEffect, useRef, useState } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { formatDateTime } from '../../admin/format';
import { toAppError } from '../../../lib/errors';
import { saoPauloDateTime } from '../../../lib/timezone';
import { useAsync } from '../../../lib/useAsync';

// Shared by the reserve, shuttle, hourly and intercity panels: styles, São Paulo time, the plain
// sentence of each refusal of these modes, one action at a time with a reusable idempotency key.

export const card = 'space-y-3 rounded-2xl border border-gray-200 bg-white p-5';
export const inset = 'space-y-2 rounded-xl border border-gray-200 p-4';
export const primary = 'rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
export const secondary =
  'rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 disabled:opacity-50';
export const danger =
  'rounded-xl border border-red-200 bg-white px-4 py-2 font-semibold text-red-700 disabled:opacity-50';
export const field = 'mt-1 block w-full rounded-xl border border-gray-300 bg-white p-2.5 text-gray-900';
export const banner = 'rounded-xl bg-amber-50 p-3 font-semibold text-amber-900';
export const SIMULATION = 'Ensaio com dados fictícios. Nada aqui aciona veículos, cobranças ou repasses.';

/** "23/10/2030 09:00 (São Paulo)". */
export const whenSP = (iso: string | null | undefined) => {
  const text = formatDateTime(iso);
  return text ? text + ' (São Paulo)' : 'horário não informado';
};

/** Value of a datetime-local field, read as São Paulo wall time → ISO instant; null when unreadable. */
export const toInstant = (value: string): string | null => {
  const [day, time] = value.split('T');
  return day && time ? (saoPauloDateTime(day, time)?.toISOString() ?? null) : null;
};

/** The instant is readable and still ahead of the clock. */
export const isFuture = (instant: string | null): instant is string => !!instant && Date.parse(instant) > Date.now();

export const hours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!h) return rest + ' min';
  return h + (h === 1 ? ' hora' : ' horas') + (rest ? ' e ' + rest + ' min' : '');
};

const REFUSALS: Record<string, string> = {
  ride_modality_unavailable: 'Esta modalidade não está disponível para este trajeto e horário.',
  ride_reserve_window: 'O horário pedido está fora da janela aceita para esta reserva. Escolha outro horário.',
  ride_terminal_unavailable: 'Este terminal não tem ponto de embarque autorizado.',
  ride_seat_unavailable: 'Não há assentos suficientes nesta partida. Escolha outra partida ou menos assentos.',
  ride_block_unavailable: 'Este bloco de horas não está disponível para a área e o horário escolhidos.',
  ride_extension_unavailable:
    'A extensão não cabe na agenda do motorista. O bloco contratado continua valendo, sem cobrança adicional.',
  ride_corridor_unavailable:
    'Não há corredor entre municípios autorizado para este trajeto e horário. Nenhuma cotação foi criada.',
  requote_required: 'O preço mudou desde a consulta. Confira o valor atualizado antes de confirmar.',
};

/** The database rule behind a failure, also before the code is listed in lib/errors.ts. */
export const refusalCode = (err: unknown): string => {
  const failure = toAppError(err);
  const raised = failure.detail?.trim().match(/^[a-z_]+/)?.[0];
  if (raised && raised in REFUSALS) return raised;
  return failure.code !== 'unknown' ? failure.code : (raised ?? 'unknown');
};

/** The failure as an alert: the sentence of this mode when there is one, the general one otherwise. */
export const failureAlert = (err: unknown) => {
  if (!err) return null;
  const text = REFUSALS[refusalCode(err)];
  return text ? (
    <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
      {text}
    </p>
  ) : (
    <ErrorAlert error={err} />
  );
};

/**
 * One action at a time. The idempotency key of an intent is kept until the action succeeds, so a
 * retry after an uncertain answer repeats the same key; another intent gets another key.
 */
export function useModeAction(refresh?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const keys = useRef(new Map<string, string>());
  async function run(intent: string, work: (key: string) => Promise<string | void>) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    const key = keys.current.get(intent) ?? crypto.randomUUID();
    keys.current.set(intent, key);
    try {
      const result = await work(key);
      keys.current.delete(intent);
      setNotice(result ?? 'Atualizado.');
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
      refresh?.();
    }
  }
  return {
    busy,
    run,
    failed: error ? refusalCode(error) : null,
    message: (
      <>
        {failureAlert(error)}
        {notice && <p role="status">{notice}</p>}
      </>
    ),
  };
}

/**
 * useAsync refreshed every `ms` while the page is visible, and when it becomes visible again.
 * `enabled` may look at what was read: a panel with nothing to show stops asking, a failed read keeps trying.
 */
export function usePoll<T>(
  load: () => Promise<T>,
  key: string,
  ms = 30_000,
  enabled: boolean | ((data: T | undefined, failed: boolean) => boolean) = true,
) {
  const result = useAsync(load, key);
  const reload = result.reload;
  const on = typeof enabled === 'function' ? enabled(result.data, !!result.error) : enabled;
  useEffect(() => {
    if (!on) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const timer = window.setInterval(refresh, ms);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [on, ms, reload]);
  return result;
}
