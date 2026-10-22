import React, { ReactElement, ReactNode, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { card, dangerButton, secondaryButton } from './styles';

/** Rounded white panel. */
export const Card: React.FC<{ children: ReactNode; className?: string; as?: 'section' | 'div' | 'li' }> = ({
  children,
  className = '',
  as: Tag = 'div',
}) => <Tag className={`${card} ${className}`}>{children}</Tag>;

/** Label + control + optional hint; `id` ties the label to the control. */
export const Field: React.FC<{ id: string; label: string; hint?: string; children: ReactNode; className?: string }> = ({
  id,
  label,
  hint,
  children,
  className = '',
}) => {
  // The hint is read with the control, unless the control already points somewhere
  const control =
    hint &&
    isValidElement<{ 'aria-describedby'?: string }>(children) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type) &&
    !children.props['aria-describedby']
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': `${id}-dica` })
      : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {control}
      {hint && (
        <p id={`${id}-dica`} className="text-xs text-gray-500 mt-1">
          {hint}
        </p>
      )}
    </div>
  );
};

export const Badge: React.FC<{ className: string; children: ReactNode }> = ({ className, children }) => (
  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-sm ${className}`}>{children}</span>
);

/** Section title with an optional action on the right. */
export const SectionTitle: React.FC<{ id?: string; children: ReactNode; action?: ReactNode }> = ({ id, children, action }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
    <h2 id={id} className="text-lg font-bold text-gray-800">
      {children}
    </h2>
    {action}
  </div>
);

export const EmptyState: React.FC<{ children: ReactNode }> = ({ children }) => (
  <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-2xl p-5">{children}</p>
);

/** A destructive action asks once more before running. */
export const ConfirmButton: React.FC<{
  label: string;
  confirmLabel: string;
  question: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
}> = ({ label, confirmLabel, question, onConfirm, disabled }) => {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={secondaryButton} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-sm text-gray-700">{question}</span>
      <button
        type="button"
        className={dangerButton}
        disabled={disabled}
        onClick={async () => {
          await onConfirm();
          setAsking(false);
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className={secondaryButton} onClick={() => setAsking(false)}>
        Voltar
      </button>
    </span>
  );
};

/** Copies a text to the clipboard and says so; falls back to a prompt-free message when copying is blocked. */
export const CopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 3000);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={secondaryButton} onClick={copy}>
        {state === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {label}
      </button>
      <span role="status" className="text-xs text-gray-500">
        {state === 'copied' ? 'Copiado.' : state === 'failed' ? 'Não foi possível copiar. Selecione o texto e copie.' : ''}
      </span>
    </span>
  );
};
