import { useEffect, useState } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { secondaryButton } from '../../components/admin/styles';
import { useAuth } from '../../contexts/AuthContext';
import { useAsync } from '../../lib/useAsync';
import { fileLabels, getDossierPhoto, getDriverIdentity } from '../../services/driverDossier';

export function PrivateDriverPhoto({ file, label, leg }: { file: string; label: string; leg?: string }) {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const picture = useAsync(async () => (open ? (await getDossierPhoto(file, leg)).url : null), JSON.stringify([file, leg, open, nonce]));
  useEffect(() => {
    if (!picture.data) return;
    const timer = window.setTimeout(() => setOpen(false), 115_000);
    return () => window.clearTimeout(timer);
  }, [picture.data]);
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={secondaryButton}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setNonce((x) => x + 1);
        }}
      >
        {open ? 'Fechar' : 'Ver'} {label.toLowerCase()}
      </button>
      <ErrorAlert error={picture.error} />
      {open && picture.data && (
        <img src={picture.data} alt={label} referrerPolicy="no-referrer" className="max-h-80 max-w-full rounded-lg object-contain" />
      )}
    </div>
  );
}

export default function RideDriverIdentity({ legId }: { legId: string }) {
  const { authUser } = useAuth();
  const identity = useAsync(() => getDriverIdentity(legId), JSON.stringify([authUser?.id, legId]));
  if (!identity.data) return <ErrorAlert error={identity.error} />;
  const { name, number, model, plate, photos } = identity.data;
  return (
    <section aria-label="Identificação do motorista" className="rounded-lg bg-gray-50 p-3 space-y-2">
      <h3 className="font-semibold">{name}</h3>
      <p className="text-sm">
        {model} · {plate} · Registro municipal {number}
      </p>
      {(['driver_photo', 'vehicle_photo'] as const).map(
        (kind) => photos[kind] && <PrivateDriverPhoto key={photos[kind]} file={photos[kind]!} label={fileLabels[kind]} leg={legId} />,
      )}
    </section>
  );
}
