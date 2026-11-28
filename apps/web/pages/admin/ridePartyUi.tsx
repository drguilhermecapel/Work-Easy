import { useState, type ReactNode } from 'react';
import { dangerButton, inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Field } from '../../components/admin/ui';
import { formatDateBR, lastBookableDayInSaoPaulo, validityEnd } from '../../lib/timezone';
import { partiesAdmin } from '../../services/ridePartiesAdmin';
import { attempt, type Action } from './ridePartyFormat';

// Components shared by the console of ride accounts (O17 stage 5) and its lazy panels.

/** A decision that cannot be undone from this screen asks once more, saying what it changes. */
export function Confirm({
  label,
  confirmLabel,
  tone = 'danger',
  disabled,
  busy,
  onConfirm,
  children,
}: {
  label: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** The fields the decision needs are not filled yet. */
  disabled: boolean;
  busy: boolean;
  /** Resolves when the attempt ends; the question closes only if it answers true. */
  onConfirm: () => Promise<boolean>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const style = tone === 'primary' ? primaryButton : dangerButton;
  if (!open || disabled)
    return (
      <button type="button" className={style} disabled={disabled || busy} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p>{children}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={style} disabled={busy} onClick={() => void onConfirm().then((done) => done && setOpen(false))}>
          {confirmLabel}
        </button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => setOpen(false)}>
          Voltar
        </button>
      </div>
    </div>
  );
}

/**
 * Registers or withdraws the check of one company or fleet. The reference names the dossier that
 * was checked; nobody verifies an account they belong to (the database refuses it).
 */
export function VerifyAccount({
  account,
  name,
  withdrawable,
  action,
}: {
  account: string;
  name: string;
  /** The account holds a check that can be withdrawn. */
  withdrawable: boolean;
  action: Action;
}) {
  const [reference, setReference] = useState('');
  const [until, setUntil] = useState('');
  const ref = reference.trim();
  const end = until ? validityEnd(until) : null;
  const id = 'conta-' + account;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ref || !end) return;
        void action.run('verify:' + account, async () => {
          await partiesAdmin.verifyAccount(account, ref, end.toISOString());
          return `Conferência de ${name} registrada, válida até ${formatDateBR(until)}.`;
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id + '-ref'} label={'Referência da conferência de ' + name} hint="Identificador do dossiê, sem dados pessoais.">
          <input id={id + '-ref'} type="text" className={inputClass} maxLength={160} value={reference} onChange={(event) => setReference(event.target.value)} />
        </Field>
        <Field id={id + '-ate'} label={'Conferência de ' + name + ' válida até'} hint="No máximo 13 meses a partir de hoje.">
          <input
            id={id + '-ate'}
            type="date"
            className={inputClass}
            min={lastBookableDayInSaoPaulo(new Date(), 0)}
            max={lastBookableDayInSaoPaulo(new Date(), 390)}
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={action.busy || !ref || !end}>
          Registrar conferência de {name}
        </button>
        {withdrawable && (
          <Confirm
            label={'Retirar conferência de ' + name}
            confirmLabel="Confirmar retirada"
            disabled={!ref}
            busy={action.busy}
            onConfirm={() =>
              attempt(action, 'withdraw:' + account, async () => {
                await partiesAdmin.verifyAccount(account, ref, null);
                return `Conferência de ${name} retirada. A conta fica sem operar até nova conferência.`;
              })
            }
          >
            Retirar a conferência de {name}? A conta deixa de operar até uma nova conferência. Viagens e faturas já
            registradas não mudam.
          </Confirm>
        )}
      </div>
    </form>
  );
}
