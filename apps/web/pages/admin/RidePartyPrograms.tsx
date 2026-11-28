import { useState, type FormEvent } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { formatDateTime } from '../../components/admin/format';
import { inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Card, EmptyState, Field } from '../../components/admin/ui';
import { useAction } from '../../components/mobility/safety/state';
import { formatCents } from '../../lib/money';
import { formatDateBR, saoPauloDateTime, todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { centsToInput, parseReaisToCents } from '../../services/proFormat';
import { partiesAdmin, type AdminOrganization, type AdminProgram, type ProgramInput } from '../../services/ridePartiesAdmin';
import { VerifyAccount } from './ridePartyUi';

// Voucher programs of the companies (O17 PAR-506). Finance registers a program against a funding
// reference and changes it here; the company only reads it. A budget never drops below what is
// already committed, and enabling needs a checked company and an open voucher gate in every area.

const splitList = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
/** São Paulo wall time of an instant, as a datetime-local value. */
const toLocal = (instant: string) => formatDateTime(instant).replace(/^(\d{2})\/(\d{2})\/(\d{4}) /, '$3-$2-$1T');
const toInstant = (value: string) => {
  const [day, time] = value.split('T');
  return saoPauloDateTime(day ?? '', time ?? '')?.toISOString() ?? null;
};

function ProgramForm({
  organization,
  program,
  areas,
  onSaved,
}: {
  organization: AdminOrganization;
  /** Present when changing a program; absent for a new one. */
  program?: AdminProgram;
  areas: string[];
  onSaved: () => void;
}) {
  const action = useAction(onSaved);
  const [label, setLabel] = useState(program?.label ?? '');
  const [budget, setBudget] = useState(program ? centsToInput(program.budget_cents) : '');
  const [rideValue, setRideValue] = useState(program ? centsToInput(program.ride_value_cents) : '');
  const [memberLimit, setMemberLimit] = useState(
    typeof program?.member_limit_cents === 'number' ? centsToInput(program.member_limit_cents) : '',
  );
  const [chosenAreas, setChosenAreas] = useState<string[]>(program?.areas ?? []);
  const [classes, setClasses] = useState((program?.classes ?? []).join(', '));
  const [group, setGroup] = useState(program?.group_tag ?? '');
  const [from, setFrom] = useState(program ? toLocal(program.valid_from) : todayInSaoPaulo() + 'T00:00');
  const [until, setUntil] = useState(program ? toLocal(program.valid_until) : '');
  const [excessPayer, setExcessPayer] = useState<'rider' | 'none'>(program?.excess_payer ?? 'none');
  const [requiresApproval, setRequiresApproval] = useState(program?.requires_approval ?? false);
  const [fundingRef, setFundingRef] = useState(program?.funding_ref ?? '');
  const [evidenceRef, setEvidenceRef] = useState(program?.evidence_ref ?? '');
  const [enabled, setEnabled] = useState(program?.enabled ?? false);
  const [problem, setProblem] = useState('');
  const id = 'programa-' + (program?.id ?? 'novo');
  // Areas a program already names stay selectable even when the environment no longer lists them.
  const options = [...new Set([...areas, ...(program?.areas ?? [])])];

  function submit(event: FormEvent) {
    event.preventDefault();
    const budgetCents = parseReaisToCents(budget);
    const rideValueCents = parseReaisToCents(rideValue);
    const memberLimitCents = memberLimit.trim() ? parseReaisToCents(memberLimit) : null;
    const start = toInstant(from);
    const end = toInstant(until);
    if (!budgetCents || !rideValueCents || rideValueCents > budgetCents)
      return setProblem('Informe o orçamento e o valor por corrida; o valor por corrida não pode passar do orçamento.');
    if (memberLimit.trim() && (!memberLimitCents || memberLimitCents > budgetCents))
      return setProblem('O limite por pessoa precisa ser um valor acima de zero e não pode passar do orçamento.');
    if (program && budgetCents < program.committed_cents)
      return setProblem(`O orçamento não pode ficar abaixo do que já está comprometido: ${formatCents(program.committed_cents)}.`);
    if (!start || !end || start >= end) return setProblem('Informe o início e o fim da vigência, com o fim depois do início (São Paulo).');
    setProblem('');
    const input: Omit<ProgramInput, 'id'> = {
      account: organization.id,
      label: label.trim(),
      budgetCents,
      rideValueCents,
      memberLimitCents,
      areas: chosenAreas,
      classes: splitList(classes),
      group: group.trim() || null,
      from: start,
      until: end,
      excessPayer,
      requiresApproval,
      fundingRef: fundingRef.trim(),
      evidenceRef: evidenceRef.trim(),
      enabled,
    };
    // A new program takes the key of this attempt as its id, so a lost answer never creates a second one.
    void action.run('program:' + JSON.stringify(input), async (key) => {
      await partiesAdmin.saveProgram({ ...input, id: program?.id ?? key });
      return `Programa ${input.label} de ${organization.name} salvo${enabled ? ' e ativo' : ', pausado'}.`;
    });
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id + '-nome'} label="Nome do programa">
          <input id={id + '-nome'} type="text" className={inputClass} required maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <Field id={id + '-orcamento'} label="Orçamento total (R$)" hint={program ? `Já comprometido: ${formatCents(program.committed_cents)}.` : undefined}>
          <input id={id + '-orcamento'} type="text" inputMode="decimal" className={inputClass} required value={budget} onChange={(event) => setBudget(event.target.value)} />
        </Field>
        <Field id={id + '-valor'} label="Valor pago por corrida, até (R$)">
          <input id={id + '-valor'} type="text" inputMode="decimal" className={inputClass} required value={rideValue} onChange={(event) => setRideValue(event.target.value)} />
        </Field>
        <Field id={id + '-limite'} label="Limite por pessoa no programa (R$)" hint="Opcional. Vale para o programa inteiro, não por mês.">
          <input id={id + '-limite'} type="text" inputMode="decimal" className={inputClass} value={memberLimit} onChange={(event) => setMemberLimit(event.target.value)} />
        </Field>
        <Field id={id + '-inicio'} label="Vigência a partir de (São Paulo)">
          <input id={id + '-inicio'} type="datetime-local" className={inputClass} required value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field id={id + '-fim'} label="Vigência até (São Paulo)">
          <input id={id + '-fim'} type="datetime-local" className={inputClass} required value={until} onChange={(event) => setUntil(event.target.value)} />
        </Field>
        <Field id={id + '-classes'} label="Categorias aceitas" hint="Opcional. Códigos separados por vírgula; vazio aceita todas.">
          <input id={id + '-classes'} type="text" className={inputClass} value={classes} onChange={(event) => setClasses(event.target.value)} />
        </Field>
        <Field id={id + '-grupo'} label="Restrito ao grupo" hint="Opcional. Só pessoas com este grupo na empresa; um programa com grupo não serve a convidados.">
          <input id={id + '-grupo'} type="text" className={inputClass} maxLength={40} value={group} onChange={(event) => setGroup(event.target.value)} />
        </Field>
        <Field id={id + '-custeio'} label="Referência do custeio" hint="Contrato ou depósito que cobre o orçamento.">
          <input id={id + '-custeio'} type="text" className={inputClass} required maxLength={160} value={fundingRef} onChange={(event) => setFundingRef(event.target.value)} />
        </Field>
        <Field id={id + '-evidencia'} label="Referência da evidência conferida">
          <input id={id + '-evidencia'} type="text" className={inputClass} required maxLength={160} value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} />
        </Field>
        <Field id={id + '-excedente'} label="Tarifa acima do valor por corrida">
          <select id={id + '-excedente'} className={inputClass} value={excessPayer} onChange={(event) => setExcessPayer(event.target.value as 'rider' | 'none')}>
            <option value="none">A corrida não é cotada pelo programa</option>
            <option value="rider">Quem viaja paga a diferença, depois de aceitar a cotação</option>
          </select>
        </Field>
      </div>
      {options.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Áreas aceitas (nenhuma marcada aceita todas)</legend>
          {options.map((area) => (
            <label key={area} className="mr-4 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosenAreas.includes(area)}
                onChange={(event) => setChosenAreas(event.target.checked ? [...chosenAreas, area] : chosenAreas.filter((item) => item !== area))}
              />
              {area}
            </label>
          ))}
        </fieldset>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={requiresApproval} onChange={(event) => setRequiresApproval(event.target.checked)} />
        Exigir autorização de um aprovador da empresa antes de cada viagem
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Programa ativo (exige empresa conferida e voucher liberado em todas as áreas até o fim da vigência)
      </label>
      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
      <button type="submit" className={primaryButton} disabled={action.busy || !label.trim() || !fundingRef.trim() || !evidenceRef.trim()}>
        {program ? `Salvar alterações de ${program.label}` : `Registrar programa de ${organization.name}`}
      </button>
      {action.message}
    </form>
  );
}

function Organization({ organization, areas, reload }: { organization: AdminOrganization; areas: string[]; reload: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const verifying = useAction(reload);
  return (
    <Card className="space-y-4">
      <h3 className="font-semibold text-gray-900">{organization.name}</h3>
      <p className="text-sm">
        {organization.verified
          ? `Conferida pela operação até ${formatDateBR(organization.verified_until!)}.`
          : organization.verified_until
            ? `Conferência encerrada em ${formatDateBR(organization.verified_until)}: nenhum programa pode ficar ativo.`
            : 'Ainda não conferida: nenhum programa pode ficar ativo.'}
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Conferência de {organization.name}</summary>
        <div className="mt-3 space-y-3">
          <VerifyAccount account={organization.id} name={organization.name} withdrawable={organization.verified} action={verifying} />
          {verifying.message}
        </div>
      </details>
      {organization.programs.length === 0 && <p className="text-sm text-gray-600">Nenhum programa registrado.</p>}
      <ul className="space-y-4">
        {organization.programs.map((program) => (
          <li key={program.id} className="space-y-2 border-l-2 border-primary/30 pl-3">
            <h4 className="font-medium">
              {program.label} · {program.enabled ? 'ativo' : 'pausado'}
            </h4>
            <p className="text-sm">
              Orçamento {formatCents(program.budget_cents)} · comprometido {formatCents(program.committed_cents)} · até{' '}
              {formatCents(program.ride_value_cents)} por corrida · vigência de {formatDateBR(program.valid_from)} a{' '}
              {formatDateBR(program.valid_until)} · custeio {program.funding_ref}
            </p>
            <button
              type="button"
              className={secondaryButton}
              aria-expanded={editing === program.id}
              onClick={() => setEditing(editing === program.id ? null : program.id)}
            >
              {editing === program.id ? `Fechar ${program.label}` : `Alterar ${program.label}`}
            </button>
            {editing === program.id && <ProgramForm key={program.id} organization={organization} program={program} areas={areas} onSaved={reload} />}
          </li>
        ))}
      </ul>
      <button type="button" className={secondaryButton} aria-expanded={editing === 'novo'} onClick={() => setEditing(editing === 'novo' ? null : 'novo')}>
        {editing === 'novo' ? 'Fechar novo programa' : `Registrar programa para ${organization.name}`}
      </button>
      {editing === 'novo' && <ProgramForm organization={organization} areas={areas} onSaved={reload} />}
    </Card>
  );
}

/** Companies of the environment with their voucher programs, for finance to register and change. */
export default function RidePartyPrograms({ areas }: { areas: string[] }) {
  const { data, loading, error, reload } = useAsync(partiesAdmin.organizations, 'empresas');
  const [chosen, setChosen] = useState('');
  const organizations = data ?? [];
  const organization = organizations.find((item) => item.id === chosen) ?? organizations[0];
  return (
    <section aria-labelledby="contas-programas" className="space-y-3">
      <h2 id="contas-programas" className="text-lg font-semibold">
        Programas de voucher das empresas
      </h2>
      <p className="text-sm text-gray-600">
        O financeiro registra cada programa contra uma referência de custeio. A empresa só consulta; quem participa da
        empresa não pode registrar nem alterar os programas dela.
      </p>
      {loading && !data && <p role="status">Carregando empresas…</p>}
      <ErrorAlert error={error} />
      {data && organizations.length === 0 && <EmptyState>Nenhuma empresa ativa neste ambiente.</EmptyState>}
      {organization && (
        <>
          {organizations.length > 1 && (
            <Field id="programas-empresa" label="Empresa" className="max-w-md">
              <select id="programas-empresa" className={inputClass} value={organization.id} onChange={(event) => setChosen(event.target.value)}>
                {organizations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Organization key={organization.id} organization={organization} areas={areas} reload={reload} />
        </>
      )}
    </section>
  );
}
