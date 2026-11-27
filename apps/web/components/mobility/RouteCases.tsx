import { useEffect, useRef, useState } from 'react';
import { db } from '../../services/client';
import {
  toRidePoint as point,
  type Draft,
  completeRoute,
  listRideRouteCases,
  measureRoute,
  prepareRoute,
  type RidePoint,
  type RideRouteCase,
} from '../../services/rideRoutes';

import { RidePointInput as PointInput } from './RidePointInput';
import { LocalRideMap } from './LocalRideMap';
import {
  getRouteDetail,
  measureAutomaticRoute,
  setRouteWaypoints,
  type RouteDetail,
} from '../../services/rideLocalMap';
const blank: Draft = { label: '', lat: '', lng: '' };
const field = 'w-full rounded-lg border border-slate-300 p-2';
const button = 'rounded-lg border border-slate-300 px-3 py-2 font-semibold';
function DisplayPoint({ name, value }: { name: string; value: RidePoint | null }) {
  return value ? (
    <p>
      <strong>{name}</strong> · {value.label} ({value.lat}, {value.lng})
    </p>
  ) : null;
}
export function DriverLegPoints({ legId }: { legId: string }) {
  const [pair, setPair] = useState<{
    id: string;
    origin: RidePoint | null;
    destination: RidePoint | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void db()
      .rpc('ride_leg_points', { p_leg: legId })
      .then(({ data, error }) => {
        if (active && !error && data)
          setPair({
            id: legId,
            ...(data as unknown as { origin: RidePoint | null; destination: RidePoint | null }),
          });
      });
    return () => {
      active = false;
    };
  }, [legId]);
  if (!pair || pair.id !== legId) return null;
  return (
    <div>
      <DisplayPoint name="Embarque" value={pair.origin} />
      <DisplayPoint name="Destino" value={pair.destination} />
    </div>
  );
}

type Props = {
  bookingId: string | null;
  areas: string[];
  admin?: boolean;
  isServiceClient?: boolean;
  onChange?: () => void;
};
export function RouteCases({ bookingId, areas, admin = false, isServiceClient = false, onChange }: Props) {
  const [list, setList] = useState<RideRouteCase[]>([]);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [originArea, setOriginArea] = useState('');
  const [destArea, setDestArea] = useState('');
  const [serviceEnd, setServiceEnd] = useState<'origin' | 'destination'>('destination');
  const [origin, setOrigin] = useState(blank),
    [dest, setDest] = useState(blank);
  const [stops, setStops] = useState<Draft[]>([]);
  const [instruction, setInstruction] = useState('');
  const op = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    void listRideRouteCases().then(
      (rows) => {
        if (active) setList(rows);
      },
      () => {
        if (active) setMessage('Não foi possível consultar os trajetos.');
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);
  const changed = () => {
    setRevision((n) => n + 1);
    onChange?.();
  };
  const showOrigin = !bookingId || (isServiceClient ? serviceEnd === 'origin' : serviceEnd === 'destination');
  const showDest = !bookingId || (isServiceClient ? serviceEnd === 'destination' : serviceEnd === 'origin');
  return (
    <section className="space-y-3">
      <h2 className="font-bold">{admin ? 'Medições de trajeto' : 'Pontos e medição do trajeto'}</h2>
      {message && <p role="status">{message}</p>}
      {!admin && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              const from = showOrigin ? point(origin) : null,
                to = showDest ? point(dest) : null;
              const payload = JSON.stringify([
                bookingId,
                originArea,
                destArea,
                from,
                to,
                serviceEnd,
                stops,
                instruction,
              ]);
              if (op.current?.payload !== payload) op.current = { payload, key: crypto.randomUUID() };
              const created = await prepareRoute(
                op.current.key,
                bookingId,
                originArea,
                destArea,
                from,
                to,
                bookingId ? serviceEnd : null,
              );
              if (created?.id && !isServiceClient && (stops.length || instruction.trim()))
                await setRouteWaypoints(created.id, stops.map(point), instruction);
              if (created?.id && from && to) {
                try {
                  await measureAutomaticRoute(created.id);
                  setMessage('Percurso medido. Confira o trajeto e faça sua cotação.');
                } catch {
                  setMessage(
                    'Pontos registrados. A operação pode medir este percurso enquanto o roteador está indisponível.',
                  );
                }
              } else setMessage('Pontos registrados. A outra parte pode completar o trajeto.');
              setOrigin(blank);
              setDest(blank);
              setStops([]);
              setInstruction('');
              op.current = null;
              changed();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Não foi possível registrar os pontos.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(['origin', 'destination'] as const).map((k) => (
              <label key={k}>
                Região {k === 'origin' ? 'de embarque' : 'de destino'}
                <select
                  required
                  className={field}
                  value={k === 'origin' ? originArea : destArea}
                  onChange={(e) => (k === 'origin' ? setOriginArea : setDestArea)(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {areas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {bookingId && (
            <label>
              O atendimento ocorre no{' '}
              <select
                className={field}
                value={serviceEnd}
                onChange={(e) => setServiceEnd(e.target.value as 'origin' | 'destination')}
              >
                <option value="destination">destino (ida)</option>
                <option value="origin">embarque (retorno)</option>
              </select>
            </label>
          )}
          {showOrigin && <PointInput name="Embarque" area={originArea} value={origin} set={setOrigin} />}
          {showDest && <PointInput name="Destino" area={destArea} value={dest} set={setDest} />}
          {!isServiceClient && (
            <>
              {stops.map((stop, i) => (
                <div key={i}>
                  <PointInput
                    name={'Parada ' + (i + 1)}
                    value={stop}
                    set={(next) => setStops(stops.map((s, j) => (j === i ? next : s)))}
                  />
                  <button
                    className={button}
                    type="button"
                    onClick={() => setStops(stops.filter((_, j) => i !== j))}
                  >
                    Remover parada {i + 1}
                  </button>
                  {i > 0 && (
                    <button
                      type="button"
                      className={button}
                      onClick={() =>
                        setStops(stops.map((s, j) => (j === i - 1 ? stops[i] : j === i ? stops[i - 1] : s)))
                      }
                    >
                      Antecipar parada {i + 1}
                    </button>
                  )}
                </div>
              ))}
              {stops.length < 5 && (
                <button type="button" className={button} onClick={() => setStops([...stops, blank])}>
                  Adicionar parada nesta corrida
                </button>
              )}
              <label className="block">
                Instrução de embarque (opcional)
                <input
                  className={field}
                  maxLength={180}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
              </label>
            </>
          )}
          <button className={button} disabled={busy}>
            Enviar pontos para medição
          </button>
        </form>
      )}
      {list
        .filter((r) => admin || r.booking_id === bookingId)
        .map((r) => (
          <RouteReview
            key={r.id}
            route={r}
            admin={admin}
            isServiceClient={isServiceClient}
            changed={changed}
          />
        ))}
    </section>
  );
}

function RouteReview({
  route: r,
  admin,
  isServiceClient,
  changed,
}: {
  route: RideRouteCase;
  admin: boolean;
  isServiceClient: boolean;
  changed: () => void;
}) {
  const [missing, setMissing] = useState(blank);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  useEffect(() => {
    let active = true;
    if ((r.status === 'verified' && !isServiceClient && !admin) || (admin && r.can_verify)) {
      void getRouteDetail(r.id).then(
        (d) => {
          if (active) setDetail(d);
        },
        () => {
          if (active) setDetail(null);
        },
      );
    }
    return () => {
      active = false;
    };
  }, [r.id, r.status, r.can_verify, isServiceClient, admin]);
  const [meters, setMeters] = useState(''),
    [minutes, setMinutes] = useState(''),
    [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const fillOrigin = isServiceClient ? r.service_endpoint === 'origin' : r.service_endpoint === 'destination';
  const task = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setError('');
      changed();
    } catch {
      setError('Alteração recusada. Confira o estado do trajeto.');
    } finally {
      setBusy(false);
    }
  };
  const labels = {
    draft: 'Aguardando a outra parte',
    awaiting_review: 'Aguardando medição',
    verified: 'Medido',
    expired: 'Vencido',
  };
  return (
    <article className="space-y-2 rounded-lg border p-3">
      <h3>
        {r.origin_area} → {r.destination_area} · {labels[r.status]}
      </h3>
      <DisplayPoint name="Embarque" value={r.origin} />
      <DisplayPoint name="Destino" value={r.destination} />
      {error && <p role="alert">{error}</p>}
      {r.can_complete && !admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void task(async () => {
              await completeRoute(
                r.id,
                fillOrigin ? point(missing) : null,
                fillOrigin ? null : point(missing),
              );
              try {
                await measureAutomaticRoute(r.id);
              } catch {
                /* The assigned reviewer can complete this case. */
              }
            });
          }}
        >
          <PointInput
            name={fillOrigin ? 'Completar embarque' : 'Completar destino'}
            value={missing}
            set={setMissing}
          />
          <button className={button} disabled={busy}>
            Confirmar meu ponto
          </button>
        </form>
      )}
      {admin && r.can_claim && (
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void task(async () => {
              const { error } = await db().rpc('ride_claim_route', { p_route: r.id });
              if (error) throw error;
            })
          }
        >
          Assumir medição
        </button>
      )}
      {admin && r.can_verify && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void task(() => measureRoute(r.id, Number(meters), Number(minutes), reference));
          }}
        >
          <p>Confira se cada ponto pertence à região declarada antes de medir o trajeto por vias.</p>
          <label className="block">
            Distância por vias (metros)
            <input
              className={field}
              required
              min={1}
              type="number"
              value={meters}
              onChange={(e) => setMeters(e.target.value)}
            />
          </label>
          <label className="block">
            Duração prevista (minutos)
            <input
              className={field}
              required
              min={1}
              type="number"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <label className="block">
            Referência da medição autorizada
            <input
              className={field}
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <button className={button} disabled={busy}>
            Validar trajeto
          </button>
        </form>
      )}
      {r.status === 'awaiting_review' && !admin && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => void task(() => measureAutomaticRoute(r.id))}
        >
          Calcular rota por vias
        </button>
      )}
      {detail && ((!admin && !isServiceClient && r.status === 'verified') || (admin && r.can_verify)) && (
        <>
          {detail.stops.map((p, i) => (
            <DisplayPoint key={i} name={'Parada ' + (i + 1)} value={p} />
          ))}
          {detail.instruction && <p>Instrução de embarque: {detail.instruction}</p>}
          {detail.geometry && (
            <LocalRideMap
              points={[r.origin, ...detail.stops, r.destination].filter((p): p is RidePoint => p !== null)}
              route={detail.geometry.coordinates}
              label="Percurso previsto"
            />
          )}
          {detail.source === 'osrm/car/static' && (
            <p>Tempo estimado pelo percurso viário, sem dados de trânsito ao vivo.</p>
          )}
        </>
      )}
      {r.status === 'verified' && r.minutes !== null && r.meters !== null && (
        <p>
          {r.meters} m · {r.minutes} min
        </p>
      )}
    </article>
  );
}
