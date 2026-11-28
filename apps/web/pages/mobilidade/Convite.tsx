import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import PageStatus from '../../components/PageStatus';
import ErrorAlert from '../../components/ErrorAlert';
import { TaskButton } from '../../components/mobility/safety/common';
import { label, useSafetyPoll, when } from '../../components/mobility/safety/state';
import { safety } from '../../services/rideSafety';

// One page for every one-time invite of the ride module. The token travels in the fragment, which
// is not sent to servers, and the fragment's name says what the invite is:
//   #convite=  a trip shared with a trusted contact (the view below)
//   #viagem=   a ride someone else pays (PAR-501) or a company's guest trip (PAR-505)
//   #adesao=   joining a family, company or fleet account, or becoming a companion (PAR-502/503/508)
const RiderInvite = lazy(() => import('../../components/mobility/parties/RiderInvite'));
const GuestInvite = lazy(() => import('../../components/mobility/business/GuestInvite'));
const AccountInvite = lazy(() => import('../../components/mobility/parties/AccountInvite'));

const KINDS = ['convite', 'viagem', 'adesao'] as const;
type InviteKind = (typeof KINDS)[number];
const TOKEN = /^[a-f0-9]{64}$/;

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
interface Invite {
  kind: InviteKind;
  token: string;
}
const fromFragment = (hash: string): Invite | null => {
  const params = new URLSearchParams(hash.slice(1));
  for (const kind of KINDS) {
    const token = params.get(kind) ?? '';
    if (TOKEN.test(token)) return { kind, token };
  }
  return null;
};
const fromSession = (): Invite | null => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null');
    if (!stored || !(stored.expires > Date.now()) || !TOKEN.test(stored.token)) return null;
    // A record written before the other invite kinds existed is a trusted-contact share
    return { kind: KINDS.includes(stored.kind) ? stored.kind : 'convite', token: String(stored.token) };
  } catch {
    return null;
  }
};

export default function Convite() {
  const auth = useAuth();
  const hash = useLocation().hash;
  const [pending] = useState(fromSession);
  const invite = fromFragment(hash) ?? pending;
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
      <main className="mx-auto max-w-lg space-y-3 p-5">
        <h1 className="text-xl font-semibold">Convite de corridas</h1>
        <p>
          Entre na conta do e-mail convidado. Se o navegador bloquear a sessão temporária, abra novamente o convite após
          entrar.
        </p>
        <Link
          className="underline"
          to="/entrar?next=%2Fcorridas%2Fconvite"
          onClick={() => {
            try {
              if (invite) sessionStorage.setItem(pendingKey, JSON.stringify({ ...invite, expires: Date.now() + 3_600_000 }));
            } catch {
              /* Follow the original link after sign in. */
            }
          }}
        >
          Entrar para consultar
        </Link>
      </main>
    );
  if (!invite || invite.kind === 'convite') return <Invitation token={invite?.token ?? ''} />;
  return (
    <Suspense fallback={<PageStatus />}>
      {invite.kind === 'viagem' ? (
        // The same fragment carries both kinds: the ride invite is read first, the guest invite when it is not one
        <RiderInvite token={invite.token} fallback={<GuestInvite token={invite.token} />} />
      ) : (
        <AccountInvite token={invite.token} />
      )}
    </Suspense>
  );
}
