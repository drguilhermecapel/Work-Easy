import { useEffect, useId, useRef, useState } from 'react';
import type { GeoJSONSource, Map as LibreMap, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

interface Point { lat: number; lng: number; label?: string }
interface Props {
  points: Point[];
  route?: [number, number][];
  onPick?: (point: Point) => void;
  label?: string;
}

let library: Promise<typeof import('maplibre-gl')> | undefined;
function loadMap() {
  library ??= Promise.all([
    import('maplibre-gl'), import('pmtiles'), import('maplibre-gl/dist/maplibre-gl.css'),
  ]).then(([lib, { Protocol }]) => {
    lib.setWorkerUrl(workerUrl);
    lib.addProtocol('pmtiles', new Protocol().tile);
    return lib;
  }).catch(error => { library = undefined; throw error; });
  return library;
}

const sampleCenter: [number, number] = [-46.639, -23.6195];
const emptyLine = { type: 'FeatureCollection' as const, features: [] };
const emptyRoute: [number, number][] = [];
function mapStyle(): StyleSpecification {
  const asset = import.meta.env.VITE_RIDE_PMTILES_PATH || '/maps/saude.pmtiles';
  const archive = new URL(asset, window.location.href);
  if (archive.origin !== window.location.origin || archive.username || archive.password) {
    throw new Error('O mapa deve ser servido pela mesma origem.');
  }
  return {
    version: 8,
    sources: {
      local: { type: 'vector', url: 'pmtiles://' + archive.href },
      itinerary: { type: 'geojson', data: emptyLine },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#faf9f5' } },
      { id: 'parques', type: 'fill', source: 'local', 'source-layer': 'context', filter: ['==', 'kind', 'green'], paint: { 'fill-color': '#c7e3c9' } },
      { id: 'agua', type: 'fill', source: 'local', 'source-layer': 'context', filter: ['==', 'kind', 'water'], paint: { 'fill-color': '#b6d9ee' } },
      { id: 'edificios', type: 'fill', source: 'local', 'source-layer': 'context', filter: ['==', 'kind', 'building'], paint: { 'fill-color': '#ddd9d1' } },
      { id: 'vias', type: 'line', source: 'local', 'source-layer': 'context', filter: ['==', 'kind', 'road'], paint: { 'line-color': '#b2aca3', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 5] } },
      { id: 'locais', type: 'circle', source: 'local', 'source-layer': 'context', filter: ['==', 'kind', 'poi'], paint: { 'circle-radius': 2.5, 'circle-color': '#618778' } },
      { id: 'trajeto', type: 'line', source: 'itinerary', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3e5ce5', 'line-width': 5 } },
    ],
  };
}

export function LocalRideMap({ points, route = emptyRoute, onPick, label = 'Mapa do trajeto' }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef<LibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const caption = useId();
  // Update overlays for changed coordinates, even when a caller recreates arrays on render.
  const coordinates = JSON.stringify({ points, route });
  useEffect(() => {
    let active = true;
    let owned: LibreMap | undefined;
    const element = host.current;
    if (!element) return;
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => owned?.resize());
    void loadMap().then(lib => {
      if (!active) return;
      owned = new lib.Map({
        container: element, style: mapStyle(), center: sampleCenter, zoom: 15,
        attributionControl: false, cooperativeGestures: true, maxZoom: 20,
        canvasContextAttributes: { antialias: false },
      });
      current.current = owned;
      owned.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      owned.once('load', () => { if (active) setReady(true); });
      owned.on('error', () => { if (active) setError(true); });
      resize?.observe(element);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; resize?.disconnect(); owned?.remove(); current.current = null; };
  }, []);

  useEffect(() => {
    const map = current.current;
    if (!map || !ready) return;
    let active = true;
    const markers: import('maplibre-gl').Marker[] = [];
    const data = JSON.parse(coordinates) as { points: Point[]; route: [number, number][] };
    void loadMap().then(lib => {
      if (!active) return;
      const bounds = new lib.LngLatBounds();
      data.points.forEach((point, i) => {
        const marker = document.createElement('span');
        marker.className = 'flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary font-bold text-white shadow';
        marker.textContent = String(i + 1);
        marker.title = point.label || ('Ponto ' + (i + 1));
        markers.push(new lib.Marker({ element: marker }).setLngLat([point.lng, point.lat]).addTo(map));
        bounds.extend([point.lng, point.lat]);
      });
      data.route.forEach(p => bounds.extend(p));
      map.getSource<GeoJSONSource>('itinerary')?.setData(data.route.length > 1
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: data.route } }
        : emptyLine);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, maxZoom: 17, duration: 0 });
    });
    return () => { active = false; markers.forEach(marker => marker.remove()); };
  }, [coordinates, ready]);

  useEffect(() => {
    const map = current.current;
    if (!ready || !map || !onPick) return;
    const pick = (e: import('maplibre-gl').MapMouseEvent) => onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    map.on('click', pick);
    return () => { map.off('click', pick); };
  }, [onPick, ready]);

  return <figure className="space-y-2" aria-labelledby={caption}>
    <figcaption id={caption} className="font-semibold">{label}</figcaption>
    <div ref={host} className="h-64 w-full overflow-hidden rounded-xl border border-slate-300" />
    {error && <p role="status">Mapa indisponível neste dispositivo ou recorte. Consulte os pontos do trajeto.</p>}
    {points.length > 0 && <ol className="list-decimal pl-6 text-sm">{points.map((p, i) =>
      <li key={i}>{p.label || `Ponto ${i + 1}`} · {p.lat.toFixed(5)}, {p.lng.toFixed(5)}</li>)}</ol>}
    {onPick && <button type="button" className="rounded-lg border px-3 py-2 font-semibold" disabled={!ready}
      onClick={() => { const center = current.current?.getCenter(); if (center) onPick({ lat: center.lat, lng: center.lng }); }}>
      Usar centro do mapa
    </button>}
    <p className="text-xs text-slate-600">© <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Colaboradores do OpenStreetMap</a> · ODbL</p>
  </figure>;
}
export default LocalRideMap;
