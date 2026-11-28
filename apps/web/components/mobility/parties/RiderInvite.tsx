import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ErrorAlert from '../../ErrorAlert';
import { useAuth } from '../../../contexts/AuthContext';
import { useAsync } from '../../../lib/useAsync';
import { parties } from '../../../services/rideParties';
import { useAction } from '../safety/state';
import { ConfirmAction, banner, primary } from './common';
import { until } from './state';

const CLOSED: Record<string, string> = {
  accepted: 'Este convite já foi aceito. A viagem está em Corridas.',
  declined: 'Este convite foi recusado.',
  expired: 'Este convite expirou. Peça um novo a quem convidou.',
  revoked: 'Quem convidou revogou este convite.',
  reprice: 'O preço desta viagem passou do valor que quem convidou autorizou. Nada foi cobrado e a viagem não foi pedida. Peça a quem convidou uma nova cotação e um novo convite.',
};
const CHANNELS = { email: 'e-mail', phone: 'telefone' };

/**
 * The rider's view of a ride someone else offered to pay (fragment `#viagem=`). The same fragment
 * carries a company's guest invite: when this token is not a ride invite for the account, the
 * page shows `fallback` instead of the unavailable notice.
 */
export default function RiderInvite({ token, fallback }: { token: string; fallback?: ReactNode }) {
  const { authUser } = useAuth();
  const result = useAsync(
    () => (token ? parties.riderInvite(token) : Promise.resolve(null)),
    (authUser?.id ?? '') + ':' + token,
  );
  const [answer, setAnswer] = useState<'accepted' | 'declined' | 'reprice' | ''>('');
  const action = useAction(result.reload);
  const invite = result.data;
  const pending = invite?.status === 'pending' && !answer;

  const decide = (accept: boolean) =>
    action.run(accept ? 'accept' : 'decline', async (key) => {
      const reply = await parties.answerRiderInvite(token, accept, key);
      const status = reply?.status ?? (accept ? 'accepted' : 'declined');
      setAnswer(status);
      if (status === 'reprice') return CLOSED.reprice;
      return accept ? 'Viagem pedida. O embarque aparece em Corridas.' : 'Convite recusado. Nenhuma viagem foi pedida.';
    });

  if (fallback && !invite && !result.loading && !result.error && !answer) return <>{fallback}</>;
  return (
    <main className="mx-auto max-w-lg space-y-4 p-5">
      <h1 className="text-xl font-semibold">Convite de viagem</h1>
      {invite?.simulation && (
        <p role="status" className={banner}>
          Ambiente de ensaio. Trajeto e valores são fictícios.
        </p>
      )}
      {invite ? (
        <>
          <p>
            Outra pessoa pediu esta viagem para você e paga por ela. Só você consulta o embarque, o código de
            confirmação e a ajuda do plantão; quem paga recebe o recibo e não vê o seu trajeto.
          </p>
          <ol className="space-y-2">
            {invite.legs.map((leg) => (
              <li key={leg.seq} className="border-l-2 border-primary/30 pl-3">
                <p>
                  {leg.origin} → {leg.destination}
                </p>
                <p className="text-sm text-gray-600">
                  {leg.pickup_at ?? invite.scheduled_at
                    ? 'Saída ' + until((leg.pickup_at ?? invite.scheduled_at)!)
                    : 'Saída sem horário marcado'}
                </p>
              </li>
            ))}
          </ol>
          {invite.instructions && (
            <p className="rounded-xl bg-gray-50 p-3">
              <span className="font-semibold">Instruções de quem convidou:</span> {invite.instructions}
            </p>
          )}
          {invite.support ? (
            <p className="text-sm">
              Ajuda humana · {invite.support.team} por {CHANNELS[invite.support.channel]}: {invite.support.address}
              {invite.support.on_duty ? ' · plantão em atendimento agora' : ' · fora do horário de plantão agora'}
            </p>
          ) : (
            <p className="text-sm">Depois do aceite, o contato do plantão aparece no trecho, em Corridas.</p>
          )}
          {pending ? (
            <>
              <p className="text-sm text-gray-600">
                Convite válido até {until(invite.expires_at)}. O preço é conferido de novo no aceite: se passar do valor
                autorizado por quem convidou, a viagem não é pedida e nada é cobrado.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" className={primary} disabled={action.busy} onClick={() => void decide(true)}>
                  Aceitar e pedir a viagem
                </button>
                <ConfirmAction
                  label="Recusar convite"
                  confirmLabel="Confirmar recusa"
                  busy={action.busy}
                  onConfirm={() => decide(false)}
                >
                  Ao recusar, o convite se encerra e nenhuma viagem é pedida.
                </ConfirmAction>
              </div>
            </>
          ) : (
            !answer && <p role="status">{CLOSED[invite.status] ?? 'Este convite não está mais disponível.'}</p>
          )}
        </>
      ) : (
        !result.loading &&
        !result.error &&
        !answer && (
          <p>
            Convite indisponível para esta conta, encerrado ou expirado. Confira se você entrou com o e-mail que recebeu o
            convite.
          </p>
        )
      )}
      {result.loading && !invite && <p role="status">Consultando convite…</p>}
      {action.message}
      <ErrorAlert error={result.error} />
      {(answer === 'accepted' || invite?.status === 'accepted') && (
        <Link className="text-primary underline" to="/corridas">
          Abrir minhas corridas
        </Link>
      )}
    </main>
  );
}
