// MapLibre publishes a CSP build with the same API and an external worker.
declare module 'maplibre-gl/dist/maplibre-gl-csp.js' {
  const maplibre: typeof import('maplibre-gl');
  export default maplibre;
}
