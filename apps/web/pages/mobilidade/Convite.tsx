import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import PageStatus from '../../components/PageStatus';
import ErrorAlert from '../../components/ErrorAlert';
import { TaskButton } from '../../components/mobility/safety/common';
import { label, useSafetyPoll, when } from '../../components/mobility/safety/state';
import { safety } from '../../services/rideSafety';
function Invitation({ token }: { token: string }) {
  const { authUser } = useAuth();
  const [now, setNow] = useState(Date.now);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener('offline', sync);
    window.addEventListener('online', sync);
    return () => {
      clearInterval(tick);
      window.removeEventListener('offline', sync);
      window.removeEventListener('online', sync);
    };
  }, []);
  const result = useSafetyPoll(() => safety.shared(token), (authUser?.id ?? '') + ':' + token);
  const available = online && !result.error && result.data && Date.parse(result.data.expires_at) > now;
  const d = available ? result.data : null;
  return (
    <main className="mx-auto max-w-lg space-y-4 p-5">
      <h1 className="text-xl font-semibold">Viagem compartilhada</h1>
      {d ? (
        <>
          <p>
            {d.simulation ? 'Ensaio · ' : ''}
            {label(d.status)}
          </p>
          {d.eta && <p>Previsão de chegada {when(d.eta)}</p>}
          {d.approximate_position && (
            <p>
              Posição aproximada {d.approximate_position.lat}°, {d.approximate_position.lng}° ·{' '}
              {when(d.approximate_position.at)}
            </p>
          )}
          <p>Convite válido até {when(d.expires_at)}</p>
        </>
      ) : (
        !result.loading && (
          <p>
            {online
              ? 'Convite indisponível para esta conta ou encerrado.'
              : 'Sem conexão. Reconecte para confirmar se o convite continua válido.'}
          </p>
        )
      )}
      <TaskButton onClick={result.reload}>Atualizar situação</TaskButton>
      <ErrorAlert error={result.error} />
    </main>
  );
}
const pendingKey = 'ride-invite-session';
export default function Convite() {
  const auth = useAuth();
  const hash = useLocation().hash;
  const fromLink = new URLSearchParams(hash.slice(1)).get('convite') ?? '';
  const [pending] = useState(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null');
      return stored && stored.expires > Date.now() && /^[a-f0-9]{64}$/.test(stored.token) ? String(stored.token) : '';
    } catch {
      return '';
    }
  });
  const token = /^[a-f0-9]{64}$/.test(fromLink) ? fromLink : pending;
  useEffect(() => {
    if (auth.isAuthenticated) {
      try {
        sessionStorage.removeItem(pendingKey);
      } catch {
        /* Private browser. */
      }
    }
  }, [auth.isAuthenticated]);
  if (auth.loading) return <PageStatus />;
  if (!auth.isAuthenticated)
    return (
      <main className="mx-auto max-w-lg p-5">
        <h1>Viagem compartilhada</h1>
        <p>
          Entre na conta do e-mail convidado. Se o navegador bloquear a sessão temporária, abra novamente o convite após
          entrar.
        </p>
        <Link
          className="underline"
          to="/entrar?next=%2Fcorridas%2Fconvite"
          onClick={() => {
            try {
              if (token) sessionStorage.setItem(pendingKey, JSON.stringify({ token, expires: Date.now() + 3_600_000 }));
            } catch {
              /* Follow the original link after sign in. */
            }
          }}
        >
          Entrar para consultar
        </Link>
      </main>
    );
  return <Invitation token={token} />;
}
