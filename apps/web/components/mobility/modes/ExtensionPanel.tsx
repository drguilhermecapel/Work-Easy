import { useState, type FormEvent } from 'react';
import { formatCents } from '../../../lib/money';
import { rideBlocks } from '../../../services/rideModes';
import { failureAlert, field, hours, inset, primary, secondary, useModeAction, usePoll, whenSP } from './modeState';

const ACTIVE = ['accepted', 'arriving', 'boarded'];
// A requested block is read once so its leg is labelled; only an active one is polled and extended.
const READABLE = ['requested', ...ACTIVE];
const STEPS = [15, 30, 45, 60, 90, 120];

/**
 * Extension of an hourly block on an active leg: either side proposes more time or distance, and
 * it applies only after the payer and the driver both accept. Renders nothing for other legs.
 */
export function ExtensionPanel({
  legId,
  legStatus,
  onChanged,
}: {
  legId: string;
  legStatus: string;
  onChanged?: () => void;
}) {
  const active = ACTIVE.includes(legStatus);
  const readable = READABLE.includes(legStatus);
  const state = usePoll(
    async () => (readable ? rideBlocks.state(legId) : null),
    JSON.stringify([legId, legStatus]),
    20_000,
    (read, failed) => active && (!!read || failed),
  );
  const action = useModeAction(() => {
    state.reload();
    onChanged?.();
  });
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const [km, setKm] = useState('0');
  const data = state.data;
  if (!data) {
    return (
      <>
        {readable && failureAlert(state.error)}
        {action.message}
      </>
    );
  }
  const pending = data.extensions.filter((e) => e.state === 'pending');
  const extraKm = Math.max(0, Math.floor(Number(km) || 0));
  const preview = (minutes / 15) * data.extra_15min_cents + extraKm * data.extra_km_cents;

  async function propose(event: FormEvent) {
    event.preventDefault();
    const done = await action.run(`propose:${minutes}:${extraKm}`, async (key) => {
      const result = await rideBlocks.propose(legId, minutes, extraKm, key);
      return `Extensão proposta por ${formatCents(result.cents)}. Ela só vale depois do aceite do pagador e do motorista.`;
    });
    if (done) setOpen(false);
  }
  const decide = (id: string, accept: boolean) =>
    action.run(`decide:${id}:${accept}`, async () => {
      const result = await rideBlocks.decide(id, accept);
      if (!accept) return 'Extensão recusada. O bloco contratado continua valendo.';
      return result === 'applied'
        ? 'Extensão aplicada ao bloco. O novo total aparece no trecho.'
        : 'Aceite registrado. Falta o aceite da outra parte.';
    });

  return (
    <section aria-label="Bloco por hora" className={inset}>
      <h4 className="font-semibold">Bloco por hora</h4>
      <p>
        Contratado: {hours(data.minutes)} · {data.included_km} km incluídos.
        {data.extended_minutes + data.extended_km > 0 &&
          ` Extensões aceitas: +${data.extended_minutes} min · +${data.extended_km} km · ${formatCents(data.extension_cents)}.`}
      </p>
      <p className="text-sm text-gray-700">Sem extensão aceita pelas duas partes, nenhum excedente é cobrado.</p>
      {pending.map((e) => (
        <article key={e.id} className="space-y-2 rounded-lg border p-3">
          <p className="font-medium">
            Extensão proposta: +{e.minutes} min · +{e.km} km · {formatCents(e.cents)}
          </p>
          <p className="text-sm">Válida até {whenSP(e.expires_at)}. O bloco atual segue valendo até os dois aceites.</p>
          {e.accepted_by_me && <p role="status">Seu aceite foi registrado. Falta o aceite da outra parte.</p>}
          {e.may_decide && (
            <div className="flex flex-wrap gap-2">
              {!e.accepted_by_me && (
                <button type="button" className={primary} disabled={action.busy} onClick={() => void decide(e.id, true)}>
                  Aceitar extensão
                </button>
              )}
              <button type="button" className={secondary} disabled={action.busy} onClick={() => void decide(e.id, false)}>
                {e.accepted_by_me ? 'Desistir e recusar a extensão' : 'Recusar extensão'}
              </button>
            </div>
          )}
        </article>
      ))}
      {!active && <p className="text-sm text-gray-700">Extensões podem ser propostas depois que o motorista aceitar.</p>}
      {active && data.can_propose && pending.length === 0 && !open && (
        <button type="button" className={secondary} disabled={action.busy} onClick={() => setOpen(true)}>
          Propor mais tempo ou distância
        </button>
      )}
      {active && data.can_propose && open && (
        <form onSubmit={propose} className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              Tempo adicional
              <select className={field} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {STEPS.map((step) => (
                  <option key={step} value={step}>
                    {hours(step)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Quilômetros adicionais
              <input
                className={field}
                type="number"
                min={0}
                max={500}
                step={1}
                value={km}
                onChange={(e) => setKm(e.target.value)}
              />
            </label>
          </div>
          <p>
            Preço previsto da extensão: {formatCents(preview)} ({formatCents(data.extra_15min_cents)} a cada 15 min ·{' '}
            {formatCents(data.extra_km_cents)} por km). O valor registrado na proposta é o que vale.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primary} disabled={action.busy}>
              Propor extensão
            </button>
            <button type="button" className="underline" disabled={action.busy} onClick={() => setOpen(false)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {action.message}
    </section>
  );
}

export default ExtensionPanel;
