import { useEffect, useState, useSyncExternalStore } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { formatCents } from '../../../lib/money';
import { parties } from '../../../services/rideParties';
import { useAction, useSafetyPoll } from '../safety/state';
import { ConfirmAction, InviteLink, ValidityField, card, field, primary, secondary } from './common';
import { NO_SITE, SHOWN_ONCE, until, useInvitePage, validEmail } from './state';

// The token is returned once, and the quote card may leave the screen as soon as the quote is
// superseded. The fresh link therefore stays in memory (never in storage) for the list of sent
// invites to show it until the page is closed or the invite is revoked.
const fresh = new Map<string, { link: string; expires: string }>();
const listeners = new Set<() => void>();
let version = 0;
const publish = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const useFreshLinks = () => useSyncExternalStore(subscribe, () => version);

const STATUS: Record<string, string> = {
  pending: 'Aguardando resposta',
  accepted: 'Aceito · a viagem foi pedida por quem viaja',
  declined: 'Recusado',
  expired: 'Expirado',
  revoked: 'Revogado',
  reprice: 'O preço passou do valor autorizado',
};

/** "Pedir para outra pessoa" on the caller's own awaiting quote: turns the quote into a single-use invite. */
export default function InviteRider({
  quoteId,
  totalCents,
  onIssued,
}: {
  quoteId: string;
  totalCents: number;
  onIssued?: () => void;
}) {
  useFreshLinks();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [instructions, setInstructions] = useState('');
  const [issued, setIssued] = useState('');
  const action = useAction();
  const page = useInvitePage();
  const link = fresh.get(issued);

  function send() {
    void action.run('invite:' + JSON.stringify([quoteId, email, minutes, instructions]), async (key) => {
      const base = page();
      if (!base) return NO_SITE;
      const invite = await parties.inviteRider(quoteId, email.trim(), minutes, instructions, key);
      if (!invite.token) return SHOWN_ONCE;
      fresh.set(invite.id, { link: base + '#viagem=' + invite.token, expires: invite.expires_at });
      setIssued(invite.id);
      publish();
      onIssued?.();
      return 'Convite criado. Copie o link e envie para quem vai viajar.';
    });
  }

  if (link)
    return (
      <section aria-label="Convite de viagem" className="space-y-2">
        <InviteLink link={link.link} expires={link.expires} />
        <p className="text-sm">
          Quem viaja aceita na própria conta. Você paga até {formatCents(totalCents)} e recebe o recibo; o embarque e a
          ajuda do plantão ficam só com quem viaja.
        </p>
        {action.message}
      </section>
    );
  if (!open)
    return (
      <button type="button" className={secondary} onClick={() => setOpen(true)}>
        Pedir para outra pessoa
      </button>
    );
  return (
    <section aria-label="Pedir para outra pessoa" className="space-y-3 rounded-xl border border-gray-200 p-4">
      <h4 className="font-semibold">Pedir para outra pessoa</h4>
      <p className="text-sm">
        A pessoa convidada viaja e você paga até {formatCents(totalCents)}. Esta cotação dá lugar ao convite: o preço é
        conferido de novo no aceite e, se passar desse valor, nada é cobrado e um novo convite é necessário.
      </p>
      <label className="block">
        E-mail de quem vai viajar
        <input
          className={field}
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <ValidityField value={minutes} onChange={setMinutes} />
      <label className="block">
        Instruções para quem viaja (opcional)
        <textarea
          className={field}
          rows={3}
          maxLength={280}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <span className="text-sm text-gray-600">{instructions.length}/280 · some 24 horas depois da resposta.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={action.busy || !validEmail(email)} onClick={send}>
          Gerar convite de viagem
        </button>
        <button type="button" className="underline" disabled={action.busy} onClick={() => setOpen(false)}>
          Fechar
        </button>
      </div>
      {action.message}
    </section>
  );
}

/** The sponsor's invites, with the link of the one just created and the revocation of pending ones. */
export function SentRiderInvites({ emptyText }: { emptyText?: string }) {
  const revision = useFreshLinks();
  const result = useSafetyPoll(() => parties.riderInvites(), 'rider-invites');
  const reload = result.reload;
  // A new invite created on a quote card shows up here without waiting for the next poll.
  useEffect(() => {
    if (revision) reload();
  }, [revision, reload]);
  const action = useAction(reload);
  const invites = result.data ?? [];
  if (!invites.length && !result.error)
    return emptyText && !result.loading ? <p className="text-sm text-gray-600">{emptyText}</p> : null;
  return (
    <section aria-label="Convites de viagem enviados" className={card}>
      <h3 className="font-semibold">Convites de viagem enviados</h3>
      <ErrorAlert error={result.error} />
      <ul className="space-y-3">
        {invites.map((invite) => {
          const link = fresh.get(invite.id);
          return (
            <li key={invite.id} className="space-y-2 border-l-2 border-primary/30 pl-3">
              <p>
                {STATUS[invite.status] ?? invite.status} · você paga até {formatCents(invite.ceiling_cents)}
              </p>
              {invite.status === 'pending' && <p className="text-sm text-gray-600">Válido até {until(invite.expires_at)}</p>}
              {invite.status === 'accepted' && (
                <p className="text-sm text-gray-600">Para cancelar depois do aceite, use o trecho em Corridas.</p>
              )}
              {invite.status === 'pending' && link && <InviteLink link={link.link} expires={link.expires} />}
              {invite.status === 'pending' && (
                <ConfirmAction
                  label="Revogar convite"
                  confirmLabel="Confirmar revogação"
                  busy={action.busy}
                  onConfirm={() =>
                    action.run('revoke:' + invite.id, async () => {
                      await parties.revokeRiderInvite(invite.id);
                      fresh.delete(invite.id);
                      return 'Convite revogado. O link deixou de valer.';
                    })
                  }
                >
                  O link deixa de valer e ninguém poderá aceitar esta viagem. Para pedir de novo, faça outra cotação.
                </ConfirmAction>
              )}
            </li>
          );
        })}
      </ul>
      {action.message}
    </section>
  );
}
