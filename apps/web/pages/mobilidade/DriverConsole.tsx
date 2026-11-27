import { useEffect, useRef, useState, type ComponentType } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { secondaryButton } from '../../components/admin/styles';
import { useAuth } from '../../contexts/AuthContext';
import { useAsync } from '../../lib/useAsync';
import { getRideDashboard, type RideDashboard } from '../../services/rides';

export interface ConsoleActions {
  dashboard: RideDashboard;
  userId: string;
  busy: boolean;
  run: (intent: string, action: (key: string) => Promise<unknown>) => Promise<void>;
}

interface ConsoleProps {
  title: string;
  content: ComponentType<ConsoleActions>;
}

function SessionConsole({ title, content: Content, userId }: ConsoleProps & { userId: string }) {
  const { data, loading, reload, error: loadError } = useAsync(getRideDashboard, userId);
  const pending = useRef(false);
  const keys = useRef(new Map<string, string>());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!data?.enabled) return;
    const refresh = () => {
      if (document.visibilityState === 'visible' && !pending.current) reload();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [data?.enabled, reload]);

  const run: ConsoleActions['run'] = async (intent, action) => {
    if (pending.current || !data?.enabled) return;
    pending.current = true;
    setWorking(true);
    setError(null);
    try {
      // Retrying an uncertain response reuses the key for that exact transition.
      const key = keys.current.get(intent) ?? crypto.randomUUID();
      keys.current.set(intent, key);
      await action(key);
      keys.current.delete(intent);
    } catch (err) {
      setError(err);
    } finally {
      pending.current = false;
      setWorking(false);
      reload();
    }
  };

  const busy = working || loading;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <button type="button" className={secondaryButton} disabled={busy} onClick={reload}>Atualizar</button>
      </div>
      <ErrorAlert error={loadError ?? error} />
      {loading && !data && <PageStatus />}
      {data?.simulation && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Ensaio com dados fictícios. Os eventos registrados aqui não acionam veículos, cobranças ou repasses reais.
        </p>
      )}
      {data && (data.enabled
        ? <Content dashboard={data} userId={userId} busy={busy} run={run} />
        : <p role="status" className="text-sm text-gray-700">O módulo de corridas está desativado neste ambiente.</p>)}
    </div>
  );
}

export default function DriverConsole(props: ConsoleProps) {
  const { authUser } = useAuth();
  return authUser
    ? <SessionConsole key={authUser.id} userId={authUser.id} {...props} />
    : <p role="status" className="text-sm text-gray-700">Entre com uma conta para acessar o módulo de corridas.</p>;
}
