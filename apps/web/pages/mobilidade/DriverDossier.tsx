import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { dangerButton, inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Field } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import { useAuth } from '../../contexts/AuthContext';
import { todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import {
  beginDriverDossier,
  decideDriverDossier,
  fileLabels,
  getDriverDossier,
  submitDriverDossier,
  uploadDriverFile,
  type DriverDossier as Dossier,
  type DriverFileKind,
} from '../../services/driverDossier';
import { PrivateDriverPhoto } from './RideDriverIdentity';

type Run = (action: () => Promise<unknown>) => void;
const kinds = Object.keys(fileLabels) as DriverFileKind[];
const textFields = [
  ['name', 'Nome a exibir ao passageiro'],
  ['number', 'Número municipal do condutor'],
  ['model', 'Modelo do veículo'],
  ['plate', 'Placa do veículo'],
] as const;

function DetailsForm({ dossier, version, busy, run }: { dossier?: Dossier | null; version: string; busy: boolean; run: Run }) {
  const [accepted, setAccepted] = useState(false);
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const field = (key: string) => String(f.get(key) ?? '').trim();
    run(() => beginDriverDossier({ name: field('name'), number: field('number'), model: field('model'), plate: field('plate') }, version));
  };
  return (
    <form className="grid gap-2 sm:grid-cols-2" onSubmit={save}>
      {textFields.map(([key, label]) => (
        <Field id={`condutor-${key}`} key={key} label={label}>
          <input
            id={`condutor-${key}`}
            name={key}
            className={inputClass}
            required
            defaultValue={dossier?.[key] ?? ''}
            maxLength={key === 'plate' ? 7 : key === 'number' ? 80 : 100}
            minLength={key === 'number' ? 1 : 2}
            pattern={key === 'plate' ? '[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}' : undefined}
            title={key === 'plate' ? 'Placa brasileira, com sete caracteres e sem hífen' : undefined}
          />
        </Field>
      ))}
      <label className="sm:col-span-2 text-sm">
        <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> Li o aviso de verificação e
        identificação do condutor (versão {version}).{' '}
        <Link className="text-primary underline" to="/legal">
          Ver documentos de privacidade
        </Link>
      </label>
      <button type="submit" disabled={busy || !accepted} className={primaryButton}>
        {dossier?.status === 'draft' ? 'Salvar identificação' : 'Abrir dossiê de verificação'}
      </button>
    </form>
  );
}

function Decision({ dossier, busy, run }: { dossier: Dossier; busy: boolean; run: Run }) {
  const [reason, setReason] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      decideDriverDossier(
        dossier.id,
        true,
        { driver: String(form.get('driver')), vehicle: String(form.get('vehicle')), insurance: String(form.get('insurance')) },
        '',
      ),
    );
  };
  return (
    <div className="space-y-3">
      {dossier.status === 'submitted' && (
        <form onSubmit={submit} className="space-y-2">
          <p className="text-sm">
            Confira os documentos nas fontes competentes. Use a primeira expiração entre as habilitações exigidas para o motorista e para o
            veículo.
          </p>
          {(
            [
              ['driver', 'Validade do condutor e registro municipal'],
              ['vehicle', 'Validade do veículo e certificado'],
              ['insurance', 'Validade do seguro'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} id={`revisao-${dossier.id}-${key}`} label={label}>
              <input type="date" className={inputClass} id={`revisao-${dossier.id}-${key}`} name={key} required min={todayInSaoPaulo()} />
            </Field>
          ))}
          <button type="submit" disabled={busy} className={primaryButton}>
            Confirmar verificação e aprovar
          </button>
        </form>
      )}
      <Field
        id={`motivo-${dossier.id}`}
        label={dossier.status === 'approved' ? 'Motivo para suspender a aprovação' : 'Motivo para devolver a ficha'}
      >
        <input
          id={`motivo-${dossier.id}`}
          className={inputClass}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <button
        type="button"
        className={dangerButton}
        disabled={busy || reason.trim().length < 3}
        onClick={() => run(() => decideDriverDossier(dossier.id, false, { driver: '', vehicle: '', insurance: '' }, reason))}
      >
        {dossier.status === 'approved' ? 'Suspender aprovação' : 'Rejeitar e informar o motivo'}
      </button>
    </div>
  );
}

export default function DriverDossier({ driverId, onChanged }: { driverId?: string; onChanged: () => void }) {
  const { authUser } = useAuth();
  const view = useAsync(() => getDriverDossier(driverId), JSON.stringify([authUser?.id, driverId]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [renew, setRenew] = useState(false);
  const dossier = view.data?.dossier;
  const run: Run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setRenew(false);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      view.reload();
    }
  };
  if (!view.data) return <ErrorAlert error={view.error} />;
  if (!view.data.open || !view.data.version) return <p className="text-sm">A coleta de documentos de condutor está fechada.</p>;
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 p-3">
      <h3 className="font-semibold">Verificação do motorista e veículo</h3>
      <ErrorAlert error={view.error ?? error} />
      {dossier && (
        <p className="text-sm">
          {dossier.name} · {dossier.model} · {dossier.plate} · Registro {dossier.number}
        </p>
      )}
      {dossier?.status === 'submitted' && <p className="text-sm">Documentos enviados para revisão.</p>}
      {dossier?.status === 'approved' && <p className="text-sm">Dossiê aprovado.</p>}
      {dossier?.status === 'rejected' && <p className="text-sm text-red-800">Ficha devolvida. {dossier.reason}</p>}
      {!driverId && (
        <>
          {dossier?.status === 'approved' && !renew && (
            <button className={secondaryButton} onClick={() => setRenew(true)}>
              Atualizar identificação ou renovar documentos
            </button>
          )}
          {(!dossier || dossier.status === 'draft' || dossier.status === 'rejected' || renew) && (
            <>
              <p className="text-sm">
                A equipe verifica habilitações e seguro. Somente o passageiro pode ver sua identificação, as fotos e a placa durante o
                trecho atribuído. Ao abrir nova revisão, as ofertas ficam pausadas até aprovação.
              </p>
              {view.data.retention_days != null && (
                <p className="text-sm">
                  Prazo de guarda da ficha em edição: {view.data.retention_days} dias. Para fichas aprovadas, o prazo começa ao terminar a
                  validade das habilitações.
                </p>
              )}
              <DetailsForm key={dossier?.id} dossier={dossier} busy={busy} run={run} version={view.data.version} />
            </>
          )}
        </>
      )}
      {driverId && !dossier && <p className="text-sm">O motorista ainda não enviou o dossiê.</p>}
      {dossier && (
        <ul className="space-y-2">
          {kinds.map((kind) => {
            const file = dossier.files.find((x) => x.kind === kind);
            return (
              <li key={kind} className="space-y-1">
                {file ? (
                  <PrivateDriverPhoto key={file.id} file={file.id} label={fileLabels[kind]} />
                ) : (
                  <p className="text-sm">{fileLabels[kind]} · Pendente</p>
                )}
                {!driverId && dossier.status === 'draft' && (
                  <label className="block text-xs text-gray-700">
                    {file ? 'Substituir' : 'Enviar'} {fileLabels[kind].toLowerCase()} (JPEG ou PNG, até 8 MB)
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      disabled={busy || view.loading}
                      className="mt-1 block w-full text-sm"
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        e.target.value = '';
                        if (selected) run(() => uploadDriverFile(kind, selected));
                      }}
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!driverId && dossier?.status === 'draft' && (
        <button
          className={primaryButton}
          disabled={busy || dossier.files.length !== kinds.length}
          onClick={() => run(() => submitDriverDossier(dossier.id))}
        >
          Enviar documentos para revisão
        </button>
      )}
      {driverId && driverId !== authUser?.id && (dossier?.status === 'submitted' || dossier?.status === 'approved') && (
        <Decision dossier={dossier} busy={busy} run={run} />
      )}
    </section>
  );
}
