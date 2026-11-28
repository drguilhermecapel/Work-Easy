import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import Confirm from '../../components/mobility/business/Confirm';
import { card, cardTitle, field, hint, primary, roleName, secondary } from '../../components/mobility/business/shared';
import { RideDisplayMode } from '../../components/mobility/safety/common';
import { useAction } from '../../components/mobility/safety/state';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { formatDateBR } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { business, type OrgAccount, type OrgRole } from '../../services/rideBusiness';
import { getRideDashboard } from '../../services/rides';
import Ensaio from './Ensaio';

const Members = lazy(() => import('../../components/mobility/business/Members'));
const Programs = lazy(() => import('../../components/mobility/business/Programs'));
const Approvals = lazy(() => import('../../components/mobility/business/Approvals'));
const GuestDesk = lazy(() => import('../../components/mobility/business/GuestDesk'));
const Invoices = lazy(() => import('../../components/mobility/business/Invoices'));


// Which panels each role is offered. This only decides what is shown: every call is checked again
// by the database, which answers `ride_account_role_required` when the role does not allow it.
const PANELS: Record<'people' | 'approvals' | 'desk' | 'finance', OrgRole[]> = {
  people: ['admin', 'manager'],
  approvals: ['admin', 'approver'],
  desk: ['admin', 'operator'],
  finance: ['admin', 'manager'],
};
const may = (account: OrgAccount, panel: keyof typeof PANELS) => PANELS[panel].includes(account.role);

function CreateOrganization({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  // A retry of the same name reuses the key, so a lost answer never creates a second company.
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
      const id = await business.create(wanted, request.current.key);
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
        Nome da empresa
        <input className={field + ' mt-1'} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <p className={hint}>
        Depois de criar, a operação WorkEasy confere o contrato e os dados da empresa. Convites, vouchers e faturas
        ficam disponíveis após essa conferência.
      </p>
      <ErrorAlert error={error} />
      <button type="submit" className={primary} disabled={busy || !name.trim()}>
        {busy ? 'Criando…' : 'Criar conta de empresa'}
      </button>
    </form>
  );
}

function AccountStatus({
  account,
  userId,
  refresh,
  onLeft,
}: {
  account: OrgAccount;
  userId: string;
  refresh: () => void;
  /** The account leaves the list on the next read, so the page keeps the notice. */
  onLeft: (notice: string) => void;
}) {
  const leaving = useAction(refresh);
  return (
    <section className={card} aria-labelledby="empresa-conta">
      <h2 id="empresa-conta" className={cardTitle}>
        {account.name}
      </h2>
      <p>Seu papel: {roleName(account.role)}.</p>
      {account.verified ? (
        <p>
          Empresa conferida pela operação
          {account.verified_until && ' · conferência válida até ' + formatDateBR(account.verified_until)}.
        </p>
      ) : account.verified_until ? (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          A conferência desta empresa deixou de valer em {formatDateBR(account.verified_until)}. Novas viagens, convites e
          vouchers ficam parados até a operação WorkEasy conferir de novo; o relatório e as faturas continuam disponíveis
          para quem administra ou gere a conta.
        </p>
      ) : (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          Em análise pela operação WorkEasy. Você não precisa fazer nada agora: quando a conferência do contrato e dos
          dados terminar, pessoas, vouchers, central de viagens e faturas aparecem aqui.
        </p>
      )}
      {!account.owner && account.role !== 'admin' && (
        <Confirm
          label="Sair desta empresa"
          confirmLabel="Confirmar saída"
          busy={leaving.busy}
          onConfirm={async () => {
            let left = false;
            await leaving.run('leave:' + account.id, async (key) => {
              await business.removeMember(account.id, userId, key);
              left = true;
              onLeft('Você saiu de ' + account.name + '.');
              return '';
            });
            return left;
          }}
        >
          Sair de {account.name}? Você deixa de viajar pelo perfil profissional desta empresa. Suas viagens anteriores
          continuam registradas e, para voltar, será preciso um novo convite.
        </Confirm>
      )}
      {leaving.message}
    </section>
  );
}

function Workspace({ userId }: { userId: string }) {
  const result = useAsync(async () => {
    const dashboard = await getRideDashboard();
    // With the module off the account calls are refused; the page then only says so.
    const accounts = dashboard.enabled ? await business.accounts() : [];
    return { dashboard, accounts, loaded: Date.now() };
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
  const { dashboard, accounts, loaded } = result.data;
  const account = accounts.find((item) => item.id === selected) ?? accounts[0];
  const created = (id: string) => {
    setSelected(id);
    setNotice('Empresa criada. A operação WorkEasy vai conferir os dados antes de liberar convites e vouchers.');
    reload();
  };
  const usable = account?.verified;
  // A company whose check lapsed keeps reading what it already owes: the report and the invoices.
  const lapsed = !!account && !account.verified && !!account.verified_until;
  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-8 text-gray-800">
      <Link to="/corridas" className="text-primary underline">
        Voltar para Corridas
      </Link>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Building2 aria-hidden="true" />
          Empresa
        </h1>
        <p>Viagens pagas pela empresa: pessoas e papéis, centros de custo, vouchers, convidados e faturas.</p>
        {dashboard.enabled && dashboard.simulation && (
          <p role="status" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">
            Ambiente de ensaio. Empresas, vouchers e faturas usam dados fictícios e não geram cobrança.
          </p>
        )}
      </header>
      <ErrorAlert error={result.error} />
      {notice && <p role="status">{notice}</p>}
      {!dashboard.enabled ? (
        <p>Contas de empresa estão indisponíveis neste ambiente.</p>
      ) : !account ? (
        <section className={card} aria-labelledby="empresa-criar">
          <h2 id="empresa-criar" className={cardTitle}>
            Criar conta de empresa
          </h2>
          <p>
            Você ainda não participa de nenhuma empresa. Crie a conta da sua empresa abaixo ou, se recebeu um convite de
            adesão, abra o link do convite com o e-mail convidado.
          </p>
          <CreateOrganization onCreated={created} />
        </section>
      ) : (
        <>
          {accounts.length > 1 && (
            <label className="block">
              Empresa
              <select className={field + ' mt-1'} value={account.id} onChange={(event) => setSelected(event.target.value)}>
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <AccountStatus key={'conta:' + account.id} account={account} userId={userId} refresh={reload} onLeft={setNotice} />
          {usable && (
            <Suspense fallback={<p role="status">Carregando painéis…</p>}>
              <Programs programs={account.programs ?? []} now={loaded} />
              <Approvals key={'pedidos:' + account.id} account={account} canDecide={may(account, 'approvals')} refresh={reload} />
              {may(account, 'desk') && (
                <GuestDesk key={'central:' + account.id} account={account} areas={dashboard.areas} refresh={reload} />
              )}
              {may(account, 'people') && <Members key={'pessoas:' + account.id} account={account} userId={userId} refresh={reload} />}
              {may(account, 'finance') && <Invoices key={'faturas:' + account.id} account={account} />}
            </Suspense>
          )}
          {lapsed && may(account, 'finance') && (
            <Suspense fallback={<p role="status">Carregando painéis…</p>}>
              <Invoices key={'faturas:' + account.id} account={account} />
            </Suspense>
          )}
          <details className="rounded-2xl border border-gray-200 bg-white p-5">
            <summary className="cursor-pointer font-semibold">Criar outra conta de empresa</summary>
            <div className="mt-3">
              <CreateOrganization onCreated={created} />
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

export default function Empresa() {
  const auth = useAuth();
  if (!backendEnabled || auth.mode !== 'backend')
    return (
      <>
        <p className="mx-auto max-w-2xl px-4 pt-8 text-gray-800">
          Contas de empresa precisam de uma conta WorkEasy conectada. Abaixo, o ensaio local de corrida com dados
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
