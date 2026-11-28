import { Suspense, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ErrorAlert from '../../ErrorAlert';
import { isRideRefusal, rideMarket, type MarketModality } from '../../../services/rideMarket';

const primary = 'inline-block rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
const secondary =
  'rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 disabled:opacity-50';

// A modality has a call to action only when this product has a flow for it. The two lists are
// fixed here, so no catalog row can turn a market record into something to request.
/** Modalities quoted in the ride form, with what to choose there. */
const QUOTED: Record<string, string> = {
  car: 'A cotação mostra o preço final antes do aceite.',
  assist: 'Escolha a assistência na cotação. Ninguém pede diagnóstico.',
  wav: 'Escolha o veículo adaptado na cotação. Sem veículo compatível, nenhuma cotação é criada.',
  reserve: 'Escolha "Agendar" na cotação. Um motorista precisa confirmar a reserva antes do embarque.',
  airport: 'Agende a corrida e informe o terminal. Um atraso de voo permite pedir novo horário.',
  van: 'Escolha a classe de van na cotação. O veículo é só para o seu grupo.',
};
/** Modalities with their own panel on this page, and the action that opens it. */
const PANELS: Record<string, string> = {
  shuttle_seat: 'Ver partidas e assentos',
  hourly: 'Ver blocos de horas',
  intercity: 'Ver corredores entre municípios',
};
const NAMES: Record<string, string> = {
  car: 'Carro',
  assist: 'Assistência no embarque',
  wav: 'Veículo acessível',
  reserve: 'Reserva',
  airport: 'Aeroporto',
  van: 'Van individual',
  shuttle_seat: 'Assento em linha de van',
  hourly: 'Por hora',
  intercity: 'Entre municípios',
  taxi: 'Táxi',
  moto: 'Moto',
  shared: 'Viagem compartilhada',
  route_share: 'Corredor compartilhado',
  transit_info: 'Informação de transporte público',
  transit_ticket: 'Bilhete de transporte público',
  bike: 'Bicicleta',
  scooter: 'Patinete',
  boat: 'Barco',
  rental: 'Locação sem motorista',
  autonomous: 'Veículo autônomo de parceiro',
};
const REASONS: Record<string, string> = {
  not_authorized: 'Sem autorização vigente nesta praça.',
  no_operational_flow: 'Há um registro de autorização, mas a WorkEasy não opera esta modalidade: não existe pedido para ela.',
  authorization_expired: 'A autorização desta praça venceu ou vence antes do horário consultado.',
  outside_hours: 'Fora do horário autorizado para o embarque.',
  outside_market: 'Origem ou destino fora da praça atendida.',
  area_not_authorized: 'Origem ou destino sem liberação para cotação.',
  network_disabled: 'As cotações de corrida estão desligadas neste ambiente.',
  unknown_modality: 'Modalidade não reconhecida neste ambiente.',
};
const STATUS: Record<string, string> = {
  inventory: 'Registro de mercado, sem autorização para operar',
  pilot: 'Piloto em ensaio',
  authorized: 'Autorizada nesta praça',
};

const name = (m: MarketModality) => m.label || NAMES[m.code] || m.code;
const operational = (m: MarketModality) => m.operational !== false && (m.code in QUOTED || m.code in PANELS);
/** "2026-11-27" → "27/11/2026", without reading it in any time zone. */
const day = (value: string) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : value;
};
function reason(m: MarketModality) {
  if (!operational(m) && m.reason !== 'no_operational_flow')
    return 'Sem autorização nesta praça e sem operação pela WorkEasy. O registro é apenas informativo.';
  const text = (m.reason && REASONS[m.reason]) || 'Indisponível para esta consulta.';
  return m.reason === 'outside_hours' && m.open_from && m.open_until
    ? `${text} Janela desta praça: das ${m.open_from.slice(0, 5)} às ${m.open_until.slice(0, 5)}, no horário local.`
    : text;
}

function Source({ m }: { m: MarketModality }) {
  const safe = m.source && /^https:\/\//.test(m.source) ? m.source : null;
  if (!safe && !m.consulted_on) return null;
  return (
    <p className="text-sm text-gray-600">
      {safe && (
        <a className="text-primary underline" href={safe} target="_blank" rel="noopener noreferrer">
          Fonte consultada sobre {name(m)}
        </a>
      )}
      {safe && m.consulted_on && ' · '}
      {m.consulted_on && `Consulta em ${day(m.consulted_on)}`}
    </p>
  );
}

export interface CatalogTrip {
  origin: string;
  destination: string;
  at: string | null;
}

/** Asks the server door for one modality of this trip. The catalog alone opens nothing. */
function Door({ m, trip, onOpen }: { m: MarketModality; trip: CatalogTrip; onOpen: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  async function request() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await rideMarket.request(m.code, trip.origin, trip.destination, trip.at);
      onOpen();
    } catch (err) {
      setError(err);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className={primary} disabled={busy} onClick={() => void request()}>
        {busy ? 'Conferindo…' : PANELS[m.code]}
      </button>
      {isRideRefusal(error, 'ride_modality_unavailable') ? (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          Esta modalidade não está liberada para este trajeto e horário. Nada foi solicitado.
        </p>
      ) : (
        <ErrorAlert error={error} />
      )}
    </>
  );
}

function Card({ m, trip, panel }: { m: MarketModality; trip: CatalogTrip | null; panel: ReactNode }) {
  const [shown, setShown] = useState(false);
  const works = operational(m);
  const open = works && m.available;
  const info = m.note?.trim();
  return (
    <li className="space-y-3">
      <article className="space-y-2 rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">{name(m)}</h3>
        <p className="text-sm">
          {works ? (STATUS[m.status] ?? STATUS.inventory) : 'Registro de mercado, sem operação pela WorkEasy'}
          {' · '}
          <strong>{open ? 'Aberta neste ambiente' : works ? 'Indisponível agora' : 'Não disponível'}</strong>
        </p>
        {!open && <p>{reason(m)}</p>}
        {open && m.code in QUOTED && (
          <>
            <p className="text-sm">{QUOTED[m.code]}</p>
            <Link className={primary} to="/corridas">
              Cotar {name(m)} em Corridas
            </Link>
          </>
        )}
        {open &&
          m.code in PANELS &&
          panel &&
          (shown ? (
            <button type="button" className={secondary} onClick={() => setShown(false)}>
              Fechar {name(m)}
            </button>
          ) : trip ? (
            <Door m={m} trip={trip} onOpen={() => setShown(true)} />
          ) : (
            <p className="text-sm">Para abrir, informe origem e destino em "Consultar um trajeto".</p>
          ))}
        {info && (
          <details className="text-sm">
            <summary>Saber mais sobre {name(m)}</summary>
            <p className="mt-1">
              {info}
              {!works && ' Não há pedido, lista de espera ou reserva para esta modalidade no aplicativo.'}
            </p>
          </details>
        )}
        <Source m={m} />
      </article>
      {open && shown && <Suspense fallback={<p role="status">Abrindo {name(m)}…</p>}>{panel}</Suspense>}
    </li>
  );
}

/**
 * The catalog of one market: what is open, what is operated but closed for this consultation, and
 * what exists only as a market record. `trip` is the consulted trip, sent to the server door;
 * `panels` holds the flow of the modalities that open on this page.
 */
export function ModalityCatalog({
  modalities,
  trip = null,
  panels = {},
}: {
  modalities: MarketModality[];
  trip?: CatalogTrip | null;
  panels?: Partial<Record<string, ReactNode>>;
}) {
  const open = modalities.filter((m) => operational(m) && m.available);
  const closed = modalities.filter((m) => operational(m) && !m.available);
  const records = modalities.filter((m) => !operational(m));
  // A panel was opened by the door for one trip: another trip asks the door again.
  const tripKey = trip ? ['', trip.origin, trip.destination, trip.at].join('|') : '';
  const list = (items: MarketModality[]) => (
    <ul className="space-y-3">
      {items.map((m) => (
        <Card key={m.code + tripKey} m={m} trip={trip} panel={panels[m.code]} />
      ))}
    </ul>
  );
  return (
    <div className="space-y-6">
      <section aria-labelledby="modalidades-abertas" className="space-y-3">
        <h2 id="modalidades-abertas" className="text-lg font-semibold">
          Abertas agora
        </h2>
        {open.length ? (
          list(open)
        ) : (
          <p className="rounded-2xl border border-gray-200 bg-white p-5">
            Nenhuma modalidade está aberta para esta consulta. Veja o motivo de cada uma abaixo ou consulte outro
            trajeto e horário.
          </p>
        )}
      </section>
      {closed.length > 0 && (
        <section aria-labelledby="modalidades-fechadas" className="space-y-3">
          <h2 id="modalidades-fechadas" className="text-lg font-semibold">
            Indisponíveis para esta consulta
          </h2>
          {list(closed)}
        </section>
      )}
      {records.length > 0 && (
        <section aria-labelledby="modalidades-registro" className="space-y-3">
          <h2 id="modalidades-registro" className="text-lg font-semibold">
            Não disponíveis na WorkEasy
          </h2>
          <p className="text-sm">
            Estas modalidades existem no mercado e ficam aqui só como registro, com a fonte e a data da consulta. Elas
            não podem ser pedidas.
          </p>
          {list(records)}
        </section>
      )}
    </div>
  );
}
