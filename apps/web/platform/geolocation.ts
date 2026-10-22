// Device location through navigator.geolocation: the same call works on the
// website, in the Android/iOS WebViews (Capacitor, with the permissions of
// AndroidManifest.xml and Info.plist) and in the desktop app (Tauri).
// It never throws and never blocks the caller: a refusal or a failure gives
// no coordinates and a sentence in pt-BR.

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LocationResult {
  coords: Coordinates | null;
  /** Why there are no coordinates (pt-BR); null when there are. */
  error: string | null;
}

export const LOCATION_MESSAGES = {
  denied:
    'A localização está bloqueada neste aparelho. Para incluí-la nos registros, libere a permissão de localização do WorkEasy nas configurações do aparelho ou do navegador.',
  unavailable: 'Não foi possível descobrir a localização deste aparelho agora.',
  timeout: 'A localização demorou para responder.',
  unsupported: 'Este aparelho ou navegador não oferece localização.',
} as const;

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

const messageFor = (code: number): string => {
  if (code === PERMISSION_DENIED) return LOCATION_MESSAGES.denied;
  if (code === TIMEOUT) return LOCATION_MESSAGES.timeout;
  if (code === POSITION_UNAVAILABLE) return LOCATION_MESSAGES.unavailable;
  return LOCATION_MESSAGES.unavailable;
};

// 6 decimals is about 10 cm, far more than a check-in needs
const round = (value: number): number => Math.round(value * 1e6) / 1e6;

const DEFAULT_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 };

/** Asks the device for its position once. */
export const locate = (options: PositionOptions = {}): Promise<LocationResult> =>
  new Promise(resolve => {
    const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    if (!geolocation) {
      resolve({ coords: null, error: LOCATION_MESSAGES.unsupported });
      return;
    }
    try {
      geolocation.getCurrentPosition(
        position => {
          const { latitude, longitude } = position.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            resolve({ coords: null, error: LOCATION_MESSAGES.unavailable });
            return;
          }
          resolve({ coords: { lat: round(latitude), lng: round(longitude) }, error: null });
        },
        failure => resolve({ coords: null, error: messageFor(failure.code) }),
        { ...DEFAULT_OPTIONS, ...options },
      );
    } catch {
      resolve({ coords: null, error: LOCATION_MESSAGES.unavailable });
    }
  });

/** The device position, or null when it is refused or unavailable (use `locate` to know why). */
export const getCurrentPosition = async (options?: PositionOptions): Promise<Coordinates | null> =>
  (await locate(options)).coords;
