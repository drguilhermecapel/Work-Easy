import { useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorAlert from '../../ErrorAlert';
import { useAuth } from '../../../contexts/AuthContext';
import { useAsync } from '../../../lib/useAsync';
import { answerGuestInvite, guestInvite } from '../../../services/rideBusiness';
import { formatDateTime } from '../../admin/format';
import { useAction } from '../safety/state';
import { danger, primary, secondary } from './shared';

const CLOSED: Record<string, string> = {
  accepted: 'Este convite já foi aceito. A viagem está em Corridas.',
  declined: 'Este convite foi recusado.',
  expired: 'Este convite expirou. Peça um novo à empresa que convidou.',
  revoked: 'A empresa revogou este convite.',
};
const at = (instant: string) => formatDateTime(instant) + ' (São Paulo)';

/**
 * The guest's side of a company invite (fragment `#viagem=`). The confirmed recipient reads which
 * company invites, the areas and the time before answering; the guest never owes anything, so a
 * fare above the voucher is refused by the database and nothing is charged.
 */
export default function GuestInvite({ token }: { token: string }) {
  const { authUser } = useAuth();
  const result = useAsync(() => (token ? guestInvite(token) : Promise.resolve(null)), (authUser?.id ?? '') + ':' + token);
  const action = useAction(result.reload);
  const [answer, setAnswer] = useState<'accepted' | 'declined' | null>(null);
  const [declining, setDeclining] = useState(false);
  const invite = result.data;
  const send = (accept: boolean) =>
    void action.run('guest-answer:' + accept, async (key) => {
      await answerGuestInvite(token, accept, key);
      setAnswer(accept ? 'accepted' : 'declined');
      setDeclining(false);
      return accept ? 'Convite aceito. A viagem foi pedida na sua conta.' : 'Convite recusado. Nenhuma viagem foi criada.';
    });
  return (
    <main className="mx-auto max-w-lg space-y-4 p-5">
      <h1 className="text-xl font-semibold">Viagem a convite de uma empresa</h1>
      {invite?.simulation && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">
          Ambiente de ensaio. Trajeto e valores são fictícios.
        </p>
      )}
      {invite && answer === null && invite.status === 'pending' && (
        <>
          <p>
            <strong>{invite.account_name}</strong> convidou você para uma viagem paga com voucher. Ao aceitar, a viagem é
            pedida na sua conta WorkEasy: só você recebe o código de embarque e acompanha o motorista.
          </p>
          <ol className="space-y-2">
            {invite.legs.map((leg) => (
              <li key={leg.seq} className="border-l-2 border-primary/30 pl-3">
                <p>
                  {leg.origin} → {leg.destination}
                </p>
                <p className="text-sm text-gray-600">
                  {leg.pickup_at ?? invite.scheduled_at
                    ? 'Saída ' + at((leg.pickup_at ?? invite.scheduled_at)!)
                    : 'Saída quando você aceitar'}
                </p>
              </li>
            ))}
          </ol>
          <p>
            Você não paga nada por esta viagem. Se a tarifa passar do valor do voucher, o aceite não é registrado, nada é
            cobrado e a empresa precisa enviar outro convite.
          </p>
          <p className="text-sm text-gray-600">Convite válido até {at(invite.expires_at)}.</p>
          {declining ? (
            <div className="space-y-2 rounded-xl bg-red-50 p-3">
              <p>Recusar encerra este convite. Para viajar depois, a empresa precisará emitir outro.</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={danger} disabled={action.busy} onClick={() => send(false)}>
                  Confirmar recusa
                </button>
                <button type="button" className={secondary} disabled={action.busy} onClick={() => setDeclining(false)}>
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="button" className={primary} disabled={action.busy} onClick={() => send(true)}>
                Aceitar viagem
              </button>
              <button type="button" className={secondary} disabled={action.busy} onClick={() => setDeclining(true)}>
                Recusar convite
              </button>
            </div>
          )}
        </>
      )}
      {invite && answer === null && invite.status !== 'pending' && (
        <p role="status">{CLOSED[invite.status] ?? 'Este convite não está mais disponível.'}</p>
      )}
      {!invite && !result.loading && !result.error && answer === null && (
        <p>
          Convite indisponível para esta conta, encerrado ou expirado. Confira se você entrou com o e-mail que recebeu o
          convite.
        </p>
      )}
      {result.loading && !invite && <p role="status">Consultando convite…</p>}
      {action.message}
      <ErrorAlert error={result.error} />
      {(answer === 'accepted' || invite?.status === 'accepted') && (
        <Link className="text-primary underline" to="/corridas">
          Acompanhar em Corridas
        </Link>
      )}
    </main>
  );
}
