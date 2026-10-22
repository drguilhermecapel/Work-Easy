import React, { FormEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { phraseMatches } from '../../services/admin';
import ErrorAlert from '../ErrorAlert';
import { dangerButton, inputClass, primaryButton, secondaryButton } from './styles';
import { Field } from './ui';

export interface ConfirmFormProps {
  title: string;
  description?: ReactNode;
  /** none: no field; optional: field that may stay empty; required: the action is refused without it. */
  reason: 'none' | 'optional' | 'required';
  reasonLabel?: string;
  /** Words to type before the action runs (money features). */
  phrase?: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onConfirm: (reason: string) => Promise<unknown>;
  onCancel: () => void;
}

type Problem = { field: 'reason' | 'phrase'; text: string };

/** Confirmation step of an administrator action: reason, typed phrase and the error of the server. */
export const ConfirmForm: React.FC<ConfirmFormProps> = ({
  title,
  description,
  reason: reasonMode,
  reasonLabel,
  phrase,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
}) => {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Move the focus into the step that just opened
  useEffect(() => {
    const field = formRef.current?.querySelector<HTMLElement>('textarea, input');
    (field ?? titleRef.current)?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const text = reason.trim();
    if (reasonMode === 'required' && !text) {
      setProblem({ field: 'reason', text: 'Informe o motivo. Ele fica no histórico da ação.' });
      return;
    }
    if (phrase && !phraseMatches(typed, phrase)) {
      setProblem({ field: 'phrase', text: `Digite a frase exatamente como mostrada: ${phrase}` });
      return;
    }
    setProblem(null);
    setError(null);
    setBusy(true);
    try {
      await onConfirm(text);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const reasonProblem = problem?.field === 'reason' ? problem.text : null;
  const phraseProblem = problem?.field === 'phrase' ? problem.text : null;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
    >
      <h3 id={`${id}-title`} ref={titleRef} tabIndex={-1} className="font-semibold text-gray-800 text-sm focus:outline-hidden">
        {title}
      </h3>
      {description && <div className="text-sm text-gray-600 space-y-1">{description}</div>}
      {reasonMode !== 'none' && (
        <Field id={`${id}-reason`} label={reasonLabel ?? (reasonMode === 'required' ? 'Motivo (obrigatório)' : 'Motivo (opcional)')}>
          <textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={e => setReason(e.target.value)}
            className={inputClass}
            aria-invalid={reasonProblem ? true : undefined}
            aria-describedby={reasonProblem ? `${id}-reason-problem` : undefined}
          />
          {reasonProblem && (
            <p id={`${id}-reason-problem`} role="alert" className="text-sm text-red-700 mt-1">
              {reasonProblem}
            </p>
          )}
        </Field>
      )}
      {phrase && (
        <Field id={`${id}-phrase`} label={`Para confirmar, digite: ${phrase}`}>
          <input
            id={`${id}-phrase`}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            className={inputClass}
            aria-invalid={phraseProblem ? true : undefined}
            aria-describedby={phraseProblem ? `${id}-phrase-problem` : undefined}
          />
          {phraseProblem && (
            <p id={`${id}-phrase-problem`} role="alert" className="text-sm text-red-700 mt-1">
              {phraseProblem}
            </p>
          )}
        </Field>
      )}
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={tone === 'danger' ? dangerButton : primaryButton}>
          {busy ? 'Aguarde…' : confirmLabel}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={secondaryButton}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

type ActionButtonProps = Omit<ConfirmFormProps, 'onCancel'> & {
  /** Text of the button that opens the confirmation step. */
  label: string;
  onDone?: () => void;
  /** The button stays visible but cannot be used; `hint` says why (it is read with the button). */
  disabled?: boolean;
  hint?: ReactNode;
};

/** A button that opens its confirmation step in place; runs `onDone` after the server accepts the action. */
export const ActionButton: React.FC<ActionButtonProps> = ({ label, onConfirm, onDone, disabled, hint, ...form }) => {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const hintId = useId();

  // Give the focus back to the button when the step is cancelled
  useEffect(() => {
    if (!open && wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (open && !disabled) {
    return (
      <ConfirmForm
        {...form}
        onCancel={() => setOpen(false)}
        onConfirm={async reason => {
          await onConfirm(reason);
          setOpen(false);
          onDone?.();
        }}
      />
    );
  }
  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-describedby={disabled && hint ? hintId : undefined}
        className={form.tone === 'danger' ? dangerButton : form.tone === 'primary' ? primaryButton : secondaryButton}
      >
        {label}
      </button>
      {disabled && hint && (
        <p id={hintId} className="basis-full text-xs text-gray-600">
          {hint}
        </p>
      )}
    </>
  );
};
