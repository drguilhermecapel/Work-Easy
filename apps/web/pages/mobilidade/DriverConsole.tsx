import { useEffect, useRef, useState, type ComponentType } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { secondaryButton } from '../../components/admin/styles';
import { useAuth } from '../../contexts/AuthContext';
import { useAsync } from '../../lib/useAsync';
import { watchDriverInbox } from '../../services/driverJourney';
import { getRideDashboard, type RideDashboard } from '../../services/rides';

export interface ConsoleActions {
  dashboard: RideDashboard;
  userId: string;
  busy: boolean;
  reload: () => void;
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
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    // Remove expired action tokens on startup. Stored values contain no location or passenger details.
    try {
      for (const key of Object.keys(localStorage).filter(k => k.startsWith('workeasy:ride-intent:'))) {
        try { if (JSON.parse(localStorage.getItem(key) ?? '{}').until<=Date.now()) localStorage.removeItem(key); }
        catch { localStorage.removeItem(key); }
      }
    } catch { /* Private browsing can disable storage. */ }
    const online = () => { setOffline(false); reload(); };
    const lost = () => setOffline(true);
    window.addEventListener('online',online);window.addEventListener('offline',lost);
    return () => {window.removeEventListener('online',online);window.removeEventListener('offline',lost);};
  }, [reload]);
  useEffect(() => {
    if (data?.dispatch_waves && data.driver?.online) return watchDriverInbox(userId, () => {
      if (document.visibilityState === 'visible' && !pending.current) reload();
    });
  }, [data?.dispatch_waves,data?.driver?.online,reload,userId]);
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
    if (offline || pending.current || !data?.enabled) return;
    pending.current = true;
    setWorking(true);
    setError(null);
    try {
      // Retrying an uncertain response reuses the key for that exact transition.
      // Persist only opaque leg-action tokens. A cold restart may follow a lost response.
      const durable = /^(accept:|decline:|release:|no-show:|[0-9a-f]{8}-)/i.test(intent);
      const storageKey = 'workeasy:ride-intent:'+userId+':'+intent;
      let persisted: string | undefined;
      if (durable) {
        try {
          const record = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as {key:string;until:number}|null;
          if (record && record.until>Date.now()) persisted=record.key;
        } catch { /* Storage may be disabled in a webview. The in-memory key remains available. */ }
      }
      const key = keys.current.get(intent) ?? persisted ?? crypto.randomUUID();
      if (durable) {
        try { localStorage.setItem(storageKey,JSON.stringify({key,until:Date.now()+86400000})); } catch { /* optional storage */ }
      }
      keys.current.set(intent, key);
      await action(key);
      keys.current.delete(intent);
      if (durable) { try { localStorage.removeItem(storageKey); } catch { /* optional storage */ } }
    } catch (err) {
      setError(err);
    } finally {
      pending.current = false;
      setWorking(false);
      reload();
    }
  };

  const busy = offline || working || loading;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <button type="button" className={secondaryButton} disabled={busy} onClick={reload}>
          Atualizar
        </button>
      </div>
      {offline && <p role="status">Sem conexão. A etapa será conferida no servidor ao reconectar.</p>}
      <ErrorAlert error={loadError ?? error} />
      {loading && !data && <PageStatus />}
      {data?.simulation && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Ensaio com dados fictícios. Os eventos registrados aqui não acionam veículos, cobranças ou repasses reais.
        </p>
      )}
      {data &&
        (data.enabled ? (
          <Content dashboard={data} userId={userId} busy={busy} run={run} reload={reload} />
        ) : (
          <p role="status" className="text-sm text-gray-700">
            O módulo de corridas está desativado neste ambiente.
          </p>
        ))}
    </div>
  );
}

export default function DriverConsole(props: ConsoleProps) {
  const { authUser } = useAuth();
  return authUser ? (
    <SessionConsole key={authUser.id} userId={authUser.id} {...props} />
  ) : (
    <p role="status" className="text-sm text-gray-700">
      Entre com uma conta para acessar o módulo de corridas.
    </p>
  );
}
