import React, { useState } from 'react';
import { AppError } from '../../lib/errors';
import { todayInSaoPaulo } from '../../lib/timezone';
import { LIMITS, createShift, type CareRecipient, type Household, type Shift } from '../../services/care';
import ErrorAlert from '../ErrorAlert';
import HealthDataNotice from './HealthDataNotice';
import { formatShiftPeriod, parseReaisToCents, toShiftPeriod } from './format';
import { inputClass, primaryButton } from './styles';
import { Field } from './ui';

interface Props {
  households: Household[];
  recipients: CareRecipient[];
  initialHouseholdId?: string;
  onCreated: (shift: Shift) => void;
}

/** New shift: day and times in São Paulo time, the agreed value and notes for the caregiver. */
const ShiftForm: React.FC<Props> = ({ households, recipients, initialHouseholdId, onCreated }) => {
  const first = households.find(h => h.id === initialHouseholdId) ?? households[0];
  const [householdId, setHouseholdId] = useState(first?.id ?? '');
  const [recipientId, setRecipientId] = useState('');
  const [day, setDay] = useState('');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('20:00');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const people = recipients.filter(r => r.household_id === householdId);
  const period = day ? toShiftPeriod(day, start, end) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!householdId) throw new AppError('invalid_input', { message: 'Escolha a casa do plantão.' });
      if (!period) throw new AppError('invalid_input', { message: 'Informe o dia e os horários de início e de fim.' });
      const valueCents = parseReaisToCents(value);
      if (valueCents === null) throw new AppError('invalid_input', { message: 'Informe o valor do plantão em reais, por exemplo 280,00.' });
      const shift = await createShift({ householdId, careRecipientId: recipientId || null, period, valueCents, notes });
      setDay('');
      setValue('');
      setNotes('');
      onCreated(shift);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label="Novo plantão">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="plantao-casa" label="Casa">
          <select
            id="plantao-casa"
            className={inputClass}
            value={householdId}
            onChange={e => {
              setHouseholdId(e.target.value);
              setRecipientId('');
            }}
          >
            {households.map(h => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="plantao-pessoa" label="Pessoa cuidada" hint="O cuidador vê só o primeiro nome.">
          <select id="plantao-pessoa" className={inputClass} value={recipientId} onChange={e => setRecipientId(e.target.value)}>
            <option value="">Não informar</option>
            {people.map(r => (
              <option key={r.id} value={r.id}>
                {r.first_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field id="plantao-dia" label="Dia de início" className="col-span-2 sm:col-span-1">
          <input id="plantao-dia" type="date" className={inputClass} min={todayInSaoPaulo()} value={day} onChange={e => setDay(e.target.value)} />
        </Field>
        <Field id="plantao-inicio" label="Início">
          <input id="plantao-inicio" type="time" className={inputClass} value={start} onChange={e => setStart(e.target.value)} />
        </Field>
        <Field id="plantao-fim" label="Fim">
          <input id="plantao-fim" type="time" className={inputClass} value={end} onChange={e => setEnd(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-gray-500" aria-live="polite">
        {period
          ? `Plantão: ${formatShiftPeriod(period)} (horário de Brasília).`
          : 'Horário de Brasília. Se o fim for antes do início, o plantão termina no dia seguinte (plantão noturno).'}
      </p>
      <Field
        id="plantao-valor"
        label="Valor do plantão (R$)"
        hint="Valor combinado para o plantão inteiro. O cuidador vê este valor. O WorkEasy não recebe nem repassa esse pagamento: o acerto é direto entre vocês."
      >
        <input
          id="plantao-valor"
          className={inputClass}
          inputMode="decimal"
          placeholder="280,00"
          value={value}
          onChange={e => setValue(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field id="plantao-notas" label="Observações para o cuidador (opcional)" hint="Por exemplo: “levar documento na portaria”, “almoço já fica pronto”.">
        <textarea
          id="plantao-notas"
          className={inputClass}
          rows={3}
          value={notes}
          maxLength={LIMITS.shiftNotes}
          onChange={e => setNotes(e.target.value)}
        />
      </Field>
      <HealthDataNotice />
      <ErrorAlert error={error} />
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? 'Criando…' : 'Criar plantão'}
      </button>
    </form>
  );
};

export default ShiftForm;
