import { useState, useEffect } from 'react';
import { LocalRideMap } from './LocalRideMap';
import { toRidePoint, type Draft, type RidePoint } from '../../services/rideRoutes';
import {
  listMyRidePlaces,
  searchRidePlaces,
  storeRidePlace,
  forgetRidePlace,
  type SavedPlace,
} from '../../services/rideLocalMap';
const field = 'w-full rounded-lg border border-slate-300 p-2';
const button = 'rounded-lg border border-slate-300 px-3 py-2 font-semibold';
export function RidePointInput({
  name,
  value,
  set,
  area,
}: {
  name: string;
  value: Draft;
  set: (d: Draft) => void;
  area?: string;
}) {
  const [message, setMessage] = useState('');
  const [choices, setChoices] = useState<(RidePoint & { osm_type: string; osm_id: number; area: string })[]>(
    [],
  );
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [catalogLabel, setCatalogLabel] = useState<string | null>(null);
  const select = (p: RidePoint) => {
    set({ label: p.label, lat: String(p.lat), lng: String(p.lng) });
    setCatalogLabel(p.label);
    setChoices([]);
    setSuggest(false);
  };
  const reloadPlaces = () => listMyRidePlaces().then(setSaved);
  useEffect(() => {
    if (!suggest || value.label.trim().length < 3) return;
    let active = true;
    const timer = setTimeout(() => {
      void searchRidePlaces(value.label, area).then(
        (rows) => {
          if (active) setChoices(rows);
        },
        () => {
          if (active) {
            setChoices([]);
            setMessage('Busca indisponível. Confirme o ponto no mapa ou preencha as coordenadas.');
          }
        },
      );
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [suggest, value.label, area]);
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{name}</legend>
      <label className="block">
        Endereço ou ponto de encontro
        <input
          className={field}
          required
          minLength={3}
          maxLength={180}
          value={value.label}
          onChange={(e) => {
            setSuggest(true);
            setChoices([]);
            set(
              catalogLabel !== null
                ? { label: e.target.value, lat: '', lng: '' }
                : { ...value, label: e.target.value },
            );
            setCatalogLabel(null);
          }}
        />
      </label>
      {choices.length > 0 && (
        <ul aria-label={'Sugestões de ' + name}>
          {choices.map((p) => (
            <li key={p.osm_type + p.osm_id}>
              <button type="button" className={button} onClick={() => select(p)}>
                {p.label} · {p.area} ({p.lat.toFixed(4)}, {p.lng.toFixed(4)})
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={button} onClick={() => setShowMap(!showMap)}>
        {showMap ? 'Fechar mapa' : 'Ajustar pino no mapa'}
      </button>
      {showMap && (
        <LocalRideMap
          label={'Ajustar ' + name}
          points={
            value.lat && value.lng
              ? [{ lat: Number(value.lat), lng: Number(value.lng), label: value.label }]
              : []
          }
          onPick={(p) => {
            set({ label: value.label || name, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) });
            setCatalogLabel(null);
            setSuggest(false);
            setChoices([]);
          }}
        />
      )}
      <button
        type="button"
        className={button}
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded)
            void reloadPlaces().catch(() => setMessage('Não foi possível consultar os seus lugares.'));
        }}
      >
        Favoritos e recentes
      </button>
      {expanded && (
        <div className="space-y-2">
          {saved.map((p) => (
            <p key={p.id}>
              <button type="button" className="underline" onClick={() => select(p.point)}>
                {p.point.label}
              </button>{' '}
              · {p.kind === 'favorite' ? 'Favorito' : 'Recente'}{' '}
              <button
                type="button"
                onClick={() => {
                  void forgetRidePlace(p.id)
                    .then(reloadPlaces)
                    .catch(() => setMessage('Não foi possível excluir.'));
                }}
              >
                Excluir
              </button>
            </p>
          ))}
          {(['favorite', 'recent'] as const).map((k) => (
            <button
              key={k}
              className={button}
              type="button"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await storeRidePlace(k, toRidePoint(value));
                  await reloadPlaces();
                  setMessage('Lugar salvo na sua conta.');
                } catch {
                  setMessage('Confira o ponto antes de guardar.');
                } finally {
                  setPending(false);
                }
              }}
            >
              {k === 'favorite' ? 'Salvar como favorito' : 'Guardar nos recentes por 7 dias'}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(['lat', 'lng'] as const).map((k) => (
          <label key={k}>
            {k === 'lat' ? 'Latitude' : 'Longitude'}
            <input
              className={field}
              type="number"
              step="any"
              min={k === 'lat' ? -90 : -180}
              max={k === 'lat' ? 90 : 180}
              required
              value={value[k]}
              onChange={(e) => set({ ...value, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className={button}
        onClick={() => {
          if (!navigator.geolocation) {
            setMessage('Digite as coordenadas do ponto.');
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (p) => {
              setCatalogLabel(null);
              setSuggest(false);
              setChoices([]);
              set({
                label: value.label || name,
                lat: String(p.coords.latitude),
                lng: String(p.coords.longitude),
              });
              setMessage('Posição preenchida. Confira antes de enviar.');
            },
            () => setMessage('Posição indisponível. Digite as coordenadas.'),
            { maximumAge: 0, timeout: 10000 },
          );
        }}
      >
        Usar minha posição neste ponto
      </button>
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
