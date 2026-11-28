import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import { RideDisplayMode } from '../../components/mobility/safety/common';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { parties } from '../../services/rideParties';
import { getRideDashboard } from '../../services/rides';
import Ensaio from './Ensaio';

const FamilyPanel = lazy(() => import('../../components/mobility/parties/FamilyPanel'));
const CompanionPanel = lazy(() => import('../../components/mobility/parties/CompanionPanel'));
const DependentPanel = lazy(() => import('../../components/mobility/parties/DependentPanel'));
const SentRiderInvites = lazy(() =>
  import('../../components/mobility/parties/InviteRider').then((module) => ({ default: module.SentRiderInvites })),
);

const secondary = 'rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 disabled:opacity-50';

function Groups({ userId }: { userId: string }) {
  const dashboard = useAsync(() => getRideDashboard(), 'dashboard:' + userId);
  const overview = useAsync(() => parties.overview(), 'parties:' + userId);
  const reload = overview.reload;
  const enabled = dashboard.data?.enabled;
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, reload]);
  if (!dashboard.data && dashboard.loading) return <PageStatus />;
  const data = overview.data;
  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-gray-800">
      <Link to="/corridas" className="text-primary underline">
        Voltar às corridas
      </Link>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users aria-hidden="true" />
          Grupos e pessoas de confiança
        </h1>
        <p>
          Defina quem viaja e quem paga: um grupo familiar com limites, um acompanhante de confiança ou um adolescente
          sob sua responsabilidade. Quem viaja sempre usa a própria conta.
        </p>
        {dashboard.data?.enabled && dashboard.data.simulation && (
          <p role="status" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">
            Ambiente de ensaio. Grupos, convites e valores são fictícios. Use contas de teste.
          </p>
        )}
      </header>
      <ErrorAlert error={dashboard.error} />
      {dashboard.data && !dashboard.data.enabled ? (
        <p>Grupos, acompanhantes e dependentes estão indisponíveis neste ambiente.</p>
      ) : (
        <>
          <ErrorAlert error={overview.error} />
          {!data && overview.loading && <PageStatus />}
          {data && (
            <Suspense fallback={<p role="status">Carregando…</p>}>
              <FamilyPanel accounts={data.accounts} onChange={reload} />
              <CompanionPanel companions={data.companions} invites={data.companionInvites} onChange={reload} />
              <DependentPanel accounts={data.accounts} dependents={data.dependents} onChange={reload} />
              <section aria-labelledby="viagens-para-outra-pessoa" className="space-y-3">
                <h2 id="viagens-para-outra-pessoa" className="text-lg font-semibold">
                  Viagens pedidas para outra pessoa
                </h2>
                <p>
                  Para pagar a corrida de outro adulto, faça a cotação em Corridas e escolha “Pedir para outra pessoa”.
                  Os convites enviados ficam aqui.
                </p>
                <SentRiderInvites emptyText="Nenhum convite de viagem enviado." />
              </section>
            </Suspense>
          )}
          <button type="button" onClick={reload} disabled={overview.loading} className={secondary}>
            Atualizar grupos
          </button>
        </>
      )}
    </section>
  );
}

export default function Grupos() {
  const auth = useAuth();
  if (!backendEnabled || auth.mode !== 'backend')
    return (
      <>
        <p className="mx-auto max-w-2xl px-4 pt-6 text-sm text-gray-600">
          Grupos, acompanhantes e dependentes precisam de uma conta. Abaixo, o ensaio local de corrida.
        </p>
        <Ensaio />
      </>
    );
  return (
    <RequireSession>
      <RideDisplayMode />
      <Groups key={auth.authUser?.id} userId={auth.authUser?.id ?? ''} />
    </RequireSession>
  );
}
