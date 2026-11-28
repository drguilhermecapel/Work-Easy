import { useState } from 'react';
import { Link } from 'react-router-dom';
import { answerGuestInvite } from '../../../services/rideBusiness';
import { useAction } from '../safety/state';
import { danger, primary, secondary } from './shared';

/**
 * The guest's side of a company invite (fragment #viagem=). There is no call to preview a guest
 * invite, so the view explains what the answer does and the database decides whether this token
 * is a guest invite for the signed-in e-mail (`ride_invite_unavailable` otherwise).
 */
export default function GuestInvite({ token }: { token: string }) {
  const action = useAction();
  const [answer, setAnswer] = useState<'accepted' | 'declined' | null>(null);
  const [declining, setDeclining] = useState(false);
  const send = (accept: boolean) =>
    void action.run('guest-answer:' + accept, async (key) => {
      await answerGuestInvite(token, accept, key);
      setAnswer(accept ? 'accepted' : 'declined');
      setDeclining(false);
      return accept ? 'Convite aceito. A viagem foi registrada na sua conta.' : 'Convite recusado. Nenhuma viagem foi criada.';
    });
  return (
    <main className="mx-auto max-w-lg space-y-4 p-5">
      <h1 className="text-xl font-semibold">Viagem a convite de uma empresa</h1>
      {answer === null && (
        <>
          <p>
            Uma empresa convidou você para uma viagem paga com voucher. Ao aceitar, a viagem é criada na sua conta
            WorkEasy: só você recebe o PIN de embarque e acompanha o motorista.
          </p>
          <p>O voucher cobre o valor definido pela empresa. O detalhe do trajeto e dos valores aparece em Corridas.</p>
          <p className="text-sm text-gray-600">
            O convite só vale para a conta do e-mail convidado e tem prazo curto. Se ele não abrir, confira com qual
            e-mail você entrou.
          </p>
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
      {action.message}
      {answer === 'accepted' && (
        <Link className="text-primary underline" to="/corridas">
          Acompanhar em Corridas
        </Link>
      )}
    </main>
  );
}
