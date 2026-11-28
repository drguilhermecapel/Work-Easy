import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ErrorAlert from '../../ErrorAlert';
import { useAuth } from '../../../contexts/AuthContext';
import { useAsync } from '../../../lib/useAsync';
import { parties, type AccountInviteView, type AccountKind, type AccountRole } from '../../../services/rideParties';
import { useAction } from '../safety/state';
import { ConfirmAction, banner, primary } from './common';
import { until } from './state';

type InviteKind = 'account' | 'companion';

const ROLES: Record<AccountRole, string> = {
  admin: 'administrador',
  member: 'participante',
  operator: 'operador da central',
  approver: 'aprovador',
  manager: 'gestor',
  fleet_driver: 'motorista da frota',
};
const KINDS: Record<AccountKind, { title: string; body: string; done: string; to: string; open: string }> = {
  family: {
    title: 'Convite para o grupo familiar',
    body: 'Ao aceitar, você entra no grupo. Nas corridas feitas com o perfil do grupo, quem administra paga dentro dos limites definidos e vê preço, recibo e previsão de embarque. Suas corridas pessoais continuam só com você.',
    done: 'Adesão registrada. O perfil do grupo já pode ser escolhido ao cotar uma corrida.',
    to: '/corridas/grupos',
    open: 'Abrir grupos e pessoas de confiança',
  },
  organization: {
    title: 'Convite de uma empresa',
    body: 'Ao aceitar, você passa a usar o perfil profissional desta empresa nas viagens a trabalho, no papel indicado. A empresa vê data, centro de custo e valor dessas viagens, sem o trajeto. Suas corridas pessoais não aparecem para a empresa.',
    done: 'Adesão registrada. O perfil profissional aparece ao cotar uma corrida.',
    to: '/corridas/empresa',
    open: 'Abrir a área da empresa',
  },
  fleet: {
    title: 'Convite de uma frota',
    body: 'Ao aceitar, você entra na frota no papel indicado. A frota acompanha os veículos e a situação das corridas feitas com veículo dela, sem trajeto nem dados do passageiro.',
    done: 'Adesão registrada.',
    to: '/corridas/frota',
    open: 'Abrir a área da frota',
  },
};
const COMPANION = {
  title: 'Convite para acompanhar uma pessoa',
  body: 'Ao aceitar, você passa a receber os avisos de corrida que a pessoa escolheu e a consultar o andamento, sem ver o trajeto nem o código de embarque. Ela pode ter pedido que você pague as corridas dela: confirme esse ponto com quem enviou o convite antes de aceitar. Você pode sair quando quiser em Grupos.',
  done: 'Acompanhamento registrado. As pessoas que você acompanha aparecem em Grupos.',
  to: '/corridas/grupos',
  open: 'Abrir grupos e pessoas de confiança',
};

function Answer({
  copy,
  answer,
}: {
  copy: { body: string; done: string; to: string; open: string };
  answer: (accept: boolean) => Promise<unknown>;
}) {
  const [answered, setAnswered] = useState<'accepted' | 'declined' | ''>('');
  const action = useAction();
  const decide = (accept: boolean) =>
    action.run(accept ? 'accept' : 'decline', async () => {
      await answer(accept);
      setAnswered(accept ? 'accepted' : 'declined');
      return accept ? copy.done : 'Convite recusado. Nada mudou na sua conta.';
    });
  return (
    <>
      {!answered && (
        <>
          <p>{copy.body}</p>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className={primary} disabled={action.busy} onClick={() => void decide(true)}>
              Aceitar convite
            </button>
            <ConfirmAction
              label="Recusar convite"
              confirmLabel="Confirmar recusa"
              busy={action.busy}
              onConfirm={() => decide(false)}
            >
              Ao recusar, o convite se encerra. Para participar depois, será preciso um novo convite.
            </ConfirmAction>
          </div>
        </>
      )}
      {action.message}
      {answered === 'accepted' && (
        <Link className="text-primary underline" to={copy.to}>
          {copy.open}
        </Link>
      )}
      {answered === 'declined' && (
        <Link className="text-primary underline" to="/corridas">
          Voltar às corridas
        </Link>
      )}
    </>
  );
}

function AccountAnswer({ token, invite }: { token: string; invite: AccountInviteView }) {
  const copy = KINDS[invite.kind] ?? KINDS.family;
  return (
    <>
      {invite.simulation && (
        <p role="status" className={banner}>
          Ambiente de ensaio. Contas e valores são fictícios.
        </p>
      )}
      <p>
        <strong>{invite.account_name}</strong> convidou você como {ROLES[invite.role] ?? invite.role}. Convite válido até{' '}
        {until(invite.expires_at)}.
      </p>
      <Answer copy={copy} answer={(accept) => parties.joinAccount(token, accept)} />
    </>
  );
}

/**
 * Answer to an adhesion invite (fragment `#adesao=`). The server tells the confirmed recipient
 * which account and role the invite is for. A companion invite has its own answer call and is
 * marked in the link's query (`?tipo=acompanhante`) or by the `kind` prop.
 */
export default function AccountInvite({ token, kind }: { token: string; kind?: InviteKind }) {
  const { authUser } = useAuth();
  const [params] = useSearchParams();
  const companion = kind === 'companion' || (!kind && params.get('tipo') === 'acompanhante');
  const result = useAsync(
    () => (token && !companion ? parties.accountInvite(token) : Promise.resolve(null)),
    JSON.stringify([authUser?.id, token, companion]),
  );
  const invite = result.data;
  const title = companion ? COMPANION.title : invite ? (KINDS[invite.kind] ?? KINDS.family).title : 'Convite de adesão';
  return (
    <main className="mx-auto max-w-lg space-y-4 p-5">
      <h1 className="text-xl font-semibold">{title}</h1>
      {!token ? (
        <p>Convite indisponível. Abra novamente o link recebido, na conta do e-mail convidado.</p>
      ) : companion ? (
        <Answer copy={COMPANION} answer={(accept) => parties.answerCompanion(token, accept)} />
      ) : invite ? (
        <AccountAnswer key={invite.id} token={token} invite={invite} />
      ) : result.loading ? (
        <p role="status">Consultando convite…</p>
      ) : (
        !result.error && (
          <p>
            Convite indisponível para esta conta, encerrado ou expirado. Confira se você entrou com o e-mail que recebeu o
            convite.
          </p>
        )
      )}
      <ErrorAlert error={result.error} />
    </main>
  );
}
