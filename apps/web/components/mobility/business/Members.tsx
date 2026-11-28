import { useState, type FormEvent } from 'react';
import { business, type CostCenter, type OrgAccount, type OrgMember, type OrgRole } from '../../../services/rideBusiness';
import { formatDateTime } from '../../admin/format';
import { Field } from '../../admin/ui';
import Ownership from '../parties/Ownership';
import { useAction } from '../safety/state';
import Confirm from './Confirm';
import InviteLink from './InviteLink';
import {
  ADHESION_VALIDITY,
  ASSIGNABLE,
  card,
  cardTitle,
  field,
  hint,
  NO_INVITE_PAGE,
  primary,
  roleName,
  ROLES,
  secondary,
  SHOWN_ONCE,
  useInvitePage,
} from './shared';

type Action = ReturnType<typeof useAction>;
interface PanelProps {
  account: OrgAccount;
  refresh: () => void;
}
const item = 'space-y-3 border-l-2 border-primary/30 pl-3';

/** Runs a keyed action and tells the confirmation whether it may close. */
async function attempt(action: Action, intent: string, work: (key: string) => Promise<string>) {
  let done = false;
  await action.run(intent, async (key) => {
    const notice = await work(key);
    done = true;
    return notice;
  });
  return done;
}

function MemberRow({ account, member, action }: { account: string; member: OrgMember; action: Action }) {
  const [role, setRole] = useState<OrgRole>(member.role);
  const [group, setGroup] = useState(member.group_tag ?? '');
  const name = member.name ?? 'Pessoa sem nome visível';
  const id = 'membro-' + member.member_id;
  const changed = role !== member.role || group.trim() !== (member.group_tag ?? '');
  return (
    <li className={item}>
      <p className="font-medium">{name}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id + '-papel'} label={'Papel de ' + name}>
          <select id={id + '-papel'} className={field} value={role} onChange={(event) => setRole(event.target.value as OrgRole)}>
            {ASSIGNABLE.map((option) => (
              <option key={option.role} value={option.role}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id + '-grupo'} label={'Grupo de ' + name} hint="Opcional. Usado por programas restritos a um grupo.">
          <input id={id + '-grupo'} className={field} maxLength={40} value={group} onChange={(event) => setGroup(event.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className={secondary}
          disabled={action.busy || !changed}
          onClick={() =>
            void action.run('role:' + member.member_id, async () => {
              await business.setRole(account, member.member_id, role, group.trim() || null);
              return 'Papel de ' + name + ' atualizado: ' + roleName(role) + '.';
            })
          }
        >
          Salvar papel de {name}
        </button>
        <Confirm
          label={'Remover ' + name + ' da empresa'}
          confirmLabel="Confirmar remoção"
          busy={action.busy}
          onConfirm={() =>
            attempt(action, 'remove:' + member.member_id, async (key) => {
              await business.removeMember(account, member.member_id, key);
              return name + ' não faz mais parte desta empresa.';
            })
          }
        >
          Remover {name} desta empresa? Novas viagens pela empresa ficam bloqueadas para esta pessoa. As viagens e
          faturas anteriores continuam registradas.
        </Confirm>
      </div>
    </li>
  );
}

function People({ account, userId, refresh }: PanelProps & { userId: string }) {
  const action = useAction(refresh);
  const admin = account.role === 'admin';
  const members = account.members.filter((member) => member.status === 'active');
  return (
    <section className={card} aria-labelledby="empresa-pessoas">
      <h2 id="empresa-pessoas" className={cardTitle}>
        Pessoas e papéis
      </h2>
      <p className={hint}>
        Cada pessoa tem um papel: {ROLES.map((option) => option.name.toLowerCase() + ' ' + option.does).join('; ')}.
      </p>
      <ul className="space-y-5">
        {members.map((member) =>
          admin && member.member_id !== userId && member.role !== 'admin' ? (
            <MemberRow
              key={[member.member_id, member.role, member.group_tag].join(':')}
              account={account.id}
              member={member}
              action={action}
            />
          ) : (
            <li key={member.member_id} className={item}>
              <p className="font-medium">
                {member.name ?? 'Pessoa sem nome visível'}
                {member.member_id === userId && ' · você'}
              </p>
              <p className={hint}>
                {roleName(member.role)}
                {member.group_tag && ' · grupo ' + member.group_tag}
              </p>
            </li>
          ),
        )}
      </ul>
      {members.length < 2 && <p>Só você está nesta empresa por enquanto. Gere um convite abaixo para a primeira pessoa.</p>}
      {!admin && <p className={hint}>Só a administração da empresa altera papéis ou remove pessoas.</p>}
      {action.message}
    </section>
  );
}

function Invite({ account, refresh }: PanelProps) {
  const action = useAction(refresh);
  const page = useInvitePage();
  // A manager may only bring in collaborators; the database refuses any other role from them.
  const roles = account.role === 'admin' ? ASSIGNABLE : ASSIGNABLE.filter((option) => option.role === 'member');
  const pending = account.invites.filter((invite) => invite.status === 'pending');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const [minutes, setMinutes] = useState(1440);
  const [issued, setIssued] = useState<{ link: string; until: string } | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    void action.run('invite:' + JSON.stringify([account.id, address.toLowerCase(), role, minutes]), async (key) => {
      setIssued(null);
      if (!page) return NO_INVITE_PAGE;
      const invite = await business.inviteMember(account.id, address, role, minutes, key);
      if (!invite.token) return SHOWN_ONCE + ' O anterior pode ser revogado abaixo.';
      setIssued({ link: page + '#adesao=' + invite.token, until: invite.expires_at });
      setEmail('');
      return 'Convite gerado. Envie o link pelo seu canal de confiança.';
    });
  }
  return (
    <section className={card} aria-labelledby="empresa-convidar">
      <h2 id="empresa-convidar" className={cardTitle}>
        Convidar pessoa
      </h2>
      <p className={hint}>
        O convite só abre na conta WorkEasy com o e-mail informado. O e-mail não fica guardado e o link aparece uma
        única vez.
      </p>
      <form className="space-y-3" onSubmit={submit}>
        <Field id="convite-email" label="E-mail da pessoa">
          <input
            id="convite-email"
            className={field}
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="convite-papel" label="Papel na empresa">
            <select id="convite-papel" className={field} value={role} onChange={(event) => setRole(event.target.value as OrgRole)}>
              {roles.map((option) => (
                <option key={option.role} value={option.role}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="convite-validade" label="Validade do convite">
            <select id="convite-validade" className={field} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
              {ADHESION_VALIDITY.map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="submit" className={primary} disabled={action.busy || !email.includes('@')}>
          Gerar convite
        </button>
      </form>
      {issued && (
        <InviteLink
          id="convite-link"
          link={issued.link}
          note={'Válido até ' + formatDateTime(issued.until) + ' (São Paulo). Depois disso, gere outro convite.'}
        />
      )}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Convites aguardando resposta</h3>
          <ul className="space-y-3">
            {pending.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {roleName(invite.role)} · válido até {formatDateTime(invite.expires_at)} (São Paulo)
                </span>
                <Confirm
                  label="Revogar convite"
                  confirmLabel="Confirmar revogação"
                  busy={action.busy}
                  onConfirm={() =>
                    attempt(action, 'revoke:' + invite.id, async () => {
                      const revoked = await business.revokeInvite(invite.id);
                      if (issued) setIssued(null);
                      return revoked ? 'Convite revogado. O link deixou de funcionar.' : 'Este convite já não estava pendente.';
                    })
                  }
                >
                  Revogar este convite? O link deixa de funcionar e a pessoa precisará de um novo convite.
                </Confirm>
              </li>
            ))}
          </ul>
        </div>
      )}
      {action.message}
    </section>
  );
}

function CostCenters({ account, refresh }: PanelProps) {
  const action = useAction(refresh);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const centers = account.cost_centers ?? [];
  const toggle = (center: CostCenter) =>
    void action.run('center:' + center.id + ':' + !center.active, async () => {
      await business.saveCostCenter(account.id, center.code, center.label, !center.active);
      return center.active
        ? 'Centro de custo ' + center.code + ' desativado. Ele continua nas faturas anteriores.'
        : 'Centro de custo ' + center.code + ' reativado.';
    });
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = { code: code.trim().toUpperCase(), label: label.trim() };
    void action.run('center:' + JSON.stringify(next), async () => {
      await business.saveCostCenter(account.id, next.code, next.label, true);
      setCode('');
      setLabel('');
      return 'Centro de custo ' + next.code + ' salvo.';
    });
  }
  return (
    <section className={card} aria-labelledby="empresa-centros">
      <h2 id="empresa-centros" className={cardTitle}>
        Centros de custo
      </h2>
      <p className={hint}>Toda viagem pela empresa é lançada em um centro de custo, que aparece no relatório e na fatura.</p>
      {centers.length ? (
        <ul className="space-y-2">
          {centers.map((center) => (
            <li key={center.id} className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <strong>{center.code}</strong> · {center.label} · {center.active ? 'Ativo' : 'Inativo'}
              </span>
              <button type="button" className={secondary} disabled={action.busy} onClick={() => toggle(center)}>
                {center.active ? 'Desativar ' + center.code : 'Reativar ' + center.code}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhum centro de custo. Crie o primeiro para liberar viagens pela empresa.</p>
      )}
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="centro-codigo"
            label="Código"
            hint="Letras, números, ponto, hífen ou sublinhado, até 24 caracteres. O código é salvo em maiúsculas; salvar um código existente atualiza o nome."
          >
            <input
              id="centro-codigo"
              className={field}
              required
              maxLength={24}
              pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,23}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field id="centro-nome" label="Nome do centro de custo">
            <input id="centro-nome" className={field} required maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} />
          </Field>
        </div>
        <button type="submit" className={primary} disabled={action.busy || !code.trim() || !label.trim()}>
          Salvar centro de custo
        </button>
      </form>
      {action.message}
    </section>
  );
}

/**
 * People of an organization. Admins change roles, remove people and keep the cost centers; managers
 * see the list and may invite collaborators. The database checks the role again on every call.
 */
export default function Members({ account, userId, refresh }: PanelProps & { userId: string }) {
  return (
    <>
      <People account={account} userId={userId} refresh={refresh} />
      <Invite account={account} refresh={refresh} />
      {account.role === 'admin' && <CostCenters account={account} refresh={refresh} />}
      <Ownership account={account} userId={userId} onChange={refresh} />
    </>
  );
}
