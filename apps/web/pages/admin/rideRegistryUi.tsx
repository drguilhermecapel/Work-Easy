import { useState, type ReactNode } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Field } from '../../components/admin/ui';
import { lastBookableDayInSaoPaulo, todayInSaoPaulo } from '../../lib/timezone';
import { LIVE_RULE } from './rideRegistryFormat';

// Pieces shared by the registry panels of the operation (DD125): fields, the validity date and the
// list frame. Every field has its label; the database stays the authority on every rule.

type Change = (value: string) => void;
export function Text({ id, label, value, onChange, hint, max = 160, list }: { id: string; label: string; value: string; onChange: Change; hint?: string; max?: number; list?: string }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input id={id} type="text" className={inputClass} required maxLength={max} list={list} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
export function Num({ id, label, value, onChange, min, max, hint }: { id: string; label: string; value: string; onChange: Change; min: number; max: number; hint?: string }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input id={id} type="number" className={inputClass} required min={min} max={max} step={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
export function Money({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: Change }) {
  return (
    <Field id={id} label={label} hint="Em reais, por exemplo 18,00.">
      <input id={id} type="text" inputMode="decimal" className={inputClass} required value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
export function Pick({ id, label, value, onChange, options, disabled }: { id: string; label: string; value: string; onChange: Change; options: string[]; disabled?: boolean }) {
  return (
    <Field id={id} label={label}>
      <select id={id} className={inputClass} required disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Until({ id, value, onChange }: { id: string; value: string; onChange: Change }) {
  return (
    <Field id={id} label="Válido até (São Paulo)" hint="Último dia de validade, no máximo 24 meses à frente.">
      <input id={id} type="date" className={inputClass} required min={todayInSaoPaulo()} max={lastBookableDayInSaoPaulo(new Date(), 720)} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
export function Enabled({ id, value, onChange, label }: { id: string; value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className="h-4 w-4" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-sm text-gray-800">
        {label}
      </label>
    </div>
  );
}
export function FormButtons({ busy, save, cancel }: { busy: boolean; save: string; cancel?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="submit" className={primaryButton} disabled={busy}>
        {save}
      </button>
      {cancel && (
        <button type="button" className={secondaryButton} disabled={busy} onClick={cancel}>
          Voltar
        </button>
      )}
    </div>
  );
}
export const Problem = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
      {text}
    </p>
  ) : null;

/** Frame of a panel: title, intro, the reading state and a form that opens on demand. */
export function Panel({
  id,
  title,
  intro,
  loading,
  error,
  simulation,
  addLabel,
  form,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  loading: boolean;
  error: unknown;
  simulation?: boolean;
  addLabel: string;
  /** The form of a new row; receives a function that closes it. */
  form: (close: () => void) => ReactNode;
  children: ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="text-lg font-semibold text-gray-900">
        {title}
      </h3>
      <p className="text-sm text-gray-700">{intro}</p>
      <p className="text-sm text-gray-600">{LIVE_RULE}</p>
      {simulation && <p className="text-sm text-amber-900">Ensaio com dados fictícios.</p>}
      {loading && <p role="status">Consultando cadastros…</p>}
      <ErrorAlert error={error} />
      {children}
      {adding ? (
        form(() => setAdding(false))
      ) : (
        <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>
          {addLabel}
        </button>
      )}
    </section>
  );
}
