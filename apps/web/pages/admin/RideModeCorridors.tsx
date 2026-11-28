import { useState, type FormEvent } from 'react';
import { secondaryButton } from '../../components/admin/styles';
import { EmptyState } from '../../components/admin/ui';
import { useModeAction } from '../../components/mobility/modes/modeState';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { rideRegistry, type CorridorInput, type RegistryCorridor } from '../../services/rideModes';
import { Enabled, FormButtons, Money, Num, Panel, Problem, Text, Until } from './rideRegistryUi';
import { centsToInput, parseReaisToCents, row, untilDay, untilInstant, untilText } from './rideRegistryFormat';

// Intercity corridors (PAR-606), one per direction. A registered pair, enabled or not, is never sold
// as a plain ride again; legs keep the terms they were sold with.

function CorridorForm({ corridor, areas, reload, close }: { corridor?: RegistryCorridor; areas: string[]; reload: () => void; close: () => void }) {
  const action = useModeAction(reload);
  const [origin, setOrigin] = useState(corridor?.origin ?? '');
  const [destination, setDestination] = useState(corridor?.destination ?? '');
  const [originCity, setOriginCity] = useState(corridor?.origin_jurisdiction ?? '');
  const [destinationCity, setDestinationCity] = useState(corridor?.destination_jurisdiction ?? '');
  const [authority, setAuthority] = useState(corridor?.authority_ref ?? '');
  const [coverage, setCoverage] = useState(corridor?.coverage_ref ?? '');
  const [ret, setRet] = useState(corridor ? centsToInput(corridor.empty_return_cents) : '');
  const [minutes, setMinutes] = useState(String(corridor?.return_minutes ?? ''));
  const [until, setUntil] = useState(untilDay(corridor?.valid_until ?? null));
  const [enabled, setEnabled] = useState(corridor?.enabled ?? false);
  const [problem, setProblem] = useState('');
  const id = 'corredor-' + (corridor ? corridor.origin + '-' + corridor.destination : 'novo').replace(/\W+/g, '-');
  const list = id + '-areas';
  function submit(event: FormEvent) {
    event.preventDefault();
    const cents = parseReaisToCents(ret);
    const validUntil = untilInstant(until);
    if (origin.trim() === destination.trim() || originCity.trim() === destinationCity.trim())
      return setProblem('Origem e destino precisam ser diferentes, em municípios diferentes.');
    if (cents === null) return setProblem('Informe o valor do retorno vazio (zero é aceito).');
    if (!validUntil) return setProblem('Informe até quando o cadastro vale.');
    setProblem('');
    const input: CorridorInput = {
      origin: origin.trim(),
      destination: destination.trim(),
      origin_jurisdiction: originCity.trim(),
      destination_jurisdiction: destinationCity.trim(),
      authority_ref: authority.trim(),
      coverage_ref: coverage.trim(),
      empty_return_cents: cents,
      return_minutes: Number(minutes),
      valid_until: validUntil,
      enabled,
    };
    void action.run('corridor:' + JSON.stringify(input), async () => {
      await rideRegistry.saveCorridor(input);
      return `Corredor ${input.origin} → ${input.destination} salvo${enabled ? ' e ligado' : ', desligado'}.`;
    });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <datalist id={list}>
        {areas.map((area) => (
          <option key={area} value={area} />
        ))}
      </datalist>
      <div className="grid gap-3 sm:grid-cols-2">
        {corridor ? (
          <p className="text-sm sm:col-span-2">
            Sentido {corridor.origin} → {corridor.destination}. Para o outro sentido, cadastre outro corredor.
          </p>
        ) : (
          <>
            <Text id={id + '-origem'} label="Origem" value={origin} onChange={setOrigin} max={120} list={list} hint="Uma das pontas precisa ser área do mercado." />
            <Text id={id + '-destino'} label="Destino" value={destination} onChange={setDestination} max={120} list={list} />
          </>
        )}
        <Text id={id + '-municipio-origem'} label="Município de origem" value={originCity} onChange={setOriginCity} max={120} />
        <Text id={id + '-municipio-destino'} label="Município de destino" value={destinationCity} onChange={setDestinationCity} max={120} />
        <Text id={id + '-autorizacao'} label="Referência da autorização do trajeto" value={authority} onChange={setAuthority} />
        <Text id={id + '-cobertura'} label="Referência da cobertura de seguro" value={coverage} onChange={setCoverage} />
        <Money id={id + '-retorno'} label="Retorno vazio do motorista (R$)" value={ret} onChange={setRet} />
        <Num id={id + '-retorno-minutos'} label="Tempo do retorno (minutos)" value={minutes} onChange={setMinutes} min={0} max={720} />
        <Until id={id + '-validade'} value={until} onChange={setUntil} />
      </div>
      <Enabled id={id + '-ligado'} value={enabled} onChange={setEnabled} label="Corredor ligado para cotação" />
      <Problem text={problem} />
      <FormButtons busy={action.busy} save="Salvar corredor" cancel={close} />
      {action.message}
    </form>
  );
}

function Corridor({ corridor, areas, reload }: { corridor: RegistryCorridor; areas: string[]; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const name = `${corridor.origin} → ${corridor.destination}`;
  return (
    <li className={row}>
      <h4 className="font-semibold">{name}</h4>
      <p className="text-sm">
        {corridor.enabled ? 'Ligado' : 'Desligado'} · {corridor.origin_jurisdiction} → {corridor.destination_jurisdiction} · retorno vazio{' '}
        {formatCents(corridor.empty_return_cents)} em {corridor.return_minutes} min
      </p>
      <p className="text-sm text-gray-700">
        Autorização {corridor.authority_ref} · cobertura {corridor.coverage_ref} · {untilText(corridor.valid_until)}
      </p>
      <button type="button" className={secondaryButton} aria-pressed={editing} onClick={() => setEditing(!editing)}>
        Alterar corredor {name}
      </button>
      {editing && <CorridorForm corridor={corridor} areas={areas} reload={reload} close={() => setEditing(false)} />}
    </li>
  );
}

export default function RideModeCorridors() {
  const { data, loading, error, reload } = useAsync(rideRegistry.corridors, 'registro-corredores');
  const areas = data?.areas ?? [];
  return (
    <Panel
      id="cadastro-corredores"
      title="Corredores entre municípios"
      intro="Um corredor por sentido, com a autorização do trajeto, a cobertura e o retorno vazio do motorista, que entra na tarifa. Um par cadastrado, mesmo desligado, deixa de ser vendido como corrida comum."
      loading={loading && !data}
      error={error}
      simulation={data?.simulation}
      addLabel="Cadastrar corredor"
      form={(close) => <CorridorForm areas={areas} reload={reload} close={close} />}
    >
      {data && data.corridors.length === 0 && <EmptyState>Nenhum corredor cadastrado neste ambiente.</EmptyState>}
      {data && data.corridors.length > 0 && (
        <ul className="space-y-3">
          {data.corridors.map((corridor) => (
            <Corridor key={corridor.origin + '>' + corridor.destination} corridor={corridor} areas={areas} reload={reload} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
