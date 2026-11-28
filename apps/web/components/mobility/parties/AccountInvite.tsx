import { useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorAlert from '../../ErrorAlert';
import { useAuth } from '../../../contexts/AuthContext';
import { formatCents } from '../../../lib/money';
import { useAsync } from '../../../lib/useAsync';
import {
  parties,
  type AccountInviteView,
  type AccountKind,
  type AccountRole,
  type CompanionInviteView,
} from '../../../services/rideParties';
import { useAction } from '../safety/state';
import { ConfirmAction, banner, primary } from './common';
import { NOTICE_NAMES, until } from './state';

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
    body: 'Ao aceitar, você entra na frota no papel indicado. Como motorista da frota, você só recebe ofertas com um veículo cedido pela frota e revisado pela operação, e deixa de receber ofertas como motorista independente enquanto fizer parte dela. A frota acompanha os veículos e a situação das corridas feitas com veículo dela, sem trajeto nem dados do passageiro.',
    done: 'Adesão registrada.',
    to: '/corridas/frota',
    open: 'Abrir a área da frota',
  },
};
const COMPANION = {
  title: 'Convite para acompanhar uma pessoa',
  done: 'Acompanhamento registrado. As pessoas que você acompanha aparecem em Grupos.',
  to: '/corridas/grupos',
  open: 'Abrir grupos e pessoas de confiança',
};

function Answer({
  copy,
  accept = 'Aceitar convite',
  answer,
}: {
  copy: { done: string; to: string; open: string };
  accept?: string;
  answer: (accept: boolean) => Promise<unknown>;
}) {
  const [answered, setAnswered] = useState<'accepted' | 'declined' | ''>('');
  const action = useAction();
  const decide = (yes: boolean) =>
    action.run(yes ? 'accept' : 'decline', async () => {
      await answer(yes);
      setAnswered(yes ? 'accepted' : 'declined');
      return yes ? copy.done : 'Convite recusado. Nada mudou na sua conta.';
    });
  return (
    <>
      {!answered && (
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className={primary} disabled={action.busy} onClick={() => void decide(true)}>
            {accept}
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
  const copy = KINDS[invite.kind];
  return (
    <>
      <p>
        <strong>{invite.account_name}</strong> convidou você como {ROLES[invite.role]}. Convite válido até{' '}
        {until(invite.expires_at)}.
      </p>
      <p>{copy.body}</p>
      <Answer copy={copy} answer={(accept) => parties.joinAccount(token, accept)} />
    </>
  );
}

function CompanionAnswer({ token, invite }: { token: string; invite: CompanionInviteView }) {
  const notices = invite.notices.map((code) => NOTICE_NAMES[code] ?? code).join(', ');
  return (
    <>
      <p>
        <strong>{invite.owner_label}</strong> convidou você para acompanhar as corridas dela. Convite válido até{' '}
        {until(invite.expires_at)}.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>{notices ? `Você recebe estes avisos: ${notices}.` : 'Este convite não inclui avisos de corrida.'}</li>
        <li>Você consulta a situação e a previsão de chegada, sem o trajeto e sem o código de embarque.</li>
        <li>
          {invite.pays
            ? `Você paga as corridas de ${invite.owner_label}${
                typeof invite.ceiling_cents === 'number' ? `, até ${formatCents(invite.ceiling_cents)} por corrida` : ''
              }. Cada cobrança aparece para você em Corridas, com o recibo.`
            : `Você não paga nada: ${invite.owner_label} continua pagando as próprias corridas.`}
        </li>
      </ul>
      <p className="text-sm text-gray-600">Você pode sair quando quiser em Grupos. Corridas já pedidas mantêm o pagador.</p>
      <Answer
        copy={COMPANION}
        accept={invite.pays ? 'Aceitar e pagar as corridas' : 'Aceitar convite'}
        answer={(accept) => parties.answerCompanion(token, accept)}
      />
    </>
  );
}

type Found = { kind: 'account'; invite: AccountInviteView } | { kind: 'companion'; invite: CompanionInviteView } | null;

/**
 * Answer to an invite of the fragment `#adesao=`: an adhesion to a family, company or fleet
 * account, or a companion invite. The server tells the confirmed recipient what the token asks
 * before anything is answered; a token that is neither for this account shows nothing to accept.
 */
export default function AccountInvite({ token }: { token: string }) {
  const { authUser } = useAuth();
  const result = useAsync(async (): Promise<Found> => {
    if (!token) return null;
    const account = await parties.accountInvite(token);
    if (account) return { kind: 'account', invite: account };
    const companion = await parties.companionInvite(token);
    return companion ? { kind: 'companion', invite: companion } : null;
  }, JSON.stringify([authUser?.id, token]));
  const found = result.data;
  const title = !found ? 'Convite de adesão' : found.kind === 'companion' ? COMPANION.title : KINDS[found.invite.kind].title;
  return (
    <main className="mx-auto max-w-lg space-y-4 p-5">
      <h1 className="text-xl font-semibold">{title}</h1>
      {found?.invite.simulation && (
        <p role="status" className={banner}>
          Ambiente de ensaio. Contas e valores são fictícios.
        </p>
      )}
      {found?.kind === 'account' ? (
        <AccountAnswer key={found.invite.id} token={token} invite={found.invite} />
      ) : found?.kind === 'companion' ? (
        <CompanionAnswer key={found.invite.id} token={token} invite={found.invite} />
      ) : !token ? (
        <p>Convite indisponível. Abra novamente o link recebido, na conta do e-mail convidado.</p>
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
