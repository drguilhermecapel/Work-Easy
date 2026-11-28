import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getClassOptions } from '../../services/rideLocalMap';
import { rideMarket, type ClassFeatureOption, type ClassMenu, type ClassNeeds } from '../../services/rideMarket';
import { formatCents } from '../../lib/money';

const standards = { standard: 'padrão básico', comfort: 'padrão conforto', premium: 'padrão premium' };
const small = 'ml-2 w-20 rounded-lg border border-gray-300 bg-white p-1.5';
const button = 'rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold disabled:opacity-50';
const noNeeds: ClassNeeds = { seats: 1, luggage: 0, pets: false, electric: false, priority: false };

/** Features of a class in plain words. Keys the server did not send are left out. */
function features(c: ClassFeatureOption) {
  return [
    c.seats + (c.seats === 1 ? ' lugar' : ' lugares'),
    c.luggage === undefined ? '' : c.luggage === 0 ? 'sem mala' : c.luggage + (c.luggage === 1 ? ' mala' : ' malas'),
    c.standard ? standards[c.standard] : '',
    c.electric ? 'veículo elétrico' : '',
    c.pets ? 'aceita animal doméstico' : '',
    c.priority_wait_minutes != null
      ? 'prioridade: só é ofertada com chegada estimada em até ' + c.priority_wait_minutes + ' min'
      : '',
    c.tools ? 'espaço para equipamentos e bagagem' : '',
    c.accessible ? 'recursos de acessibilidade disponíveis' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Without informed needs the list is the plain class list; with them, the server says what fits. */
async function readClasses(route: string, departure: string | null, needs: ClassNeeds | null): Promise<ClassMenu> {
  if (needs) return rideMarket.classMenu(route, departure, needs);
  return { options: await getClassOptions(route, departure), alternative: null };
}

export function RideClassChoices({
  routeId,
  departure,
  selected,
  onSelect,
}: {
  routeId: string;
  departure: string | null;
  selected: string;
  onSelect: (code: string) => void;
}) {
  const [draft, setDraft] = useState<ClassNeeds>(noNeeds);
  // Needs sent to the server; null until the passenger asks to check them.
  const [needs, setNeeds] = useState<ClassNeeds | null>(null);
  const [result, setResult] = useState<{
    route: string;
    departure: string | null;
    needs: ClassNeeds | null;
    options: ClassFeatureOption[] | null;
    alternative: string | null;
  }>();
  const choice = useRef({ selected, onSelect });
  useLayoutEffect(() => {
    choice.current = { selected, onSelect };
  });
  useEffect(() => {
    let active = true;
    if (routeId)
      void readClasses(routeId, departure, needs).then(
        (menu) => {
          if (!active) return;
          setResult({ route: routeId, departure, needs, options: menu.options, alternative: menu.alternative });
          // A class that stopped fitting is never kept: the passenger chooses again.
          const { selected: kept, onSelect: clear } = choice.current;
          if (kept && menu.options.some((c) => c.code === kept && c.fits === false)) clear('');
        },
        () => {
          if (active) setResult({ route: routeId, departure, needs, options: null, alternative: null });
        },
      );
    return () => {
      active = false;
    };
  }, [routeId, departure, needs]);
  if (!result || result.route !== routeId || result.departure !== departure) return null;
  const list = result.options;
  if (!list) return <p role="status">Não foi possível atualizar a capacidade disponível.</p>;
  if (!list.length) return null;
  const checking = result.needs !== needs;
  const misfits = result.needs && !checking ? list.filter((c) => c.fits === false) : [];
  const alternative = list.find((c) => c.code === result.alternative && c.fits !== false);
  const validDraft = draft.seats >= 1 && draft.seats <= 12 && draft.luggage >= 0 && draft.luggage <= 12;
  return (
    <fieldset className="space-y-2">
      <legend>Veículo e capacidade disponível</legend>
      <details className="rounded-lg border p-2">
        <summary>Informar passageiros, bagagem e preferências</summary>
        <div className="mt-2 space-y-2">
          <label className="block">
            Passageiros
            <input
              className={small}
              type="number"
              min="1"
              max="12"
              value={draft.seats}
              onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            Malas
            <input
              className={small}
              type="number"
              min="0"
              max="12"
              value={draft.luggage}
              onChange={(e) => setDraft({ ...draft, luggage: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <input type="checkbox" checked={draft.pets} onChange={(e) => setDraft({ ...draft, pets: e.target.checked })} />{' '}
            Levo animal doméstico
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={draft.electric}
              onChange={(e) => setDraft({ ...draft, electric: e.target.checked })}
            />{' '}
            Prefiro veículo elétrico
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.checked })}
            />{' '}
            Quero prioridade na chegada do motorista
          </label>
          <button
            type="button"
            className={button}
            disabled={checking || !validDraft}
            onClick={() => setNeeds({ ...draft })}
          >
            {checking ? 'Conferindo…' : 'Conferir classes compatíveis'}
          </button>
        </div>
      </details>
      <p className="text-sm">
        Cão-guia e animal de assistência viajam em qualquer classe, sem custo adicional e sem necessidade de declaração.
      </p>
      {list.map((c) => (
        <label key={c.code} className="block rounded-lg border p-2">
          <input
            type="radio"
            required
            name={'classe-' + routeId}
            value={c.code}
            checked={selected === c.code}
            disabled={!c.available || c.fits === false}
            onChange={() => onSelect(c.code)}
          />{' '}
          {c.label} · {features(c)}
          <span className="block">
            {formatCents(c.fare_cents)} antes dos adicionais
            {c.duration_minutes !== null && ' · ' + c.duration_minutes + ' min de percurso'}
            {c.approach_minutes !== null && ' · ' + c.approach_minutes + ' min estimados até o embarque'}
            {c.fits === false && ' · não comporta o que você informou'}
            {!c.available && ' · sem motorista elegível nesta janela'}
          </span>
        </label>
      ))}
      {misfits.length > 0 && (
        <div role="status" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          {alternative ? (
            <>
              <p>
                O que você informou não cabe em {misfits.map((c) => c.label).join(', ')}. Alternativa indicada:{' '}
                {alternative.label} · {features(alternative)}, por {formatCents(alternative.fare_cents)} antes dos
                adicionais.
              </p>
              {selected === alternative.code ? (
                <p>Você escolheu {alternative.label}. A cotação usará esta classe e este preço.</p>
              ) : alternative.available ? (
                <button type="button" className={button} onClick={() => onSelect(alternative.code)}>
                  Escolher {alternative.label} por {formatCents(alternative.fare_cents)}
                </button>
              ) : (
                <p>Esta alternativa está sem motorista elegível nesta janela. Tente outro horário.</p>
              )}
              <p className="text-sm">Nada é trocado sem a sua escolha. Você também pode ajustar o que informou.</p>
            </>
          ) : (
            <p>
              {list.every((c) => c.fits === false)
                ? 'Nenhuma classe comporta o que você informou nesta janela. Ajuste as quantidades ou escolha outro horário.'
                : 'Parte das classes não comporta o que você informou. Escolha entre as que continuam habilitadas.'}
            </p>
          )}
        </div>
      )}
      <p className="text-sm">
        Estimativa consultada às{' '}
        {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(
          new Date(list[0].observed_at),
        )}{' '}
        (São Paulo). O motorista confirma após o aceite do preço final.
      </p>
    </fieldset>
  );
}
