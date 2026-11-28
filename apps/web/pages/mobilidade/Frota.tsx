import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import { banner, card, cardTitle, field, hint, primary, roleName, secondary } from '../../components/mobility/fleet/shared';
import { RideDisplayMode } from '../../components/mobility/safety/common';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { formatDateBR } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { fleets, type FleetAccount } from '../../services/rideFleets';
import { getRideDashboard } from '../../services/rides';
import Ensaio from './Ensaio';

const FleetPanel = lazy(() => import('../../components/mobility/fleet/FleetPanel'));

function CreateFleet({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  // A retry of the same name reuses the key, so a lost answer never creates a second fleet.
  const request = useRef<{ name: string; key: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const wanted = name.trim();
    if (sending.current || !wanted) return;
    if (request.current?.name !== wanted) request.current = { name: wanted, key: crypto.randomUUID() };
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const id = await fleets.create(wanted, request.current.key);
      request.current = null;
      setName('');
      onCreated(id);
    } catch (err) {
      setError(err);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <label className="block">
        Nome da frota
        <input className={field} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <p className={hint}>
        Depois de criar, a operação WorkEasy confere o contrato e os dados da frota. O cadastro de veículos e os
        convites para motoristas ficam disponíveis após essa conferência.
      </p>
      <ErrorAlert error={error} />
      <button type="submit" className={primary} disabled={busy || !name.trim()}>
        {busy ? 'Criando…' : 'Criar conta de frota'}
      </button>
    </form>
  );
}

function AccountStatus({ account }: { account: FleetAccount }) {
  return (
    <section className={card} aria-labelledby="frota-conta">
      <h2 id="frota-conta" className={cardTitle}>
        {account.name}
      </h2>
      <p>Seu papel: {roleName(account.role)}.</p>
      {account.verified ? (
        <p>
          Frota conferida pela operação
          {account.verified_until && ' · conferência válida até ' + formatDateBR(account.verified_until)}.
        </p>
      ) : (
        <div role="status" className={banner + ' space-y-2'}>
          <p>
            Em análise pela operação WorkEasy. Você não precisa fazer nada agora: quando a conferência do contrato e dos
            dados terminar, veículos, motoristas e o resumo do mês aparecem aqui.
          </p>
          <p>
            Se a operação pedir, informe o código da conta: <span className="break-all font-mono">{account.id}</span>
          </p>
        </div>
      )}
    </section>
  );
}

function Workspace({ userId }: { userId: string }) {
  const result = useAsync(async () => {
    const dashboard = await getRideDashboard();
    // With the module off the account calls are refused; the page then only says so.
    const accounts = dashboard.enabled ? await fleets.accounts() : [];
    return { dashboard, accounts };
  }, userId);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const reload = result.reload;
  const enabled = result.data?.dashboard.enabled;
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
  if (!result.data && result.loading) return <PageStatus />;
  if (!result.data)
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-8">
        <ErrorAlert error={result.error} />
        <button type="button" onClick={reload} className={secondary}>
          Tentar novamente
        </button>
      </div>
    );
  const { dashboard, accounts } = result.data;
  const account = accounts.find((item) => item.id === selected) ?? accounts[0];
  const created = (id: string) => {
    setSelected(id);
    setNotice('Frota criada. A operação WorkEasy vai conferir os dados antes de liberar veículos e convites.');
    reload();
  };
  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-8 text-gray-800">
      <nav aria-label="Voltar" className="flex flex-wrap gap-4">
        <Link to="/corridas/motorista" className="text-primary underline">
          Área do motorista
        </Link>
        <Link to="/corridas" className="text-primary underline">
          Corridas
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Truck aria-hidden="true" />
          Frota
        </h1>
        <p>Veículos da frota, cessão a motoristas e o resumo das corridas feitas com esses veículos.</p>
        {dashboard.enabled && dashboard.simulation && (
          <p role="status" className={banner + ' font-semibold'}>
            Ambiente de ensaio. Frotas, veículos e valores usam dados fictícios e não geram cobrança nem repasse.
          </p>
        )}
      </header>
      <ErrorAlert error={result.error} />
      {notice && <p role="status">{notice}</p>}
      {!dashboard.enabled ? (
        <p>Contas de frota estão indisponíveis neste ambiente.</p>
      ) : !account ? (
        <section className={card} aria-labelledby="frota-criar">
          <h2 id="frota-criar" className={cardTitle}>
            Criar conta de frota
          </h2>
          <p>
            Você ainda não participa de nenhuma frota. Se é dono ou locador de veículos, crie a conta abaixo. Se é
            motorista e recebeu um convite, abra o link do convite com o e-mail convidado.
          </p>
          <CreateFleet onCreated={created} />
        </section>
      ) : (
        <>
          {accounts.length > 1 && (
            <label className="block">
              Frota
              <select className={field} value={account.id} onChange={(event) => setSelected(event.target.value)}>
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <AccountStatus account={account} />
          {account.verified && (
            <Suspense fallback={<p role="status">Carregando a frota…</p>}>
              <FleetPanel key={account.id} account={account} userId={userId} refresh={reload} onLeft={setNotice} />
            </Suspense>
          )}
          <details className="rounded-2xl border border-gray-200 bg-white p-5">
            <summary className="cursor-pointer font-semibold">Criar outra conta de frota</summary>
            <div className="mt-3">
              <CreateFleet onCreated={created} />
            </div>
          </details>
        </>
      )}
      <button type="button" onClick={reload} disabled={result.loading} className={secondary}>
        Atualizar
      </button>
    </section>
  );
}

export default function Frota() {
  const auth = useAuth();
  if (!backendEnabled || auth.mode !== 'backend')
    return (
      <>
        <p className="mx-auto max-w-2xl px-4 pt-8 text-gray-800">
          Contas de frota precisam de uma conta WorkEasy conectada. Abaixo, o ensaio local de corrida com dados
          fictícios.
        </p>
        <Ensaio />
      </>
    );
  return (
    <RequireSession>
      <RideDisplayMode />
      <Workspace key={auth.authUser?.id ?? ''} userId={auth.authUser?.id ?? ''} />
    </RequireSession>
  );
}
