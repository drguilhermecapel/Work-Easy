import { lazy, Suspense, useState, type FormEvent } from 'react';
import { secondaryButton } from '../../components/admin/styles';
import { EmptyState } from '../../components/admin/ui';
import { useModeAction, whenSP } from '../../components/mobility/modes/modeState';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { rideRegistry, type LineInput, type RegistryLine } from '../../services/rideModes';
import { Enabled, FormButtons, Money, Num, Panel, Pick, Problem, Text, Until } from './rideRegistryUi';
import { centsToInput, parseReaisToCents, row, untilDay, untilInstant, untilText } from './rideRegistryFormat';

// Line vans by seat (PAR-604): the lines the operation sells and, on demand, the departures of one line.

const Departures = lazy(() => import('./RideModeDepartures'));

function LineForm({ line, areas, reload, close }: { line?: RegistryLine; areas: string[]; reload: () => void; close: () => void }) {
  const action = useModeAction(reload);
  const [origin, setOrigin] = useState(line?.origin_area ?? '');
  const [destination, setDestination] = useState(line?.destination_area ?? '');
  const [operator, setOperator] = useState(line?.operator_ref ?? '');
  const [price, setPrice] = useState(line ? centsToInput(line.seat_cents) : '');
  const [minutes, setMinutes] = useState(String(line?.minutes ?? ''));
  const [evidence, setEvidence] = useState(line?.evidence_ref ?? '');
  const [until, setUntil] = useState(untilDay(line?.valid_until ?? null));
  const [enabled, setEnabled] = useState(line?.enabled ?? false);
  const [problem, setProblem] = useState('');
  const id = 'linha-' + (line?.id ?? 'nova');
  function submit(event: FormEvent) {
    event.preventDefault();
    const seatCents = parseReaisToCents(price);
    const validUntil = untilInstant(until);
    if (!origin || !destination || origin === destination) return setProblem('Escolha a origem e um destino diferente.');
    if (!seatCents) return setProblem('Informe o preço de um assento.');
    if (!validUntil) return setProblem('Informe até quando o cadastro vale.');
    setProblem('');
    const input: Omit<LineInput, 'id'> = {
      origin,
      destination,
      operatorRef: operator.trim(),
      seatCents,
      minutes: Number(minutes),
      evidenceRef: evidence.trim(),
      validUntil,
      enabled,
    };
    // A new line takes the key of this attempt as its id: a lost answer never creates a second line.
    void action.run('line:' + JSON.stringify(input), async (key) => {
      await rideRegistry.saveLine({ ...input, id: line?.id ?? key });
      return `Linha ${origin} → ${destination} salva${enabled ? ' e ligada' : ', desligada'}.`;
    });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick id={id + '-origem'} label="Origem" value={origin} onChange={setOrigin} options={areas} />
        <Pick id={id + '-destino'} label="Destino" value={destination} onChange={setDestination} options={areas} />
        <Text id={id + '-operador'} label="Referência do operador" value={operator} onChange={setOperator} />
        <Money id={id + '-preco'} label="Preço de um assento (R$)" value={price} onChange={setPrice} />
        <Num id={id + '-minutos'} label="Duração da viagem (minutos)" value={minutes} onChange={setMinutes} min={1} max={720} />
        <Text id={id + '-evidencia'} label="Referência da evidência conferida" value={evidence} onChange={setEvidence} />
        <Until id={id + '-validade'} value={until} onChange={setUntil} />
      </div>
      <Enabled id={id + '-ligada'} value={enabled} onChange={setEnabled} label="Linha ligada para venda de assentos" />
      <Problem text={problem} />
      <FormButtons busy={action.busy} save="Salvar linha" cancel={close} />
      {action.message}
    </form>
  );
}

function Line({ line, areas, reload }: { line: RegistryLine; areas: string[]; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [departures, setDepartures] = useState(false);
  const name = `${line.origin_area} → ${line.destination_area}`;
  return (
    <li className={row}>
      <h4 className="font-semibold">{name}</h4>
      <p className="text-sm">
        {line.enabled ? 'Ligada' : 'Desligada'} · {formatCents(line.seat_cents)} por assento · {line.minutes} min · operador {line.operator_ref}
      </p>
      <p className="text-sm text-gray-700">
        Evidência {line.evidence_ref} · {untilText(line.valid_until)} · {line.open_departures} partidas abertas
        {line.next_departure ? ', a próxima em ' + whenSP(line.next_departure) : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} aria-pressed={editing} onClick={() => setEditing(!editing)}>
          Alterar linha {name}
        </button>
        <button type="button" className={secondaryButton} aria-pressed={departures} onClick={() => setDepartures(!departures)}>
          Partidas de {name}
        </button>
      </div>
      {editing && (
        <LineForm line={line} areas={areas} reload={reload} close={() => setEditing(false)} />
      )}
      {departures && (
        <Suspense fallback={<p role="status">Carregando…</p>}>
          <Departures line={line} onChange={reload} />
        </Suspense>
      )}
    </li>
  );
}

export default function RideModeLines() {
  const { data, loading, error, reload } = useAsync(rideRegistry.lines, 'registro-linhas');
  const areas = data?.areas ?? [];
  return (
    <Panel
      id="cadastro-linhas"
      title="Linhas de van por assento"
      intro="Cada linha liga duas áreas do mercado com um operador, o preço de um assento e a duração da viagem. Uma linha com partidas não muda de áreas; o novo preço vale para as próximas reservas."
      loading={loading && !data}
      error={error}
      simulation={data?.simulation}
      addLabel="Cadastrar linha"
      form={(close) => (
<LineForm areas={areas} reload={reload} close={close} />
      )}
    >
      {data && data.lines.length === 0 && <EmptyState>Nenhuma linha cadastrada neste ambiente.</EmptyState>}
      {data && data.lines.length > 0 && (
        <ul className="space-y-3">
          {data.lines.map((line) => (
            <Line key={line.id} line={line} areas={areas} reload={reload} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
