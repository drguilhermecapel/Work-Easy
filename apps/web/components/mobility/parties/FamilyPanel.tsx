import { useState } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { useAuth } from '../../../contexts/AuthContext';
import { formatCents } from '../../../lib/money';
import { formatDateBR, todayInSaoPaulo } from '../../../lib/timezone';
import { useAsync } from '../../../lib/useAsync';
import { centsToInput, parseReaisToCents } from '../../../services/proFormat';
import { parties, type AccountMember, type PartyAccount, type PayMethod } from '../../../services/rideParties';
import { useAction } from '../safety/state';
import { ConfirmAction, InviteLink, ValidityField, card, field, primary, secondary } from './common';
import { ADHESION_VALIDITY, NO_SITE, SHOWN_ONCE, legStatus, until, useInvitePage, validEmail } from './state';

const METHODS: Record<PayMethod, string> = { pix: 'Pix', card: 'Cartão' };
const money = (cents: number | null | undefined) => (typeof cents === 'number' ? formatCents(cents) : 'Restrito ao pagador');
// Sign-in by e-mail code asks no name: number the unnamed members so the admin can tell them apart.
const nameOf = (member: AccountMember, position: number) => member.name?.trim() || `Participante ${position} (sem nome no perfil)`;

function MethodField({ value, onChange }: { value: PayMethod; onChange: (method: PayMethod) => void }) {
  return (
    <label className="block">
      Forma de pagamento padrão
      <select className={field} value={value} onChange={(e) => onChange(e.target.value as PayMethod)}>
        <option value="pix">{METHODS.pix}</option>
        <option value="card">{METHODS.card}</option>
      </select>
    </label>
  );
}

function CreateFamily({ onChange }: { onChange: () => void }) {
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [method, setMethod] = useState<PayMethod>('pix');
  const action = useAction(onChange);
  const cents = parseReaisToCents(limit);
  return (
    <form
      className={card}
      onSubmit={(event) => {
        event.preventDefault();
        if (!cents) return;
        void action.run('create:' + JSON.stringify([name, cents, method]), async (key) => {
          await parties.createFamily(name.trim(), cents, method, key);
          return 'Grupo criado. Convide os participantes pelo e-mail da conta de cada um.';
        });
      }}
    >
      <h3 className="font-semibold">Criar grupo familiar</h3>
      <p className="text-sm">
        Você administra o grupo e paga as corridas que os participantes fizerem com o perfil do grupo, até o limite
        mensal. Cada pessoa entra por convite e pode continuar usando o perfil pessoal.
      </p>
      <label className="block">
        Nome do grupo
        <input className={field} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        Limite mensal do grupo (R$)
        <input
          className={field}
          required
          inputMode="decimal"
          placeholder="300,00"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
      </label>
      <MethodField value={method} onChange={setMethod} />
      <button type="submit" className={primary} disabled={action.busy || !name.trim() || !cents}>
        Criar grupo familiar
      </button>
      {action.message}
    </form>
  );
}

function Statement({ account }: { account: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => todayInSaoPaulo().slice(0, 7));
  const result = useAsync(
    () => (open && month ? parties.statement(account, month + '-01') : Promise.resolve(null)),
    JSON.stringify([account, month, open]),
  );
  const statement = result.data;
  if (!open)
    return (
      <button type="button" className={secondary} onClick={() => setOpen(true)}>
        Ver extrato do mês
      </button>
    );
  return (
    <section aria-label="Extrato do grupo" className="space-y-2">
      <h4 className="font-semibold">Extrato</h4>
      <label className="block max-w-xs">
        Mês
        <input className={field} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>
      {result.loading && <p role="status">Consultando extrato…</p>}
      <ErrorAlert error={result.error} />
      {statement && (
        <>
          {typeof statement.total_cents === 'number' && (
            <p>
              Total autorizado no mês: <strong>{formatCents(statement.total_cents)}</strong>
              {typeof statement.monthly_limit_cents === 'number' && ` de ${formatCents(statement.monthly_limit_cents)}`}
            </p>
          )}
          {statement.rows.length ? (
            <ul className="space-y-1 text-sm">
              {statement.rows.map((row) => (
                <li key={row.leg_id} className="border-l-2 border-primary/30 pl-3">
                  {formatDateBR(row.date)}
                  {row.member_name && ` · ${row.member_name}`} · {legStatus(row.status)} · {money(row.fare_cents)}
                  {!row.counted && ' · fora do total'}
                  {!!row.received_cents && ` · pago ${formatCents(row.received_cents)}`}
                  {!!row.refunded_cents && ` · reembolsado ${formatCents(row.refunded_cents)}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">Nenhuma corrida do grupo neste mês.</p>
          )}
          <p className="text-sm text-gray-600">
            Corridas canceladas não entram no total. Um reembolso não devolve saldo ao limite do mês. O extrato não
            mostra endereços.
          </p>
        </>
      )}
    </section>
  );
}

function MemberRow({
  account,
  member,
  position,
  onChange,
}: {
  account: string;
  member: AccountMember;
  position: number;
  onChange: () => void;
}) {
  const [limit, setLimit] = useState(() =>
    typeof member.member_limit_cents === 'number' ? centsToInput(member.member_limit_cents) : '',
  );
  const action = useAction(onChange);
  const cents = limit.trim() ? parseReaisToCents(limit) : null;
  const invalid = Boolean(limit.trim()) && cents === null;
  const name = nameOf(member, position);
  if (member.status === 'removed')
    return <li className="text-sm text-gray-600">{name} · removido · as cobranças anteriores continuam no extrato</li>;
  return (
    <li className="space-y-2 border-l-2 border-primary/30 pl-3">
      <p className="font-medium">
        {name} ·{' '}
        {typeof member.member_limit_cents === 'number'
          ? `até ${formatCents(member.member_limit_cents)} por mês`
          : 'sem limite individual'}
      </p>
      <label className="block max-w-xs">
        Limite mensal de {name} (R$)
        <input
          className={field}
          inputMode="decimal"
          placeholder="Sem limite individual"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className={secondary}
          disabled={action.busy || invalid}
          onClick={() =>
            void action.run('limit', async () => {
              await parties.setMemberLimit(account, member.member_id, cents);
              return 'Limite individual salvo.';
            })
          }
        >
          Salvar limite de {name}
        </button>
        <ConfirmAction
          label={`Remover ${name}`}
          confirmLabel="Confirmar remoção"
          busy={action.busy}
          onConfirm={() =>
            action.run('remove', async (key) => {
              await parties.removeMember(account, member.member_id, key);
              return 'Participante removido. As cobranças anteriores foram mantidas.';
            })
          }
        >
          {name} deixa de pedir corridas pagas pelo grupo. As corridas e cobranças anteriores continuam no extrato e nada
          é apagado.
        </ConfirmAction>
      </div>
      {action.message}
    </li>
  );
}

function AdminFamily({ account, userId, onChange }: { account: PartyAccount; userId: string; onChange: () => void }) {
  const [limit, setLimit] = useState(() =>
    typeof account.monthly_limit_cents === 'number' ? centsToInput(account.monthly_limit_cents) : '',
  );
  const [method, setMethod] = useState<PayMethod>(account.default_method ?? 'pix');
  const [email, setEmail] = useState('');
  const [minutes, setMinutes] = useState(1440);
  const [invite, setInvite] = useState<{ id: string; link: string; expires: string } | null>(null);
  const action = useAction(onChange);
  const page = useInvitePage();
  const cents = parseReaisToCents(limit);
  const others = account.members.filter((member) => member.member_id !== userId);
  const pending = account.invites.filter((item) => item.status === 'pending');
  return (
    <article className={card}>
      <h3 className="font-semibold">{account.name}</h3>
      <p className="text-sm">
        Você administra este grupo e paga as corridas feitas com o perfil do grupo. Você vê preço, recibo e previsão de
        embarque dessas corridas; as corridas pessoais de cada participante não aparecem aqui.
      </p>
      {typeof account.committed_cents === 'number' && typeof account.monthly_limit_cents === 'number' && (
        <p>
          Neste mês: <strong>{formatCents(account.committed_cents)}</strong> usados ou reservados de{' '}
          {formatCents(account.monthly_limit_cents)}.
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (cents === null) return;
          void action.run('account-limit', async () => {
            await parties.setAccountLimit(account.id, cents, method);
            return 'Limite e forma de pagamento salvos.';
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            Limite mensal do grupo (R$)
            <input className={field} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
          <MethodField value={method} onChange={setMethod} />
        </div>
        <button type="submit" className={secondary} disabled={action.busy || cents === null}>
          Salvar limite e pagamento
        </button>
      </form>
      <h4 className="font-semibold">Participantes</h4>
      {others.length ? (
        <ul className="space-y-3">
          {others.map((member, index) => (
            <MemberRow
              key={member.member_id}
              account={account.id}
              member={member}
              position={index + 1}
              onChange={onChange}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">
          Ninguém entrou ainda. Gere um convite abaixo com o e-mail da conta WorkEasy de quem vai participar.
        </p>
      )}
      <h4 className="font-semibold">Convidar participante</h4>
      <label className="block">
        E-mail do participante
        <input className={field} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <ValidityField value={minutes} onChange={setMinutes} options={ADHESION_VALIDITY} />
      <button
        type="button"
        className={primary}
        disabled={action.busy || !validEmail(email)}
        onClick={() =>
          void action.run('invite:' + JSON.stringify([email, minutes]), async (key) => {
            const base = page();
            if (!base) return NO_SITE;
            const issued = await parties.inviteMember(account.id, email.trim(), 'member', minutes, key);
            if (!issued.token) return SHOWN_ONCE;
            setInvite({ id: issued.id, link: base + '#adesao=' + issued.token, expires: issued.expires_at });
            setEmail('');
            return 'Convite de adesão criado. Copie o link e envie para a pessoa.';
          })
        }
      >
        Gerar convite de adesão
      </button>
      {invite && <InviteLink link={invite.link} expires={invite.expires} />}
      {pending.length > 0 && (
        <ul className="space-y-2" aria-label="Convites pendentes">
          {pending.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span>Convite pendente · válido até {until(item.expires_at)}</span>
              <ConfirmAction
                label="Revogar convite"
                confirmLabel="Confirmar revogação"
                busy={action.busy}
                onConfirm={() =>
                  action.run('revoke:' + item.id, async () => {
                    await parties.revokeAccountInvite(item.id);
                    if (invite?.id === item.id) setInvite(null);
                    return 'Convite revogado. O link deixou de valer.';
                  })
                }
              >
                O link deixa de valer. Para convidar a mesma pessoa, gere outro convite.
              </ConfirmAction>
            </li>
          ))}
        </ul>
      )}
      {action.message}
      <Statement account={account.id} />
    </article>
  );
}

function MemberFamily({ account, userId, onChange }: { account: PartyAccount; userId: string; onChange: () => void }) {
  const action = useAction(onChange);
  return (
    <article className={card}>
      <h3 className="font-semibold">{account.name}</h3>
      <p>
        Você participa deste grupo. Ao cotar uma corrida, escolha o perfil do grupo em “Quem viaja e quem paga” para que
        o administrador pague.
        {typeof account.member_limit_cents === 'number' &&
          ` Seu limite mensal é ${formatCents(account.member_limit_cents)}.`}
      </p>
      <p className="text-sm text-gray-600">
        Nessas corridas o administrador vê preço, recibo e previsão de embarque. O embarque, o código de confirmação e a
        ajuda do plantão continuam com você.
      </p>
      <Statement account={account.id} />
      <div>
        <ConfirmAction
          label="Sair do grupo"
          confirmLabel="Confirmar saída"
          busy={action.busy}
          onConfirm={() =>
            action.run('leave', async (key) => {
              await parties.removeMember(account.id, userId, key);
              return 'Você saiu do grupo.';
            })
          }
        >
          Você deixa de pedir corridas pagas pelo grupo. As corridas já feitas continuam no extrato de quem administra.
        </ConfirmAction>
      </div>
      {action.message}
    </article>
  );
}

/** PAR-502: family group by adhesion, with limits, members and the monthly statement. */
export default function FamilyPanel({ accounts, onChange }: { accounts: PartyAccount[]; onChange: () => void }) {
  const userId = useAuth().authUser?.id ?? '';
  const families = accounts.filter((account) => account.kind === 'family');
  const [creating, setCreating] = useState(false);
  const administers = families.some((account) => account.role === 'admin');
  return (
    <section aria-labelledby="grupo-familiar" className="space-y-3">
      <h2 id="grupo-familiar" className="text-lg font-semibold">
        Grupo familiar
      </h2>
      {families.map((account) =>
        account.role === 'admin' ? (
          <AdminFamily key={account.id} account={account} userId={userId} onChange={onChange} />
        ) : (
          <MemberFamily key={account.id} account={account} userId={userId} onChange={onChange} />
        ),
      )}
      {!families.length && (
        <p>
          Você ainda não participa de um grupo familiar. Crie um para pagar as corridas de quem você convidar, com limite
          mensal, ou peça um convite a quem administra o grupo da sua família.
        </p>
      )}
      {!administers &&
        (families.length && !creating ? (
          <button type="button" className={secondary} onClick={() => setCreating(true)}>
            Criar meu próprio grupo
          </button>
        ) : (
          <CreateFamily onChange={onChange} />
        ))}
    </section>
  );
}
