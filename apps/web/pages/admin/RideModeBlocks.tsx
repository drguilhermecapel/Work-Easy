import { useState, type FormEvent } from 'react';
import { secondaryButton } from '../../components/admin/styles';
import { EmptyState } from '../../components/admin/ui';
import { hours, useModeAction } from '../../components/mobility/modes/modeState';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { rideRegistry, type RegistryTariff, type TariffInput } from '../../services/rideModes';
import { FormButtons, Money, Num, Panel, Pick, Problem, Text, Until } from './rideRegistryUi';
import { centsToInput, parseReaisToCents, row, untilDay, untilInstant, untilText } from './rideRegistryFormat';

// Hourly blocks (PAR-606): the tariffs an area quotes. A block already sold keeps its area and code;
// a new price applies to the next quotes, the legs keep the terms they were sold with.

const CODE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

function TariffForm({ tariff, areas, reload, close }: { tariff?: RegistryTariff; areas: string[]; reload: () => void; close: () => void }) {
  const action = useModeAction(reload);
  const [area, setArea] = useState(tariff?.area ?? '');
  const [code, setCode] = useState(tariff?.code ?? '');
  const [minutes, setMinutes] = useState(String(tariff?.minutes ?? ''));
  const [km, setKm] = useState(String(tariff?.included_km ?? ''));
  const [price, setPrice] = useState(tariff ? centsToInput(tariff.block_cents) : '');
  const [extraTime, setExtraTime] = useState(tariff ? centsToInput(tariff.extra_15min_cents) : '');
  const [extraKm, setExtraKm] = useState(tariff ? centsToInput(tariff.extra_km_cents) : '');
  const [evidence, setEvidence] = useState(tariff?.evidence_ref ?? '');
  const [until, setUntil] = useState(untilDay(tariff?.valid_until ?? null));
  const [problem, setProblem] = useState('');
  const sold = (tariff?.legs ?? 0) > 0;
  const id = 'bloco-' + (tariff?.id ?? 'novo');
  function submit(event: FormEvent) {
    event.preventDefault();
    const block = parseReaisToCents(price);
    const perTime = parseReaisToCents(extraTime);
    const perKm = parseReaisToCents(extraKm);
    const validUntil = untilInstant(until);
    if (!area || !CODE.test(code)) return setProblem('Escolha a área e use um código curto em minúsculas, como 2h.');
    if (!block || perTime === null || perKm === null) return setProblem('Informe o preço do bloco e os valores de excedente (zero é aceito).');
    if (!validUntil) return setProblem('Informe até quando o cadastro vale.');
    setProblem('');
    const input: Omit<TariffInput, 'id'> = {
      area,
      code,
      minutes: Number(minutes),
      included_km: Number(km),
      block_cents: block,
      extra_15min_cents: perTime,
      extra_km_cents: perKm,
      evidence_ref: evidence.trim(),
      valid_until: validUntil,
    };
    void action.run('tariff:' + JSON.stringify(input), async (key) => {
      await rideRegistry.saveTariff({ ...input, id: tariff?.id ?? key });
      return `Bloco ${code} de ${area} salvo.`;
    });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick id={id + '-area'} label="Área de embarque" value={area} onChange={setArea} options={areas} disabled={sold} />
        <Text id={id + '-codigo'} label="Código do bloco" value={code} onChange={setCode} max={24} hint={sold ? 'Bloco já vendido: área e código não mudam.' : 'Minúsculas, números, hífen ou sublinhado.'} />
        <Num id={id + '-minutos'} label="Duração do bloco (minutos)" value={minutes} onChange={setMinutes} min={60} max={720} />
        <Num id={id + '-km'} label="Quilômetros incluídos" value={km} onChange={setKm} min={1} max={1000} />
        <Money id={id + '-preco'} label="Preço do bloco (R$)" value={price} onChange={setPrice} />
        <Money id={id + '-tempo'} label="Excedente por 15 minutos (R$)" value={extraTime} onChange={setExtraTime} />
        <Money id={id + '-quilometro'} label="Excedente por quilômetro (R$)" value={extraKm} onChange={setExtraKm} />
        <Text id={id + '-evidencia'} label="Referência da evidência conferida" value={evidence} onChange={setEvidence} />
        <Until id={id + '-validade'} value={until} onChange={setUntil} />
      </div>
      <Problem text={problem} />
      <FormButtons busy={action.busy} save="Salvar bloco" cancel={close} />
      {action.message}
    </form>
  );
}

function Tariff({ tariff, areas, reload }: { tariff: RegistryTariff; areas: string[]; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const name = `${tariff.code} de ${tariff.area}`;
  return (
    <li className={row}>
      <h4 className="font-semibold">Bloco {name}</h4>
      <p className="text-sm">
        {hours(tariff.minutes)} · {tariff.included_km} km incluídos · {formatCents(tariff.block_cents)} · excedente{' '}
        {formatCents(tariff.extra_15min_cents)} a cada 15 min e {formatCents(tariff.extra_km_cents)} por km
      </p>
      <p className="text-sm text-gray-700">
        Evidência {tariff.evidence_ref} · {untilText(tariff.valid_until)} · {tariff.legs} trechos vendidos
      </p>
      <button type="button" className={secondaryButton} aria-pressed={editing} onClick={() => setEditing(!editing)}>
        Alterar bloco {name}
      </button>
      {editing && <TariffForm tariff={tariff} areas={areas} reload={reload} close={() => setEditing(false)} />}
    </li>
  );
}

export default function RideModeBlocks() {
  const { data, loading, error, reload } = useAsync(rideRegistry.tariffs, 'registro-blocos');
  const areas = data?.areas ?? [];
  return (
    <Panel
      id="cadastro-blocos"
      title="Blocos por hora"
      intro="Um bloco é um carro com motorista por um tempo, com quilômetros incluídos. Excedente só é cobrado com extensão aceita por quem paga e pelo motorista."
      loading={loading && !data}
      error={error}
      simulation={data?.simulation}
      addLabel="Cadastrar bloco"
      form={(close) => <TariffForm areas={areas} reload={reload} close={close} />}
    >
      {data && data.tariffs.length === 0 && <EmptyState>Nenhum bloco cadastrado neste ambiente.</EmptyState>}
      {data && data.tariffs.length > 0 && (
        <ul className="space-y-3">
          {data.tariffs.map((tariff) => (
            <Tariff key={tariff.id} tariff={tariff} areas={areas} reload={reload} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
