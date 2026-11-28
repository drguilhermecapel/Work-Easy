import { lazy, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import { ModalityCatalog } from '../../components/mobility/modes/ModalityCatalog';
import { RideDisplayMode } from '../../components/mobility/safety/common';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { APP_TIME_ZONE, saoPauloDateTime } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { rideMarket, type MarketCatalog } from '../../services/rideMarket';
import { getRideDashboard } from '../../services/rides';
import { mobilityLabel } from './driverLabels';
import Ensaio from './Ensaio';

const ShuttleSeats = lazy(() => import('../../components/mobility/modes/ShuttleSeats'));
const HourlyBlock = lazy(() => import('../../components/mobility/modes/HourlyBlock'));
const Intercity = lazy(() => import('../../components/mobility/modes/Intercity'));

const card = 'space-y-3 rounded-2xl border border-gray-200 bg-white p-5';
const field = 'block w-full mt-1 rounded-xl border border-gray-300 bg-white p-2.5 text-gray-900';
const primary = 'rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
const secondary = 'rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 disabled:opacity-50';
const methods: Record<string, string> = {
  pix: 'Pix',
  card: 'Cartão',
  cash: 'Dinheiro ao motorista',
  benefit: 'Benefício',
  tips: 'Gorjeta',
  withdrawal: 'Saque do motorista',
};
const formatTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: APP_TIME_ZONE });

/** Name of a country or currency code in Portuguese; the code itself when the device has no name for it. */
function named(type: 'region' | 'currency', code: string) {
  try {
    return new Intl.DisplayNames('pt-BR', { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

interface Query {
  origin: string;
  destination: string;
  at: string | null;
}

function Market({ catalog }: { catalog: MarketCatalog }) {
  const gates: [string, boolean][] = [
    ['Módulo de corridas', catalog.gates.module],
    ['Cotação', catalog.gates.quote],
    ['Chamada de motoristas', catalog.gates.dispatch],
    ['Cobrança', catalog.gates.monetization],
  ];
  const paid = [...new Set(catalog.methods.map((m) => methods[m.method] ?? m.method))];
  // The same class can be valid in several areas: one line per class, with its largest capacity.
  const classes = [...new Map(catalog.classes.map((c) => [c.code, c])).values()].map((c) => ({
    ...c,
    seats: Math.max(...catalog.classes.filter((other) => other.code === c.code).map((other) => other.seats)),
  }));
  return (
    <section aria-labelledby="praca" className={card}>
      <h2 id="praca" className="text-lg font-semibold">
        Praça: {catalog.market.city}, {named('region', catalog.market.country)}
      </h2>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-gray-600">Moeda</dt>
          <dd>
            {named('currency', catalog.currency)} ({catalog.currency})
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-600">Fuso dos horários</dt>
          <dd>
            {catalog.timezone === APP_TIME_ZONE ? 'Horário de São Paulo' : 'Horário local'} ({catalog.timezone})
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-600">Idioma</dt>
          <dd>{catalog.language === 'pt-BR' ? 'Português do Brasil' : catalog.language}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-600">Sua conta nesta praça</dt>
          <dd>{catalog.roles?.includes('driver') ? 'Passageiro e motorista aprovado' : 'Passageiro'}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-600">Meios de pagamento vigentes</dt>
          <dd>{paid.length ? paid.join(', ') : 'Nenhum para esta consulta'}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-600">Classes de veículo vigentes</dt>
          <dd>
            {classes.length
              ? classes.map((c) => `${c.label} (até ${c.seats} ${c.seats === 1 ? 'lugar' : 'lugares'})`).join(', ')
              : 'Nenhuma para esta consulta'}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-600">Veículos com capacidade conferida</dt>
          <dd>
            {catalog.vehicles.length
              ? catalog.vehicles
                  .map((v) => `${mobilityLabel(v.category)} (até ${v.seats} ${v.seats === 1 ? 'lugar' : 'lugares'})`)
                  .join(', ')
              : 'Nenhum no momento'}
          </dd>
        </div>
      </dl>
      <div>
        <h3 className="text-sm text-gray-600">Liberações deste ambiente, uma a uma</h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {gates.map(([label, on]) => (
            <li key={label}>
              {label}: <strong>{on ? 'liberado' : 'desligado'}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Corridor({
  areas,
  applied,
  busy,
  onApply,
}: {
  areas: string[];
  applied: Query | null;
  busy: boolean;
  onApply: (q: Query | null) => void;
}) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [time, setTime] = useState('');
  const [validation, setValidation] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const [day, clock] = time.split('T');
    const at = time ? (saoPauloDateTime(day, clock ?? '')?.toISOString() ?? null) : null;
    if (origin === destination) return setValidation('Escolha origem e destino diferentes.');
    if (time && (!at || Date.parse(at) <= Date.now() || Date.parse(at) > Date.now() + 30 * 24 * 60 * 60 * 1000))
      return setValidation('Escolha um horário nos próximos 30 dias, no horário de São Paulo.');
    setValidation('');
    onApply({ origin, destination, at });
  }
  const options = areas.map((area) => (
    <option key={area} value={area}>
      {area}
    </option>
  ));
  return (
    <form onSubmit={submit} className={card}>
      <h2 className="text-lg font-semibold">Consultar um trajeto</h2>
      <p className="text-sm">
        A disponibilidade depende da origem, do destino e do horário. Sem trajeto, a lista mostra a situação geral da
        praça.
      </p>
      {areas.length === 0 ? (
        <p>Nenhuma área de embarque está liberada neste ambiente. A lista abaixo mostra a situação geral.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Origem
              <select className={field} required value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">Selecione</option>
                {options}
              </select>
            </label>
            <label>
              Destino
              <select className={field} required value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="">Selecione</option>
                {options}
              </select>
            </label>
          </div>
          <label className="block">
            Data e hora do embarque (São Paulo), opcional
            <input className={field} type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          {validation && (
            <p role="alert" className="text-red-700">
              {validation}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={primary} disabled={busy}>
              {busy ? 'Consultando…' : 'Consultar modalidades'}
            </button>
            {applied && (
              <button type="button" className="underline" disabled={busy} onClick={() => onApply(null)}>
                Voltar à situação geral
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}

function Catalog() {
  const [query, setQuery] = useState<Query | null>(null);
  const places = useAsync(getRideDashboard, 'areas');
  // One key for every query: the list on screen stays while another trip is being consulted.
  const result = useAsync(
    async () => ({
      catalog: await rideMarket.catalog(query?.origin ?? null, query?.destination ?? null, query?.at ?? null),
      query,
    }),
    'catalog',
  );
  const reload = result.reload;
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
  const catalog = result.data?.catalog;
  // The trip the list on screen was answered for: the one the server door receives.
  const answered = result.data?.query ?? null;
  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-8 text-gray-800">
      <Link to="/corridas" className="text-primary underline">
        Voltar a Corridas
      </Link>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MapIcon aria-hidden="true" />
          Modalidades de corrida
        </h1>
        <p>
          O que a WorkEasy opera nesta praça e o que existe apenas como registro de mercado, com a fonte e a data da
          consulta.
        </p>
        {catalog?.environment === 'simulation' && (
          <p role="status" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">
            Ambiente de ensaio. Disponibilidade, preços e reservas usam dados fictícios.
          </p>
        )}
      </header>
      {!catalog && result.loading && <PageStatus />}
      {!catalog && !result.loading && (
        <button type="button" onClick={reload} className={secondary}>
          Tentar novamente
        </button>
      )}
      {catalog && <Market catalog={catalog} />}
      {catalog && places.data && (
        <Corridor
          areas={places.data.areas}
          applied={query}
          busy={result.loading && answered !== query}
          onApply={(next) => {
            setQuery(next);
            reload();
          }}
        />
      )}
      <ErrorAlert error={result.error ?? places.error} />
      {catalog && (
        <>
          <p className="text-sm">
            {answered
              ? `Consulta para ${answered.origin} → ${answered.destination}${answered.at ? ', embarque em ' + formatTime.format(new Date(answered.at)) + ' (São Paulo)' : ', saída agora'}.`
              : 'Situação geral da praça, sem trajeto escolhido.'}
          </p>
          <ModalityCatalog
            modalities={catalog.modalities}
            trip={answered}
            panels={{ shuttle_seat: <ShuttleSeats />, hourly: <HourlyBlock />, intercity: <Intercity /> }}
          />
          <button type="button" onClick={reload} disabled={result.loading} className={secondary}>
            Atualizar catálogo
          </button>
        </>
      )}
    </section>
  );
}

export default function Modalidades() {
  const auth = useAuth();
  if (!backendEnabled || auth.mode !== 'backend')
    return (
      <>
        <p className="mx-auto max-w-2xl px-4 pt-8">
          O catálogo de modalidades depende do servidor. Abaixo está o ensaio local de corrida, com dados fictícios.
        </p>
        <Ensaio />
      </>
    );
  return (
    <RequireSession>
      <RideDisplayMode />
      <Catalog key={auth.authUser?.id} />
    </RequireSession>
  );
}
