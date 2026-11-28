import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { formatDateTime } from '../../components/admin/format';
import { inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Card, EmptyState, Field } from '../../components/admin/ui';
import { useAction } from '../../components/mobility/safety/state';
import { useAuth } from '../../contexts/AuthContext';
import { formatCents } from '../../lib/money';
import { backendEnabled } from '../../lib/supabase';
import { formatDateBR, lastBookableDayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import {
  partiesAdmin,
  type CessionDossier,
  type QueueAccount,
  type QueueCession,
  type QueueDependent,
  type QueueDispute,
  type QueueInvoice,
} from '../../services/ridePartiesAdmin';
import { getRideDashboard, type RideDashboard } from '../../services/rides';
import { attempt, evidenceProblem, EVIDENCE, monthName, type Action } from './ridePartyFormat';
import { Confirm, VerifyAccount } from './ridePartyUi';
import VoucherRow from './ridePartyVoucherRow';

// Operator console of stage 5 (O17 PAR-502..508). One reading lists what awaits the operation:
// accounts to check, dependents and fleet cessions to review, months to close and contestations
// to decide; each decision is taken on its own row. The database refuses every call from anyone
// who is not an administrator of the operation, and a reviewer who belongs to the account.

const Programs = lazy(() => import('./RidePartyPrograms'));
const Manual = lazy(() => import('./RidePartyManual'));

const KINDS = { organization: 'Empresa', fleet: 'Frota' };
const BANDS = { '13-15': '13 a 15 anos', '16-17': '16 ou 17 anos' };
const LINES: Record<string, string> = { voucher: 'Voucher de viagem', refund: 'Estorno', adjustment: 'Ajuste' };
const BENEFICIARIES = { driver: 'motorista', fleet: 'frota' };
const VEHICLES: Record<string, string> = { compact: 'Compacto', sedan: 'Sedã', van: 'Van' };
const row = 'space-y-3 border-l-2 border-primary/30 pl-3';

function Queue<T>({
  id,
  title,
  intro,
  empty,
  items,
  reload,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  empty: string;
  items: T[];
  reload: () => void;
  /** One row of the queue, with the section's action: the notice stays after the row leaves. */
  children: (item: T, action: Action) => ReactNode;
}) {
  const action = useAction(reload);
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-semibold">
        {title} ({items.length})
      </h2>
      <p className="text-sm text-gray-600">{intro}</p>
      {items.length ? (
        <Card>
          <ul className="space-y-5">{items.map((item) => children(item, action))}</ul>
        </Card>
      ) : (
        <EmptyState>{empty}</EmptyState>
      )}
      {action.message}
    </section>
  );
}

function AccountRow({ item, action }: { item: QueueAccount; action: Action }) {
  const state =
    item.state === 'pending'
      ? 'nunca conferida'
      : item.state === 'lapsed'
        ? `conferência encerrada em ${formatDateBR(item.verified_until!)}`
        : `conferência termina em ${formatDateBR(item.verified_until!)}`;
  return (
    <li className={row}>
      <h3 className="font-semibold text-gray-900">
        {item.name} · {KINDS[item.kind]}
      </h3>
      <p className="text-sm">
        Conta criada em {formatDateTime(item.created_at)} · {state}.
        {item.state === 'pending' && ' Até a conferência, a conta não convida pessoas nem opera.'}
      </p>
      <VerifyAccount account={item.id} name={item.name} withdrawable={item.state === 'expiring'} action={action} />
    </li>
  );
}

function DependentRow({ item, action }: { item: QueueDependent; action: Action }) {
  const [evidence, setEvidence] = useState('');
  const [until, setUntil] = useState('');
  const proof = evidence.trim();
  const ready = EVIDENCE.test(proof);
  const id = 'dependente-' + item.id;
  const who = `${item.label} (${BANDS[item.age_band]})`;
  return (
    <li className={row}>
      <h3 className="font-semibold text-gray-900">{who}</h3>
      <p className="text-sm">Cadastro enviado em {formatDateTime(item.requested_at)}.</p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || !until) return;
          void action.run('approve:' + item.id, async () => {
            await partiesAdmin.reviewDependent(item.id, true, proof, until);
            return `Vínculo de ${who} aprovado até ${formatDateBR(until)}.`;
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id={id + '-evidencia'}
            label={'Referência da evidência conferida de ' + item.label}
            hint="Só o código do dossiê. Não registre data de nascimento nem número de documento."
            error={evidenceProblem(proof)}
          >
            <input id={id + '-evidencia'} type="text" className={inputClass} maxLength={80} value={evidence} onChange={(event) => setEvidence(event.target.value)} />
          </Field>
          <Field id={id + '-validade'} label={'Vínculo de ' + item.label + ' válido até'} hint="Só para aprovar. De amanhã a 12 meses.">
            <input
              id={id + '-validade'}
              type="date"
              className={inputClass}
              min={lastBookableDayInSaoPaulo(new Date(), 1)}
              max={lastBookableDayInSaoPaulo(new Date(), 365)}
              value={until}
              onChange={(event) => setUntil(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={action.busy || !ready || !until}>
            Aprovar vínculo de {item.label}
          </button>
          <Confirm
            label={'Recusar vínculo de ' + item.label}
            confirmLabel="Confirmar recusa"
            disabled={!ready}
            busy={action.busy}
            onConfirm={() =>
              attempt(action, 'reject:' + item.id, async () => {
                await partiesAdmin.reviewDependent(item.id, false, proof, null);
                return `Vínculo de ${who} recusado.`;
              })
            }
          >
            Recusar o vínculo de {who}? O responsável não poderá pedir corridas para este dependente e precisará fazer um
            novo cadastro para outra revisão.
          </Confirm>
        </div>
      </form>
    </li>
  );
}

function Dossier({ dossier }: { dossier: CessionDossier | undefined }) {
  if (!dossier) return <p className="text-sm">Esta cessão saiu da revisão. Atualize a fila.</p>;
  const parts = [
    ['Documento do veículo', dossier.document_ref, dossier.vehicle_until],
    ['Seguro', dossier.insurance_ref, dossier.insurance_until],
    ['Revisão ou vistoria', dossier.inspection_ref, dossier.inspection_until],
  ];
  return (
    <ul className="space-y-1 rounded-xl bg-gray-50 p-3 text-sm">
      <li>
        Categoria {VEHICLES[dossier.category] ?? dossier.category} · contrato de cessão {dossier.cession_ref} ·
        beneficiário contratado: {BENEFICIARIES[dossier.beneficiary]}
      </li>
      {parts.map(([name, ref, until]) => (
        <li key={name}>
          {name}: {ref} · válido até {formatDateBR(until)}
        </li>
      ))}
      <li>
        {dossier.driver_vehicle_match
          ? 'O identificador é o mesmo do veículo no cadastro do motorista.'
          : 'Atenção: o identificador não é o do veículo no cadastro do motorista. Aprovada assim, a cessão não libera ofertas.'}
      </li>
      {!dossier.account_verified && <li>Atenção: a frota está sem conferência vigente; a aprovação será recusada.</li>}
    </ul>
  );
}

function CessionRow({ item, action }: { item: QueueCession; action: Action }) {
  const [reference, setReference] = useState('');
  const [open, setOpen] = useState(false);
  // Read only when asked: the references the fleet declared, from the review listing.
  const dossiers = useAsync(() => (open ? partiesAdmin.cessionDossiers() : Promise.resolve(null)), item.id + ':' + open);
  const ref = reference.trim();
  const id = 'cessao-' + item.id;
  const what = `${item.vehicle_identifier} a ${item.driver_label ?? 'motorista sem nome no perfil'}`;
  return (
    <li className={row}>
      <h3 className="font-semibold text-gray-900">
        {item.fleet_name} · {what}
      </h3>
      <p className="text-sm">
        Cessão de {formatDateTime(item.from)} a {formatDateTime(item.until)} (São Paulo). Até a decisão, o motorista não
        recebe ofertas com o veículo.
      </p>
      <button type="button" className={secondaryButton} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Fechar o que a frota declarou' : `Ver o que a frota declarou sobre ${item.vehicle_identifier}`}
      </button>
      {open && dossiers.loading && !dossiers.data && <p role="status">Consultando…</p>}
      {open && <ErrorAlert error={dossiers.error} />}
      {open && dossiers.data && <Dossier dossier={dossiers.data.find((dossier) => dossier.id === item.id)} />}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ref) return;
          void action.run('approve:' + item.id, async () => {
            await partiesAdmin.reviewAssignment(item.id, true, ref);
            return `Cessão de ${what} aprovada. Com os documentos em dia, o motorista pode receber ofertas com o veículo.`;
          });
        }}
      >
        <Field id={id + '-ref'} label={'Referência da revisão da cessão de ' + what} hint="Identificador do dossiê conferido.">
          <input id={id + '-ref'} type="text" className={inputClass} maxLength={160} value={reference} onChange={(event) => setReference(event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={action.busy || !ref}>
            Aprovar cessão de {what}
          </button>
          <Confirm
            label={'Recusar cessão de ' + what}
            confirmLabel="Confirmar recusa"
            disabled={!ref}
            busy={action.busy}
            onConfirm={() =>
              attempt(action, 'reject:' + item.id, async () => {
                await partiesAdmin.reviewAssignment(item.id, false, ref);
                return `Cessão de ${what} recusada.`;
              })
            }
          >
            Recusar a cessão de {what}? O motorista continua sem ofertas com este veículo e a frota precisará enviar
            outra cessão.
          </Confirm>
        </div>
      </form>
    </li>
  );
}

function InvoiceRow({ item, action }: { item: QueueInvoice; action: Action }) {
  const [first, ...later] = item.months;
  return (
    <li className={row}>
      <h3 className="font-semibold text-gray-900">{item.account_name}</h3>
      <p className="text-sm">
        Competência a fechar: {monthName(first)}.
        {later.length > 0 && ` Depois dela: ${later.map(monthName).join(', ')}. As competências fecham em ordem.`}
      </p>
      <Confirm
        label={`Fechar ${monthName(first)} de ${item.account_name}`}
        confirmLabel="Confirmar fechamento"
        tone="primary"
        disabled={false}
        busy={action.busy}
        onConfirm={() =>
          // A retry of the same company and month reuses the key; the database also answers the same invoice.
          attempt(action, 'close:' + item.account_id + ':' + first, async (key) => {
            await partiesAdmin.closeInvoice(item.account_id, first, key);
            return `Competência ${monthName(first)} fechada para ${item.account_name}. A empresa já lê a fatura em Empresa.`;
          })
        }
      >
        Fechar {monthName(first)} para {item.account_name}? As linhas da fatura ficam imutáveis. Correções posteriores
        entram como ajuste no fechamento seguinte.
      </Confirm>
    </li>
  );
}

function DisputeRow({ item, action }: { item: QueueDispute; action: Action }) {
  const [reason, setReason] = useState('');
  const why = reason.trim();
  const id = 'contestacao-' + item.id;
  const what = `${item.account_name}, ${monthName(item.month)}`;
  return (
    <li className={row}>
      <h3 className="font-semibold text-gray-900">
        {what} · {LINES[item.kind] ?? item.kind} de {formatCents(item.cents)}
      </h3>
      <p className="text-sm">Contestada em {formatDateTime(item.raised_at)}. Motivo informado pela empresa:</p>
      <blockquote className="rounded-xl bg-gray-50 p-3 text-sm">{item.reason}</blockquote>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!why) return;
          void action.run('accept:' + item.id, async () => {
            await partiesAdmin.decideDispute(item.id, true, why);
            return `Contestação de ${what} aceita. O crédito entra como ajuste no próximo fechamento da conta.`;
          });
        }}
      >
        <Field
          id={id + '-motivo'}
          label={'Fundamentação da decisão sobre ' + what}
          hint="A empresa lê este texto. Não inclua dados pessoais nem locais de viagem."
        >
          <textarea id={id + '-motivo'} className={inputClass} rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={action.busy || !why}>
            Aceitar contestação de {what}
          </button>
          <Confirm
            label={'Rejeitar contestação de ' + what}
            confirmLabel="Confirmar rejeição"
            disabled={!why}
            busy={action.busy}
            onConfirm={() =>
              attempt(action, 'reject:' + item.id, async () => {
                await partiesAdmin.decideDispute(item.id, false, why);
                return `Contestação de ${what} rejeitada. A linha da fatura fica como está.`;
              })
            }
          >
            Rejeitar a contestação de {what}? A linha da fatura permanece como foi fechada e a empresa lê a
            fundamentação acima.
          </Confirm>
        </div>
      </form>
    </li>
  );
}

function Waiting({ dashboard }: { dashboard: RideDashboard }) {
  const { data, loading, error, reload } = useAsync(partiesAdmin.queue, 'fila');
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);
  return (
    <>
      {loading && !data && <PageStatus />}
      <ErrorAlert error={error} />
      {data && (
        <>
          <Queue
            id="contas-conferir"
            title="Contas para conferir"
            intro="Empresas e frotas nunca conferidas ou com a conferência encerrada ou a encerrar em 30 dias. Registre a referência do contrato e do dossiê conferidos."
            empty="Nenhuma conta aguardando conferência."
            items={data.accounts}
            reload={reload}
          >
            {(item, action) => <AccountRow key={item.id} item={item} action={action} />}
          </Queue>
          <Queue
            id="contas-dependentes"
            title="Dependentes para revisar"
            intro="Confira o vínculo do responsável e a faixa etária no dossiê. A fila mostra só o apelido e a faixa etária, e cada leitura e cada revisão ficam no registro de acesso aos dados do dependente."
            empty="Nenhum dependente aguardando revisão."
            items={data.dependents}
            reload={reload}
          >
            {(item, action) => <DependentRow key={item.id} item={item} action={action} />}
          </Queue>
          <Queue
            id="contas-cessoes"
            title="Cessões de frota para revisar"
            intro="Confira o contrato de cessão, o seguro, a revisão do veículo e o beneficiário contratado."
            empty="Nenhuma cessão aguardando revisão."
            items={data.cessions}
            reload={reload}
          >
            {(item, action) => <CessionRow key={item.id} item={item} action={action} />}
          </Queue>
          <Queue
            id="contas-vouchers"
            title="Vouchers retidos"
            intro="Trechos concluídos cujo voucher da empresa não pôde ser aplicado: liberação do benefício fechada, cobrança desligada ou janela vencida. O pedido fica parado e nada é cobrado de quem viaja até a decisão."
            empty="Nenhum voucher retido aguardando a operação."
            items={data.vouchers ?? []}
            reload={reload}
          >
            {(item, action) => <VoucherRow key={item.leg_id} item={item} action={action} />}
          </Queue>
          <Queue
            id="contas-faturas"
            title="Faturas para fechar"
            intro="Competências já encerradas com voucher usado, estorno ou ajuste ainda sem fatura. O mês corrente só fecha depois que termina; um estorno liquidado depois entra na competência seguinte."
            empty="Nenhuma competência encerrada aguardando fechamento."
            items={data.invoices}
            reload={reload}
          >
            {(item, action) => <InvoiceRow key={item.account_id} item={item} action={action} />}
          </Queue>
          <Queue
            id="contas-contestacoes"
            title="Contestações de fatura"
            intro="A empresa contesta uma linha de voucher de uma fatura fechada. A fatura fechada não muda: uma contestação aceita vira crédito de ajuste."
            empty="Nenhuma contestação aguardando decisão."
            items={data.disputes}
            reload={reload}
          >
            {(item, action) => <DisputeRow key={item.id} item={item} action={action} />}
          </Queue>
        </>
      )}
      <button type="button" className={secondaryButton} onClick={reload} disabled={loading}>
        Atualizar fila
      </button>
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Programs areas={dashboard.areas} />
        <Manual drivers={dashboard.reviews} />
      </Suspense>
    </>
  );
}

function Console({ userId }: { userId: string }) {
  const { data, loading, error, reload } = useAsync(getRideDashboard, userId);
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Contas de corridas</h1>
        <p className="text-sm text-gray-700">
          O que aguarda a operação em famílias, empresas e frotas. Cada decisão é tomada na própria linha, com a
          referência do que foi conferido.
        </p>
      </header>
      {loading && !data && <PageStatus />}
      <ErrorAlert error={error} />
      {error && !data && (
        <button type="button" className={secondaryButton} onClick={reload}>
          Tentar novamente
        </button>
      )}
      {data?.simulation && data.enabled && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Ensaio com dados fictícios. As decisões registradas aqui não acionam cobranças, repasses ou veículos reais.
        </p>
      )}
      {data &&
        (data.enabled ? (
          <Waiting dashboard={data} />
        ) : (
          <p role="status" className="text-sm text-gray-700">
            O módulo de corridas está desativado neste ambiente.
          </p>
        ))}
    </div>
  );
}

export default function RideParties() {
  const auth = useAuth();
  // AdminLayout already keeps the demo mode out; this covers the page rendered on its own.
  if (!backendEnabled || auth.mode !== 'backend')
    return (
      <p role="status" className="text-sm text-gray-700">
        As contas de corridas precisam do servidor configurado e de uma conta de administrador.
      </p>
    );
  return <Console key={auth.authUser?.id ?? ''} userId={auth.authUser?.id ?? ''} />;
}
