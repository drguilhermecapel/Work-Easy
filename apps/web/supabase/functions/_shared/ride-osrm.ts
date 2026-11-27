import { errors } from './http.ts';

export type Coordinate = [number, number];
export type Geometry = { type: 'LineString'; coordinates: Coordinate[] };
export interface RouteMeasurement {
  meters: number;
  minutes: number;
  geometry: Geometry;
}

function coordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

export async function measureRideRoad(
  osrmBase: string,
  coordinates: Coordinate[],
  fetcher: typeof fetch,
): Promise<RouteMeasurement> {
  if (coordinates.length < 2 || coordinates.length > 7 || !coordinates.every(coordinate))
    throw errors.invalidInput(['coordinates']);
  const url = new URL(osrmBase);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw errors.upstream('Roteador indisponível.');
  const path = coordinates.map((p) => p.map((n) => n.toFixed(6)).join(',')).join(';');
  url.pathname = url.pathname.replace(/\/$/, '') + '/route/v1/driving/' + path;
  url.search = new URLSearchParams({
    alternatives: 'false',
    geometries: 'geojson',
    overview: 'simplified',
    steps: 'false',
    radiuses: coordinates.map(() => '100').join(';'),
  }).toString();
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  } catch {
    throw errors.upstream('O roteador está indisponível. A medição assistida continua disponível.');
  }
  if (!response.ok) throw errors.upstream('Não foi possível medir o percurso por vias.');
  const result = await response.json();
  const best = result.routes?.[0];
  if (
    result.code !== 'Ok' ||
    !best ||
    !Number.isFinite(best.distance) ||
    !Number.isFinite(best.duration) ||
    best.distance <= 0 ||
    best.distance > 100000 ||
    best.duration <= 0 ||
    best.duration > 14400 ||
    best.geometry?.type !== 'LineString' ||
    !Array.isArray(best.geometry.coordinates) ||
    best.geometry.coordinates.length < 2 ||
    best.geometry.coordinates.length > 12000 ||
    !best.geometry.coordinates.every(coordinate)
  )
    throw errors.conflict('route_unavailable', 'Trajeto sem cobertura. Solicite medição assistida.');
  return {
    meters: Math.max(1, Math.round(best.distance)),
    minutes: Math.ceil(best.duration / 60),
    geometry: best.geometry,
  };
}
