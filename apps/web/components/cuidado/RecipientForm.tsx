import React, { useState } from 'react';
import { LIMITS, type CareRecipient, type RecipientInput } from '../../services/care';
import ErrorAlert from '../ErrorAlert';
import HealthDataNotice from './HealthDataNotice';
import { inputClass, primaryButton, secondaryButton } from './styles';
import { Field } from './ui';

interface Props {
  idPrefix: string;
  initial?: CareRecipient;
  submitLabel: string;
  onSubmit: (input: RecipientInput) => Promise<void>;
  onCancel?: () => void;
}

/** The person who receives care: first name, birth year, preferences and emergency contact. Never health data. */
const RecipientForm: React.FC<Props> = ({ idPrefix, initial, submitLabel, onSubmit, onCancel }) => {
  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [birthYear, setBirthYear] = useState(initial?.birth_year ? String(initial.birth_year) : '');
  const [preferences, setPreferences] = useState(initial?.preferences ?? '');
  const [emergencyContact, setEmergencyContact] = useState(initial?.emergency_contact ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ firstName, birthYear, preferences, emergencyContact });
      if (!initial) {
        setFirstName('');
        setBirthYear('');
        setPreferences('');
        setEmergencyContact('');
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate aria-label={initial ? `Editar ${initial.first_name}` : 'Novo assistido'}>
      <HealthDataNotice />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id={`${idPrefix}-nome`} label="Primeiro nome" hint="Só o primeiro nome. O cuidador vê apenas ele.">
          <input
            id={`${idPrefix}-nome`}
            className={inputClass}
            value={firstName}
            maxLength={LIMITS.firstName}
            onChange={e => setFirstName(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field id={`${idPrefix}-ano`} label="Ano de nascimento (opcional)">
          <input
            id={`${idPrefix}-ano`}
            className={inputClass}
            inputMode="numeric"
            placeholder="1940"
            value={birthYear}
            maxLength={4}
            onChange={e => setBirthYear(e.target.value.replace(/\D/g, ''))}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field
        id={`${idPrefix}-preferencias`}
        label="Preferências (opcional)"
        hint="Rotina e gostos, por exemplo: “gosta de rádio de manhã”, “prefere chá a café”. Fica só com a família."
      >
        <textarea
          id={`${idPrefix}-preferencias`}
          className={inputClass}
          rows={3}
          value={preferences}
          maxLength={LIMITS.preferences}
          onChange={e => setPreferences(e.target.value)}
        />
      </Field>
      <Field
        id={`${idPrefix}-emergencia`}
        label="Contato de emergência (opcional)"
        hint="Nome e telefone de quem chamar numa emergência. Fica só com a família."
      >
        <input
          id={`${idPrefix}-emergencia`}
          className={inputClass}
          value={emergencyContact}
          maxLength={LIMITS.emergencyContact}
          onChange={e => setEmergencyContact(e.target.value)}
          autoComplete="off"
        />
      </Field>
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

export default RecipientForm;
