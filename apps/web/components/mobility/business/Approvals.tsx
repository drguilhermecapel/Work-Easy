import { useState, type FormEvent } from 'react';
import { business, type OrgAccount, type TripGrant } from '../../../services/rideBusiness';
import { formatDateTime } from '../../admin/format';
import { Field } from '../../admin/ui';
import { useAction } from '../safety/state';
import { card, cardTitle, field, hint, primary, secondary, toInstant } from './shared';

const STATES: Record<TripGrant['status'], string> = {
  requested: 'Aguardando decisão',
  approved: 'Aprovado',
  rejected: 'Recusado',
  used: 'Utilizado',
  expired: 'Expirado',
};

function GrantFacts({ grant, account }: { grant: TripGrant; account: OrgAccount }) {
  const program = account.programs?.find((item) => item.id === grant.program_id);
  const center = account.cost_centers?.find((item) => item.id === grant.cost_center_id);
  return (
    <p className={hint}>
      {program ? program.label : 'Programa da empresa'}
      {center && ' · ' + center.code + ' ' + center.label} · válido de {formatDateTime(grant.valid_from)} a{' '}
      {formatDateTime(grant.valid_until)} (São Paulo)
    </p>
  );
}

function Queue({ account, refresh }: { account: OrgAccount; refresh: () => void }) {
  const action = useAction(refresh);
  const pending = (account.grants ?? []).filter((grant) => grant.status === 'requested' && !grant.guest);
  const decide = (grant: TripGrant, approve: boolean) =>
    void action.run('decide:' + grant.id + ':' + approve, async () => {
      // The database answers the state the request ended in, which may not be the one asked for
      const state = await business.decideGrant(grant.id, approve);
      if (state === 'expired') return 'O período pedido por ' + grant.beneficiary + ' terminou antes da decisão. Nada foi autorizado.';
      if (state === 'used') return 'A autorização de ' + grant.beneficiary + ' já tinha sido aprovada e usada em uma viagem.';
      return state === 'approved'
        ? 'Pedido de ' + grant.beneficiary + ' aprovado. A autorização vale para uma viagem.'
        : 'Pedido de ' + grant.beneficiary + ' recusado.';
    });
  return (
    <section className={card} aria-labelledby="empresa-fila">
      <h2 id="empresa-fila" className={cardTitle}>
        Pedidos aguardando decisão
      </h2>
      {pending.length ? (
        <ul className="space-y-4">
          {pending.map((grant) => (
            <li key={grant.id} className="space-y-2 border-l-2 border-primary/30 pl-3">
              <p className="font-medium">
                {grant.beneficiary} · {grant.purpose}
              </p>
              <GrantFacts grant={grant} account={account} />
              {grant.mine ? (
                <p>Este pedido é seu. Outra pessoa com papel de aprovação precisa decidir.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={primary} disabled={action.busy} onClick={() => decide(grant, true)}>
                    Aprovar pedido de {grant.beneficiary}
                  </button>
                  <button
                    type="button"
                    className={secondary}
                    disabled={action.busy}
                    onClick={() => decide(grant, false)}
                  >
                    Recusar pedido de {grant.beneficiary}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhum pedido aguardando decisão. Novos pedidos aparecem aqui.</p>
      )}
      {action.message}
    </section>
  );
}

function Request({ account, refresh }: { account: OrgAccount; refresh: () => void }) {
  const action = useAction(refresh);
  // The database lists to a collaborator only the programs of their group; the other roles see all of them.
  const programs = (account.programs ?? []).filter((program) => program.enabled && program.requires_approval);
  const centers = (account.cost_centers ?? []).filter((center) => center.active);
  const mine = (account.grants ?? []).filter((grant) => grant.mine && !grant.guest);
  const [program, setProgram] = useState('');
  const [center, setCenter] = useState('');
  const [purpose, setPurpose] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [problem, setProblem] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const start = toInstant(from);
    const end = toInstant(until);
    const day = 86_400_000;
    if (!start || !end || Date.parse(end) <= Date.parse(start) || Date.parse(end) <= Date.now()) {
      setProblem('Informe um período que termine no futuro, com o fim depois do início (horário de São Paulo).');
      return;
    }
    if (Date.parse(end) - Date.parse(start) > 31 * day || Date.parse(end) > Date.now() + 90 * day) {
      setProblem('A autorização vale por até 31 dias e precisa terminar nos próximos 90 dias.');
      return;
    }
    setProblem('');
    const input = [account.id, program, center, purpose.trim(), start, end] as const;
    void action.run('grant:' + JSON.stringify(input), async (key) => {
      await business.requestGrant(...input, key);
      setPurpose('');
      setFrom('');
      setUntil('');
      return 'Pedido enviado. Você verá a decisão aqui, em "Meus pedidos".';
    });
  }
  return (
    <section className={card} aria-labelledby="empresa-pedir">
      <h2 id="empresa-pedir" className={cardTitle}>
        Pedir autorização de viagem
      </h2>
      {!programs.length ? (
        <p>
          Nenhum programa desta empresa exige autorização prévia. Para viajar pela empresa, escolha o perfil
          profissional ao cotar a corrida.
        </p>
      ) : !centers.length ? (
        <p>Falta um centro de custo ativo. Peça à administração da empresa para criar um.</p>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pedido-programa" label="Programa">
              <select
                id="pedido-programa"
                className={field}
                required
                value={program}
                onChange={(event) => setProgram(event.target.value)}
              >
                <option value="">Selecione</option>
                {programs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pedido-centro" label="Centro de custo">
              <select
                id="pedido-centro"
                className={field}
                required
                value={center}
                onChange={(event) => setCenter(event.target.value)}
              >
                <option value="">Selecione</option>
                {centers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="pedido-motivo" label="Motivo da viagem" hint="Até 140 caracteres. Não inclua endereços nem dados pessoais.">
            <input
              id="pedido-motivo"
              className={field}
              required
              maxLength={140}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pedido-inicio" label="Válida a partir de (São Paulo)">
              <input
                id="pedido-inicio"
                className={field}
                type="datetime-local"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field id="pedido-fim" label="Válida até (São Paulo)">
              <input
                id="pedido-fim"
                className={field}
                type="datetime-local"
                required
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </Field>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-red-700">
              {problem}
            </p>
          )}
          <button type="submit" className={primary} disabled={action.busy || !purpose.trim()}>
            Enviar pedido
          </button>
        </form>
      )}
      {mine.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Meus pedidos</h3>
          <ul className="space-y-3">
            {mine.map((grant) => (
              <li key={grant.id} className="border-l-2 border-primary/30 pl-3">
                <p>
                  {STATES[grant.status] ?? grant.status} · {grant.purpose}
                </p>
                <GrantFacts grant={grant} account={account} />
                {grant.status === 'approved' && (
                  <p className={hint}>Use esta autorização ao cotar pelo perfil profissional. Ela vale para uma viagem.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {action.message}
    </section>
  );
}

/** Trip grants: any member asks, an approver decides (never their own request; the database enforces it). */
export default function Approvals({
  account,
  canDecide,
  refresh,
}: {
  account: OrgAccount;
  canDecide: boolean;
  refresh: () => void;
}) {
  return (
    <>
      {canDecide && <Queue account={account} refresh={refresh} />}
      <Request account={account} refresh={refresh} />
    </>
  );
}
