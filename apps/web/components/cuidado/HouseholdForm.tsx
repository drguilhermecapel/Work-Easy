import React, { useMemo, useState } from 'react';
import type { NeighborhoodRow } from '../../services/types';
import { LIMITS, type Household, type HouseholdInput } from '../../services/care';
import ErrorAlert from '../ErrorAlert';
import HealthDataNotice from './HealthDataNotice';
import { inputClass, primaryButton, secondaryButton } from './styles';
import { Field } from './ui';

interface Props {
  idPrefix: string;
  initial?: Household;
  neighborhoods: NeighborhoodRow[];
  submitLabel: string;
  onSubmit: (input: HouseholdInput) => Promise<void>;
  onCancel?: () => void;
}

/** Neighborhoods grouped by zone, as in the request and search screens. */
export const NeighborhoodOptions: React.FC<{ neighborhoods: NeighborhoodRow[] }> = ({ neighborhoods }) => {
  const zones = useMemo(() => {
    const groups = new Map<string, NeighborhoodRow[]>();
    for (const n of neighborhoods) {
      const zone = n.zone || 'Outros';
      groups.set(zone, [...(groups.get(zone) ?? []), n]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [neighborhoods]);
  return (
    <>
      {zones.map(([zone, items]) => (
        <optgroup key={zone} label={zone}>
          {items.map(n => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
};

/** Name, neighborhood and notes of a household (the place where the care happens). */
const HouseholdForm: React.FC<Props> = ({ idPrefix, initial, neighborhoods, submitLabel, onSubmit, onCancel }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [neighborhoodId, setNeighborhoodId] = useState(initial?.neighborhood_id ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name, neighborhoodId: neighborhoodId || null, notes });
      if (!initial) {
        setName('');
        setNeighborhoodId('');
        setNotes('');
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate aria-label={initial ? `Editar a casa ${initial.name}` : 'Nova casa'}>
      <Field id={`${idPrefix}-nome`} label="Nome da casa" hint="Como a família chama o lugar, por exemplo “Casa da vó”.">
        <input
          id={`${idPrefix}-nome`}
          className={inputClass}
          value={name}
          maxLength={LIMITS.householdName}
          onChange={e => setName(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field id={`${idPrefix}-bairro`} label="Bairro" hint="O cuidador vê o bairro, nunca o endereço.">
        <select id={`${idPrefix}-bairro`} className={inputClass} value={neighborhoodId} onChange={e => setNeighborhoodId(e.target.value)}>
          <option value="">Não informar</option>
          <NeighborhoodOptions neighborhoods={neighborhoods} />
        </select>
      </Field>
      <Field id={`${idPrefix}-notas`} label="Observações sobre a casa (opcional)" hint="Por exemplo: “portaria 24 horas”, “sem elevador”.">
        <textarea
          id={`${idPrefix}-notas`}
          className={inputClass}
          rows={3}
          value={notes}
          maxLength={LIMITS.householdNotes}
          onChange={e => setNotes(e.target.value)}
        />
      </Field>
      <HealthDataNotice />
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? 'Salvando…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={secondaryButton} onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
};

export default HouseholdForm;
