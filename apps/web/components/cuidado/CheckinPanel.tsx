import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, MapPin } from 'lucide-react';
import { locate, type Coordinates } from '../../platform/geolocation';
import { recordConsent } from '../../services/account';
import { checkIn, checkinWindow, type CaregiverShift, type CheckinKind } from '../../services/care';
import CareError from './CareError';
import { dayKey, formatMoment, formatTime } from './format';
import { primaryButton } from './styles';

export interface CheckinDone {
  kind: CheckinKind;
  at: Date;
  coords: Coordinates | null;
  /** Why the record has no coordinates; null when it has them. */
  locationNote: string | null;
}

interface Props {
  userId: string;
  shift: CaregiverShift;
  kind: CheckinKind;
  /** The caregiver agreed to share the device location (latest `location` consent is granted). */
  locationGranted: boolean;
  onDone: (done: CheckinDone) => void;
}

/** How often the window is checked against the clock. */
const CLOCK_MS = 30_000;

const WORDS: Record<CheckinKind, { button: string; busy: string; anchor: string; icon: typeof LogIn }> = {
  in: { button: 'Registrar entrada', busy: 'Registrando entrada…', anchor: 'início', icon: LogIn },
  out: { button: 'Registrar saída', busy: 'Registrando saída…', anchor: 'fim', icon: LogOut },
};

/**
 * Check-in or check-out with the device location. The location is optional: if the
 * caregiver declines or the device refuses, the record is made without coordinates
 * and the screen says so. The window (2 hours around the start or the end) is
 * checked by the database; the hint here only tells what to expect.
 */
const CheckinPanel: React.FC<Props> = ({ userId, shift, kind, locationGranted, onDone }) => {
  const words = WORDS[kind];
  const Icon = words.icon;
  const [useLocation, setUseLocation] = useState(locationGranted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // The state of the window follows the clock while the screen stays open
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);
  const slot = checkinWindow(shift.period, kind, now);
  const idBase = `checkin-${shift.shift_id}-${kind}`;

  // "às 08:00" for today, "em qua., 23/10/2030, 08:00" for another day
  const when = (instant: Date) => (dayKey(instant) === dayKey(now) ? `às ${formatTime(instant)}` : `em ${formatMoment(instant)}`);

  const hint =
    slot.state === 'early'
      ? `O registro abre ${when(slot.opensAt)} (2 horas antes do ${words.anchor} do plantão). Antes disso o servidor recusa.`
      : slot.state === 'late'
        ? `O prazo para este registro terminou ${when(slot.closesAt)} (2 horas depois do ${words.anchor} do plantão). O servidor deve recusar; avise a família.`
        : `Registro aberto até ${dayKey(slot.closesAt) === dayKey(now) ? `as ${formatTime(slot.closesAt)}` : formatMoment(slot.closesAt)}.`;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let coords: Coordinates | null = null;
      let locationNote: string | null = null;
      if (useLocation) {
        // Ticking the box is the consent: keep it in the history before reading the position
        if (!locationGranted) await recordConsent(userId, 'location', true);
        const result = await locate();
        coords = result.coords;
        locationNote = result.error;
      } else {
        locationNote = 'Você escolheu não enviar a localização.';
      }
      await checkIn({ shiftId: shift.shift_id, kind, coords });
      onDone({ kind, at: new Date(), coords, locationNote: coords ? null : locationNote });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 bg-gray-50 rounded-xl p-3">
      <p className={`text-sm ${slot.state === 'open' ? 'text-gray-700' : 'text-amber-800'}`}>{hint}</p>
      <label htmlFor={`${idBase}-local`} className="flex items-start gap-2 text-sm text-gray-700">
        <input id={`${idBase}-local`} type="checkbox" className="mt-1 shrink-0" checked={useLocation} onChange={e => setUseLocation(e.target.checked)} />
        <span>
          <span className="inline-flex items-center gap-1 font-medium">
            <MapPin size={14} aria-hidden="true" /> Enviar minha localização neste registro
          </span>
          <span className="block text-xs text-gray-500">
            A família vê onde o registro foi feito. É opcional: sem localização o registro vale do mesmo jeito. Você pode revogar em Minha
            conta.
          </span>
        </span>
      </label>
      <CareError error={error} audience="cuidador" />
      <button type="button" className={primaryButton} disabled={busy} onClick={submit}>
        <Icon size={16} aria-hidden="true" /> {busy ? words.busy : words.button}
      </button>
    </div>
  );
};

export default CheckinPanel;
