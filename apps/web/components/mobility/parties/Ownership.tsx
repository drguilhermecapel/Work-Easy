import { useId, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { formatDateTime } from '../../admin/format';
import { ownership, type OwnedAccount, type OwnedKind } from '../../../services/rideOwnership';
import { useAction } from '../safety/state';
import { ConfirmAction, card, danger, field, secondary } from './common';

// DD118: the holder of a family, company or fleet names other admins and hands the account to
// one of them. The same section explains what deleting the holder's profile does to the account.

const NOUN: Record<OwnedKind, { the: string; it: string; closed: string }> = {
  family: { the: 'o grupo familiar', it: 'o grupo', closed: 'encerrado' },
  organization: { the: 'a empresa', it: 'a empresa', closed: 'encerrada' },
  fleet: { the: 'a frota', it: 'a frota', closed: 'encerrada' },
};
/** Roles the holder may promote to admin, per kind (the database checks the same list). */
const PROMOTABLE: Record<OwnedKind, string[]> = {
  family: ['member'],
  organization: ['member', 'operator', 'approver', 'manager'],
  fleet: ['manager'],
};
const personName = (name: string | null | undefined) => name?.trim() || 'Pessoa sem nome no perfil';

function Handover({ account, onChange }: { account: OwnedAccount; onChange: () => void }) {
  const action = useAction(onChange);
  const legend = useId();
  const candidates = account.owner_candidates ?? [];
  const [chosen, setChosen] = useState('');
  const [open, setOpen] = useState(false);
  const target = candidates.find((candidate) => candidate.member_id === chosen);
  const noun = NOUN[account.kind];
  if (!candidates.length)
    return (
      <p className="text-sm text-gray-600">
        Para transferir a titularidade, primeiro nomeie outra pessoa para a administração.
      </p>
    );
  if (!open)
    return (
      <div>
        <button type="button" className={secondary} onClick={() => setOpen(true)}>
          Transferir titularidade
        </button>
        {action.message}
      </div>
    );
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 p-3">
      <fieldset className="space-y-2" aria-describedby={legend + '-nota'}>
        <legend className="font-semibold">Quem recebe a titularidade</legend>
        {candidates.map((candidate) => (
          <label key={candidate.member_id} className="flex items-center gap-2">
            <input
              type="radio"
              name={legend}
              value={candidate.member_id}
              checked={chosen === candidate.member_id}
              onChange={() => setChosen(candidate.member_id)}
            />
            {personName(candidate.name)} · no grupo desde {formatDateTime(candidate.joined_at)}
          </label>
        ))}
      </fieldset>
      <p id={legend + '-nota'} className="text-sm">
        {target ? personName(target.name) : 'A pessoa escolhida'} passa a ser titular de {noun.the}. Você continua na
        administração, e a nova pessoa titular pode tirar você dela.
        {account.kind === 'family'
          ? ' As próximas corridas do grupo, inclusive as suas, passam a ser pagas por ela, com os mesmos limites; as cotações que ainda aguardam aceite perdem a validade. Se você cadastrou dependentes, retire-os antes: só quem é titular responde por eles.'
          : ' A conferência feita pela operação continua valendo.'}{' '}
        Corridas, cobranças e faturas anteriores não mudam.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={danger}
          disabled={action.busy || !target}
          onClick={() =>
            void action.run('transfer:' + account.id + ':' + chosen, async (key) => {
              await ownership.transfer(account.id, chosen, key);
              setOpen(false);
              return `Titularidade transferida para ${personName(target?.name)}.`;
            })
          }
        >
          Confirmar transferência
        </button>
        <button type="button" className="underline" disabled={action.busy} onClick={() => setOpen(false)}>
          Voltar
        </button>
      </div>
      {action.message}
    </div>
  );
}

function NameAdmin({ account, userId, onChange }: { account: OwnedAccount; userId: string; onChange: () => void }) {
  const action = useAction(onChange);
  const id = useId();
  const eligible = account.members.filter(
    (member) => member.status === 'active' && member.member_id !== userId && PROMOTABLE[account.kind].includes(member.role),
  );
  const [chosen, setChosen] = useState('');
  if (!eligible.length) return null;
  const target = eligible.find((member) => member.member_id === chosen);
  return (
    <div className="space-y-2">
      <label className="block" htmlFor={id}>
        Nomear para a administração
      </label>
      <select id={id} className={field} value={chosen} onChange={(event) => setChosen(event.target.value)}>
        <option value="">Escolha uma pessoa</option>
        {eligible.map((member) => (
          <option key={member.member_id} value={member.member_id}>
            {personName(member.name)}
          </option>
        ))}
      </select>
      <p className="text-sm text-gray-600">
        Quem está na administração convida e remove participantes e muda limites
        {account.kind === 'family' ? ', inclusive o limite do grupo pago por quem é titular' : ''}. Só quem é titular tira
        alguém da administração{account.kind === 'family' ? ' e cadastra dependentes' : ''}.
      </p>
      <button
        type="button"
        className={secondary}
        disabled={action.busy || !target}
        onClick={() =>
          void action.run('admin:' + chosen, async () => {
            await ownership.setAdmin(account.id, chosen, true);
            setChosen('');
            return `${personName(target?.name)} agora faz parte da administração.`;
          })
        }
      >
        Nomear administração
      </button>
      {action.message}
    </div>
  );
}

function StepDown({ account, userId, onChange }: { account: OwnedAccount; userId: string; onChange: () => void }) {
  const action = useAction(onChange);
  return (
    <div>
      <ConfirmAction
        label="Deixar a administração"
        confirmLabel="Confirmar saída da administração"
        busy={action.busy}
        onConfirm={() =>
          action.run('step-down:' + account.id, async () => {
            await ownership.setAdmin(account.id, userId, false);
            return 'Você deixou a administração e continua participando.';
          })
        }
      >
        Você continua participando de {NOUN[account.kind].the}, mas deixa de administrar. Para voltar, peça a quem é
        titular.
      </ConfirmAction>
      {action.message}
    </div>
  );
}

/** Holder section of a family, company or fleet card. Renders nothing for people who do not administer. */
export default function Ownership({
  account,
  userId,
  onChange,
}: {
  account: OwnedAccount;
  userId: string;
  onChange: () => void;
}) {
  const heading = useId();
  const noun = NOUN[account.kind];
  const received = account.transferred;
  if (!account.owner && account.role !== 'admin') return null;
  const successor = account.owner
    ? (account.owner_candidates ?? []).find((candidate) => candidate.member_id === account.successor_id)
    : undefined;
  return (
    <section aria-labelledby={heading} className={card}>
      <h3 id={heading} className="flex items-center gap-2 font-semibold">
        <KeyRound aria-hidden="true" size={18} /> Titularidade
      </h3>
      {received && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          {noun.the[0].toUpperCase() + noun.the.slice(1)} passou para você em {formatDateTime(received.at)} (São Paulo)
          {received.reason === 'erasure'
            ? ', porque a pessoa titular excluiu a conta.'
            : ', por decisão da pessoa titular anterior.'}
        </p>
      )}
      {account.owner ? (
        <>
          <p className="text-sm">
            Você é titular. Se você excluir sua conta,{' '}
            {successor
              ? `a titularidade passa para ${personName(successor.name)}, a pessoa da administração que entrou primeiro no grupo.`
              : `${noun.the} é ${noun.closed}, porque não há outra pessoa na administração.`}
          </p>
          <NameAdmin account={account} userId={userId} onChange={onChange} />
          <Handover account={account} onChange={onChange} />
        </>
      ) : (
        <>
          <p className="text-sm">Você faz parte da administração. Só quem é titular transfere {noun.it}.</p>
          <StepDown account={account} userId={userId} onChange={onChange} />
        </>
      )}
    </section>
  );
}
