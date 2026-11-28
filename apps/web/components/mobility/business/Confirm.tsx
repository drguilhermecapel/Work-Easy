import { useState, type ReactNode } from 'react';
import { danger, secondary } from './shared';

/** A destructive action asks once more, saying what changes and what stays. */
export default function Confirm({
  label,
  confirmLabel,
  busy,
  onConfirm,
  children,
}: {
  label: string;
  confirmLabel: string;
  busy: boolean;
  /** Resolves when the attempt ends; the question closes only if it answers true. */
  onConfirm: () => Promise<boolean>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="text-sm text-red-700 underline" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <p>{children}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={danger}
          disabled={busy}
          onClick={() => void onConfirm().then((done) => done && setOpen(false))}
        >
          {confirmLabel}
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={() => setOpen(false)}>
          Voltar
        </button>
      </div>
    </div>
  );
}
