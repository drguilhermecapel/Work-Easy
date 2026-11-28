import { useState, type FormEvent, type ReactNode } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { shortId } from '../../components/admin/format';
import { dangerButton, inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Card, Field } from '../../components/admin/ui';
import { useAction } from '../../components/mobility/safety/state';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { formatDateBR, lastBookableDayInSaoPaulo, todayInSaoPaulo, validityEnd } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { partiesAdmin } from '../../services/rideFleets';
import { getRideDashboard } from '../../services/rides';

// Operator console of stage 5 (O17 PAR-502..508): account verification, dependent review, fleet
// assignment review, invoice closing and invoice disputes. There is no listing of what waits for a
// decision yet, so each action starts from the code the requester reports in the support ticket.
// The database refuses every call from anyone who is not an administrator of the operation.

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (month: string) => MONTH.format(new Date(month + '-01T00:00:00Z'));

function CodeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} error={value && !UUID.test(value) ? 'Cole o código completo, com 36 caracteres.' : null}>
      <input
        id={id}
        type="text"
        className={inputClass + ' font-mono'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
      />
    </Field>
  );
}

/** A decision that cannot be undone from this screen asks once more, saying what it changes. */
function Confirm({
  label,
  confirmLabel,
  tone = 'danger',
  disabled,
  busy,
  onConfirm,
  children,
}: {
  label: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** The fields the decision needs are not filled yet. */
  disabled: boolean;
  busy: boolean;
  /** Resolves when the attempt ends; the question closes only if it answers true. */
  onConfirm: () => Promise<boolean>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const style = tone === 'primary' ? primaryButton : dangerButton;
  if (!open || disabled)
    return (
      <button type="button" className={style} disabled={disabled || busy} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p>{children}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={style} disabled={busy} onClick={() => void onConfirm().then((done) => done && setOpen(false))}>
          {confirmLabel}
        </button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => setOpen(false)}>
          Voltar
        </button>
      </div>
    </div>
  );
}

/** Runs a confirmed decision and tells the question whether it may close. */
async function attempt(
  action: ReturnType<typeof useAction>,
  intent: string,
  work: (key: string) => Promise<string>,
): Promise<boolean> {
  let done = false;
  await action.run(intent, async (key) => {
    const notice = await work(key);
    done = true;
    return notice;
  });
  return done;
}

function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <Card className="space-y-3">
        <h3 id={id} className="font-semibold text-gray-900">
          {title}
        </h3>
        <p className="text-sm text-gray-600">{intro}</p>
        {children}
      </Card>
    </section>
  );
}

function VerifyAccount() {
  const action = useAction();
  const [account, setAccount] = useState('');
  const [reference, setReference] = useState('');
  const [until, setUntil] = useState('');
  const ref = reference.trim();
  const named = UUID.test(account) && ref.length > 0;
  const end = until ? validityEnd(until) : null;
  function verify(event: FormEvent) {
    event.preventDefault();
    if (!named || !end) return;
    void action.run('verify', async () => {
      await partiesAdmin.verifyAccount(account, ref, end.toISOString());
      setAccount('');
      return `Conferência da conta ${shortId(account)} registrada, válida até ${formatDateBR(until)}.`;
    });
  }
  const withdraw = () =>
    attempt(action, 'withdraw', async () => {
      await partiesAdmin.verifyAccount(account, ref, null);
      setAccount('');
      return `Conferência da conta ${shortId(account)} retirada. Ela fica sem operar até nova conferência.`;
    });
  return (
    <Section
      id="contas-conferir"
      title="Conferir conta de empresa ou frota"
      intro="Registre a referência do contrato e do dossiê conferidos. Quem participa da conta não pode conferi-la."
    >
      <form className="space-y-3" onSubmit={verify}>
        <CodeField id="conferir-conta" label="Código da conta" value={account} onChange={setAccount} />
        <Field id="conferir-referencia" label="Referência da conferência" hint="Identificador do dossiê, sem dados pessoais.">
          <input
            id="conferir-referencia"
            type="text"
            className={inputClass}
            maxLength={160}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>
        <Field id="conferir-validade" label="Conferência válida até" hint="No máximo 13 meses a partir de hoje.">
          <input
            id="conferir-validade"
            type="date"
            className={inputClass}
            min={todayInSaoPaulo()}
            max={lastBookableDayInSaoPaulo(new Date(), 390)}
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={action.busy || !named || !end}>
            Registrar conferência
          </button>
          <Confirm
            label="Retirar conferência"
            confirmLabel="Confirmar retirada"
            disabled={!named}
            busy={action.busy}
            onConfirm={withdraw}
          >
            Retirar a conferência da conta {shortId(account)}? A conta deixa de operar até uma nova conferência. Viagens
            e faturas já registradas não mudam.
          </Confirm>
        </div>
      </form>
      {action.message}
    </Section>
  );
}

function ReviewDependent() {
  const action = useAction();
  const [dependent, setDependent] = useState('');
  const [evidence, setEvidence] = useState('');
  const [until, setUntil] = useState('');
  const proof = evidence.trim();
  const named = UUID.test(dependent) && proof.length > 0;
  function approve(event: FormEvent) {
    event.preventDefault();
    if (!named || !until) return;
    void action.run('approve', async () => {
      await partiesAdmin.reviewDependent(dependent, true, proof, until);
      setDependent('');
      return `Vínculo do dependente ${shortId(dependent)} aprovado até ${formatDateBR(until)}.`;
    });
  }
  const reject = () =>
    attempt(action, 'reject', async () => {
      await partiesAdmin.reviewDependent(dependent, false, proof, null);
      setDependent('');
      return `Vínculo do dependente ${shortId(dependent)} recusado.`;
    });
  return (
    <Section
      id="contas-dependente"
      title="Revisar dependente"
      intro="Confira o vínculo do responsável e a faixa etária no dossiê. Cada revisão fica no registro de acesso aos dados do dependente."
    >
      <form className="space-y-3" onSubmit={approve}>
        <CodeField id="dependente-codigo" label="Código do dependente" value={dependent} onChange={setDependent} />
        <Field
          id="dependente-evidencia"
          label="Referência da evidência conferida"
          hint="Só a referência do dossiê. Não registre data de nascimento nem número de documento."
        >
          <input
            id="dependente-evidencia"
            type="text"
            className={inputClass}
            maxLength={160}
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
          />
        </Field>
        <Field id="dependente-validade" label="Vínculo válido até" hint="Só para aprovar. No máximo 12 meses.">
          <input
            id="dependente-validade"
            type="date"
            className={inputClass}
            min={todayInSaoPaulo()}
            max={lastBookableDayInSaoPaulo(new Date(), 365)}
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={action.busy || !named || !until}>
            Aprovar vínculo
          </button>
          <Confirm
            label="Recusar vínculo"
            confirmLabel="Confirmar recusa"
            disabled={!named}
            busy={action.busy}
            onConfirm={reject}
          >
            Recusar o vínculo do dependente {shortId(dependent)}? O responsável não poderá pedir corridas para este
            dependente e precisará fazer um novo cadastro para outra revisão.
          </Confirm>
        </div>
      </form>
      {action.message}
    </Section>
  );
}

function ReviewAssignment() {
  const action = useAction();
  const [assignment, setAssignment] = useState('');
  const [reference, setReference] = useState('');
  const ref = reference.trim();
  const named = UUID.test(assignment) && ref.length > 0;
  function approve(event: FormEvent) {
    event.preventDefault();
    if (!named) return;
    void action.run('approve', async () => {
      await partiesAdmin.reviewAssignment(assignment, true, ref);
      setAssignment('');
      return `Cessão ${shortId(assignment)} aprovada. Com os documentos em dia, o motorista pode receber ofertas com o veículo.`;
    });
  }
  const reject = () =>
    attempt(action, 'reject', async () => {
      await partiesAdmin.reviewAssignment(assignment, false, ref);
      setAssignment('');
      return `Cessão ${shortId(assignment)} recusada.`;
    });
  return (
    <Section
      id="contas-cessao"
      title="Revisar cessão de frota"
      intro="Confira o contrato de cessão, o seguro, a revisão do veículo e o beneficiário contratado. Até a decisão, o motorista não recebe ofertas com o veículo."
    >
      <form className="space-y-3" onSubmit={approve}>
        <CodeField id="cessao-codigo" label="Código da cessão" value={assignment} onChange={setAssignment} />
        <Field id="cessao-referencia" label="Referência da revisão" hint="Identificador do dossiê conferido.">
          <input
            id="cessao-referencia"
            type="text"
            className={inputClass}
            maxLength={160}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={action.busy || !named}>
            Aprovar cessão
          </button>
          <Confirm
            label="Recusar cessão"
            confirmLabel="Confirmar recusa"
            disabled={!named}
            busy={action.busy}
            onConfirm={reject}
          >
            Recusar a cessão {shortId(assignment)}? O motorista continua sem ofertas com este veículo e a frota
            precisará enviar outra cessão.
          </Confirm>
        </div>
      </form>
      {action.message}
    </Section>
  );
}

function CloseInvoice() {
  const action = useAction();
  const thisMonth = todayInSaoPaulo().slice(0, 7);
  const [account, setAccount] = useState('');
  const [month, setMonth] = useState('');
  const [invoice, setInvoice] = useState('');
  const ready = UUID.test(account) && /^\d{4}-\d{2}$/.test(month) && month <= thisMonth;
  // A retry of the same account and month reuses the key; the database also answers the same invoice.
  const close = () =>
    attempt(action, 'close:' + account + ':' + month, async (key) => {
      setInvoice('');
      const id = await partiesAdmin.closeInvoice(account, month + '-01', key);
      setInvoice(id);
      return `Competência ${monthName(month)} fechada para a conta ${shortId(account)}.`;
    });
  return (
    <Section
      id="contas-fatura"
      title="Fechar fatura mensal"
      intro="Consolida vouchers usados, estornos e ajustes da empresa na competência. Um estorno liquidado depois entra na competência seguinte."
    >
      <form className="space-y-3" onSubmit={(event) => event.preventDefault()}>
        <CodeField id="fatura-conta" label="Código da conta da empresa" value={account} onChange={setAccount} />
        <Field id="fatura-mes" label="Competência">
          <input
            id="fatura-mes"
            type="month"
            className={inputClass}
            max={thisMonth}
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </Field>
        <Confirm
          label="Fechar competência"
          confirmLabel="Confirmar fechamento"
          tone="primary"
          disabled={!ready}
          busy={action.busy}
          onConfirm={close}
        >
          Fechar {ready ? monthName(month) : 'a competência'} para a conta {shortId(account)}? As linhas da fatura
          ficam imutáveis. Correções posteriores entram como ajuste no fechamento seguinte.
        </Confirm>
      </form>
      {action.message}
      {invoice && (
        <p className="text-sm">
          Código da fatura: <span className="break-all font-mono">{invoice}</span>
        </p>
      )}
    </Section>
  );
}

function DecideDispute() {
  const action = useAction();
  const [dispute, setDispute] = useState('');
  const [reason, setReason] = useState('');
  const why = reason.trim();
  const named = UUID.test(dispute) && why.length > 0;
  function accept(event: FormEvent) {
    event.preventDefault();
    if (!named) return;
    void action.run('accept', async () => {
      await partiesAdmin.decideDispute(dispute, true, why);
      setDispute('');
      return `Contestação ${shortId(dispute)} aceita. O crédito entra como ajuste no próximo fechamento da conta.`;
    });
  }
  const reject = () =>
    attempt(action, 'reject', async () => {
      await partiesAdmin.decideDispute(dispute, false, why);
      setDispute('');
      return `Contestação ${shortId(dispute)} rejeitada. A linha da fatura fica como está.`;
    });
  return (
    <Section
      id="contas-contestacao"
      title="Decidir contestação de fatura"
      intro="A empresa contesta uma linha de uma fatura fechada. A fatura fechada não muda: uma contestação aceita vira crédito de ajuste."
    >
      <form className="space-y-3" onSubmit={accept}>
        <CodeField id="contestacao-codigo" label="Código da contestação" value={dispute} onChange={setDispute} />
        <Field
          id="contestacao-motivo"
          label="Fundamentação da decisão"
          hint="A empresa lê este texto. Não inclua dados pessoais nem locais de viagem."
        >
          <textarea
            id="contestacao-motivo"
            className={inputClass}
            rows={3}
            maxLength={280}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={action.busy || !named}>
            Aceitar contestação
          </button>
          <Confirm
            label="Rejeitar contestação"
            confirmLabel="Confirmar rejeição"
            disabled={!named}
            busy={action.busy}
            onConfirm={reject}
          >
            Rejeitar a contestação {shortId(dispute)}? A linha da fatura permanece como foi fechada e a empresa lê a
            fundamentação acima.
          </Confirm>
        </div>
      </form>
      {action.message}
    </Section>
  );
}

function Console({ userId }: { userId: string }) {
  const { data, loading, error, reload } = useAsync(getRideDashboard, userId);
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Contas de corridas</h1>
        <p className="text-sm text-gray-700">
          Conferências e fechamentos de famílias, empresas e frotas. Cada ação parte do código que a pessoa informa no
          chamado: cole o código completo e registre a referência do que foi conferido.
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
          <>
            <section aria-labelledby="contas-conferencias" className="space-y-3">
              <h2 id="contas-conferencias" className="text-lg font-semibold">
                Conferências
              </h2>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <VerifyAccount />
                <ReviewAssignment />
                <ReviewDependent />
              </div>
            </section>
            <section aria-labelledby="contas-faturas" className="space-y-3">
              <h2 id="contas-faturas" className="text-lg font-semibold">
                Faturas de empresas
              </h2>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <CloseInvoice />
                <DecideDispute />
              </div>
            </section>
          </>
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
