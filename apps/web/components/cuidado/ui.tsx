import React, { ReactElement, ReactNode, cloneElement, isValidElement, useRef, useState } from 'react';
import { card, dangerButton, secondaryButton } from './styles';

/** Rounded white panel. */
export const Card: React.FC<{
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'li';
  /** id of the heading that names a section. */
  labelledBy?: string;
}> = ({ children, className = '', as: Tag = 'div', labelledBy }) => (
  <Tag className={`${card} ${className}`} aria-labelledby={labelledBy}>
    {children}
  </Tag>
);

/** Label + control + optional hint; `id` ties the label to the control and the hint is read with it. */
export const Field: React.FC<{ id: string; label: string; hint?: string; children: ReactNode; className?: string }> = ({
  id,
  label,
  hint,
  children,
  className = '',
}) => {
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
  const [busy, setBusy] = useState(false);
  // A second click can arrive before the screen redraws with the button off
  const running = useRef(false);
  if (!asking) {
    return (
      <button type="button" className={secondaryButton} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-sm text-gray-700 basis-full sm:basis-auto">{question}</span>
      <button
        type="button"
        className={dangerButton}
        disabled={disabled || busy}
        onClick={async () => {
          if (running.current) return;
          running.current = true;
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            running.current = false;
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {busy ? 'Aguarde…' : confirmLabel}
      </button>
      <button type="button" className={secondaryButton} disabled={busy} onClick={() => setAsking(false)}>
        Voltar
      </button>
    </span>
  );
};
