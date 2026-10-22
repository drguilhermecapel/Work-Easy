import React, { useState } from 'react';
import { LIMITS, submitDailyReport, type DailyReport } from '../../services/care';
import CareError from './CareError';
import HealthDataNotice from './HealthDataNotice';
import { inputClass, primaryButton } from './styles';
import { Field } from './ui';

interface Props {
  shiftId: string;
  /** The report already sent, to edit it (sending again replaces it). */
  existing?: DailyReport;
  onSent: () => void;
}

/** The caregiver's daily report: meals, activities, mood and notes. Plain text, never health data. */
const ReportForm: React.FC<Props> = ({ shiftId, existing, onSent }) => {
  const [meals, setMeals] = useState(existing?.meals ?? '');
  const [activities, setActivities] = useState(existing?.activities ?? '');
  const [mood, setMood] = useState(existing?.mood ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const id = `relatorio-${shiftId}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await submitDailyReport({ shiftId, meals, activities, mood, notes });
      setSent(true);
      onSent();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate aria-label="Relatório do dia">
      <HealthDataNotice>
        Conte como foi o dia em texto simples: refeições, atividades e humor. Não registre remédios, doses, sintomas nem diagnósticos; se
        algo preocupar, avise a família por telefone e, se for urgente, chame o SAMU (192).
      </HealthDataNotice>
      <Field id={`${id}-refeicoes`} label="Refeições">
        <textarea id={`${id}-refeicoes`} className={inputClass} rows={2} value={meals} maxLength={LIMITS.meals} onChange={e => setMeals(e.target.value)} />
      </Field>
      <Field id={`${id}-atividades`} label="Atividades">
        <textarea
          id={`${id}-atividades`}
          className={inputClass}
          rows={2}
          value={activities}
          maxLength={LIMITS.activities}
          onChange={e => setActivities(e.target.value)}
        />
      </Field>
      <Field id={`${id}-humor`} label="Humor">
        <input id={`${id}-humor`} className={inputClass} value={mood} maxLength={LIMITS.mood} onChange={e => setMood(e.target.value)} autoComplete="off" />
      </Field>
      <Field id={`${id}-observacoes`} label="Observações">
        <textarea
          id={`${id}-observacoes`}
          className={inputClass}
          rows={3}
          value={notes}
          maxLength={LIMITS.reportNotes}
          onChange={e => setNotes(e.target.value)}
        />
      </Field>
      <CareError error={error} audience="cuidador" />
      {sent && (
        <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg p-3">
          Relatório enviado. A família já pode lê-lo. Se enviar de novo, o relatório anterior é substituído.
        </p>
      )}
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? 'Enviando…' : existing || sent ? 'Atualizar relatório' : 'Enviar relatório'}
      </button>
    </form>
  );
};

export default ReportForm;
