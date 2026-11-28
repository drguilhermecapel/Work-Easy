import { useState, type FormEvent } from 'react';
import { secondaryButton } from '../../components/admin/styles';
import { EmptyState } from '../../components/admin/ui';
import { hours, useModeAction } from '../../components/mobility/modes/modeState';
import { useAsync } from '../../lib/useAsync';
import { rideRegistry, type PolicyInput, type RegistryPolicy } from '../../services/rideModes';
import { Enabled, FormButtons, Num, Panel, Pick, Problem, Text, Until } from './rideRegistryUi';
import { row, untilDay, untilInstant, untilText } from './rideRegistryFormat';

// Reserve policies (PAR-604), one per pickup area: how early a reserve is taken, until when a driver
// confirms it and how far a new pickup time may move. Legs keep the terms frozen when booked.

function PolicyForm({ policy, areas, reload, close }: { policy?: RegistryPolicy; areas: string[]; reload: () => void; close: () => void }) {
  const action = useModeAction(reload);
  const [area, setArea] = useState(policy?.area ?? '');
  const [lead, setLead] = useState(String(policy?.min_lead_minutes ?? ''));
  const [confirm, setConfirm] = useState(String(policy?.confirm_lead_minutes ?? ''));
  const [shift, setShift] = useState(String(policy?.max_shift_minutes ?? ''));
  const [evidence, setEvidence] = useState(policy?.evidence_ref ?? '');
  const [until, setUntil] = useState(untilDay(policy?.valid_until ?? null));
  const [enabled, setEnabled] = useState(policy?.enabled ?? false);
  const [problem, setProblem] = useState('');
  const id = 'reserva-' + (policy?.area ?? 'nova').replace(/\W+/g, '-');
  function submit(event: FormEvent) {
    event.preventDefault();
    const validUntil = untilInstant(until);
    if (!area) return setProblem('Escolha a área.');
    if (Number(confirm) > Number(lead)) return setProblem('O prazo de confirmação não pode passar da antecedência mínima.');
    if (!validUntil) return setProblem('Informe até quando o cadastro vale.');
    setProblem('');
    const input: PolicyInput = {
      area,
      min_lead_minutes: Number(lead),
      confirm_lead_minutes: Number(confirm),
      max_shift_minutes: Number(shift),
      evidence_ref: evidence.trim(),
      valid_until: validUntil,
      enabled,
    };
    void action.run('policy:' + JSON.stringify(input), async () => {
      await rideRegistry.savePolicy(input);
      return `Política de reserva de ${area} salva${enabled ? ' e ligada' : ', desligada'}.`;
    });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick id={id + '-area'} label="Área de embarque" value={area} onChange={setArea} options={areas} disabled={!!policy} />
        <Num id={id + '-antecedencia'} label="Antecedência mínima da reserva (minutos)" value={lead} onChange={setLead} min={0} max={43200} />
        <Num id={id + '-confirmacao'} label="Motorista confirma até (minutos antes)" value={confirm} onChange={setConfirm} min={1} max={1440} />
        <Num id={id + '-mudanca'} label="Maior mudança de horário aceita (minutos)" value={shift} onChange={setShift} min={0} max={1440} />
        <Text id={id + '-evidencia'} label="Referência da evidência conferida" value={evidence} onChange={setEvidence} />
        <Until id={id + '-validade'} value={until} onChange={setUntil} />
      </div>
      <Enabled id={id + '-ligada'} value={enabled} onChange={setEnabled} label="Política ligada para novas reservas" />
      <Problem text={problem} />
      <FormButtons busy={action.busy} save="Salvar política" cancel={close} />
      {action.message}
    </form>
  );
}

function Policy({ policy, areas, reload }: { policy: RegistryPolicy; areas: string[]; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className={row}>
      <h4 className="font-semibold">{policy.area}</h4>
      <p className="text-sm">
        {policy.enabled ? 'Ligada' : 'Desligada'} · reserva com {hours(policy.min_lead_minutes)} de antecedência · motorista confirma até{' '}
        {hours(policy.confirm_lead_minutes)} antes · horário muda até {hours(policy.max_shift_minutes)}
      </p>
      <p className="text-sm text-gray-700">
        Evidência {policy.evidence_ref} · {untilText(policy.valid_until)}
      </p>
      <button type="button" className={secondaryButton} aria-pressed={editing} onClick={() => setEditing(!editing)}>
        Alterar política de {policy.area}
      </button>
      {editing && <PolicyForm policy={policy} areas={areas} reload={reload} close={() => setEditing(false)} />}
    </li>
  );
}

export default function RideModePolicies() {
  const { data, loading, error, reload } = useAsync(rideRegistry.policies, 'registro-reservas');
  const areas = data?.areas ?? [];
  return (
    <Panel
      id="cadastro-reservas"
      title="Políticas de reserva"
      intro="Uma política por área de embarque. Sem política ligada e na validade, a reserva da área segue como corrida agendada comum."
      loading={loading && !data}
      error={error}
      simulation={data?.simulation}
      addLabel="Cadastrar política"
      form={(close) => <PolicyForm areas={areas} reload={reload} close={close} />}
    >
      {data && data.policies.length === 0 && <EmptyState>Nenhuma política de reserva cadastrada neste ambiente.</EmptyState>}
      {data && data.policies.length > 0 && (
        <ul className="space-y-3">
          {data.policies.map((policy) => (
            <Policy key={policy.area} policy={policy} areas={areas} reload={reload} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
