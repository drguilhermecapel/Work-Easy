import { useId, useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { RIDE_VALIDITY, until, type Validity } from './state';

// Shared pieces of the family, companion and dependent screens (PAR-501..504).

export const card = 'space-y-3 rounded-2xl border border-gray-200 bg-white p-5';
export const primary = 'rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
export const secondary =
  'rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 disabled:opacity-50';
export const danger = 'rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-700 disabled:opacity-50';
export const field = 'block w-full mt-1 rounded-xl border border-gray-300 bg-white p-2.5 text-gray-900';
export const banner = 'rounded-xl bg-amber-50 p-3 font-semibold text-amber-900';

/** How long an invite stays open. A ride invite takes minutes; an adhesion or companion invite, up to 7 days. */
export function ValidityField({
  value,
  onChange,
  options = RIDE_VALIDITY,
}: {
  value: number;
  onChange: (minutes: number) => void;
  options?: Validity[];
}) {
  return (
    <label className="block">
      Validade do convite
      <select className={field} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((option) => (
          <option key={option.minutes} value={option.minutes}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The one-time link, ready to copy and send through a channel the person trusts. */
export function InviteLink({ link, expires }: { link: string; expires?: string }) {
  const [copied, setCopied] = useState('');
  const id = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('Link copiado.');
    } catch {
      setCopied('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }
  return (
    <div className="space-y-2 rounded-xl bg-gray-50 p-3">
      <label className="block" htmlFor={id}>
        Link do convite
      </label>
      <input id={id} readOnly className={field} value={link} onFocus={(e) => e.target.select()} />
      <button type="button" className={secondary} onClick={() => void copy()}>
        <Copy aria-hidden="true" size={16} className="mr-2 inline" />
        Copiar link
      </button>
      <p className="text-sm text-gray-600">
        O link aparece uma única vez{expires ? ` e vale até ${until(expires)}` : ''}. Envie por um canal de confiança:
        só a conta com o e-mail informado consegue abrir.
      </p>
      {copied && <p role="status">{copied}</p>}
    </div>
  );
}

/** A destructive action asks once more, saying what changes and what stays. */
export function ConfirmAction({
  label,
  confirmLabel,
  children,
  busy,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  children: ReactNode;
  busy: boolean;
  onConfirm: () => void | Promise<void>;
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
      <p className="text-sm">{children}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={danger}
          disabled={busy}
          onClick={() => {
            void Promise.resolve(onConfirm()).finally(() => setOpen(false));
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="underline" disabled={busy} onClick={() => setOpen(false)}>
          Voltar
        </button>
      </div>
    </div>
  );
}
