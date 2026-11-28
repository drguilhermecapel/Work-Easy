import { useState, type FormEvent } from 'react';
import { business, type OrgAccount } from '../../../services/rideBusiness';
import type { RideLegInput } from '../../../services/rides';
import { formatDateTime } from '../../admin/format';
import { Field } from '../../admin/ui';
import { useAction } from '../safety/state';
import Confirm from './Confirm';
import InviteLink from './InviteLink';
import { card, cardTitle, field, hint, INVITE_MINUTES, NO_INVITE_PAGE, primary, SHOWN_ONCE, toInstant, useInvitePage } from './shared';

const DAYS_AHEAD = 30;

/**
 * Travel desk: an operator schedules a company-funded trip for a guest. The guest must hold a
 * WorkEasy account with the invited e-mail and accepts in their own session, where the ride is created.
 */
export default function GuestDesk({
  account,
  areas,
  refresh,
}: {
  account: OrgAccount;
  areas: string[];
  refresh: () => void;
}) {
  const action = useAction(refresh);
  const page = useInvitePage();
  // A guest belongs to no group, so the desk only offers programs open to anyone.
  const programs = (account.programs ?? []).filter((program) => program.enabled && !program.group_tag);
  const centers = (account.cost_centers ?? []).filter((center) => center.active);
  const [email, setEmail] = useState('');
  const [program, setProgram] = useState('');
  const [center, setCenter] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [departure, setDeparture] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [problem, setProblem] = useState('');
  const [issued, setIssued] = useState<{ id: string; link: string; until: string } | null>(null);
  const places = areas.map((area) => (
    <option key={area} value={area}>
      {area}
    </option>
  ));
  function submit(event: FormEvent) {
    event.preventDefault();
    const pickup = scheduled ? toInstant(departure) : null;
    const now = Date.now();
    if (origin === destination) {
      setProblem('Escolha pontos diferentes para a origem e o destino.');
      return;
    }
    if (scheduled && (!pickup || Date.parse(pickup) <= now || Date.parse(pickup) > now + DAYS_AHEAD * 86_400_000)) {
      setProblem('Escolha uma data nos próximos 30 dias, no horário de São Paulo.');
      return;
    }
    setProblem('');
    const leg: RideLegInput = { origin, destination, payer: 'passenger' };
    if (pickup) leg.pickup_at = pickup;
    const address = email.trim();
    const legs = [leg];
    const intent = JSON.stringify([account.id, program, center, address.toLowerCase(), legs, minutes]);
    void action.run('guest:' + intent, async (key) => {
      setIssued(null);
      if (!page) return NO_INVITE_PAGE;
      const invite = await business.inviteGuest(account.id, program, center, address, legs, pickup, minutes, key);
      if (!invite.token) return SHOWN_ONCE;
      setIssued({ id: invite.id, link: page + '#viagem=' + invite.token, until: invite.expires_at });
      setEmail('');
      return 'Convite de viagem gerado. Envie o link ao convidado pelo seu canal de confiança.';
    });
  }
  return (
    <section className={card} aria-labelledby="empresa-central">
      <h2 id="empresa-central" className={cardTitle}>
        Central de viagens para convidados
      </h2>
      <p className={hint}>
        Agende uma viagem paga pela empresa para uma pessoa de fora. O convidado entra na WorkEasy com o e-mail
        informado, lê a empresa, as áreas e o horário e aceita o convite: a viagem é criada na conta dele e só ele
        acompanha o embarque. O convidado nunca paga diferença: se a tarifa passar do valor do voucher, o aceite é
        recusado e a central precisa escolher outro programa.
      </p>
      {!programs.length ? (
        <p>
          Nenhum programa de voucher ativo e aberto a todos. Sem um programa assim, a central não consegue pagar a viagem
          do convidado.
        </p>
      ) : !centers.length ? (
        <p>Falta um centro de custo ativo. Peça à administração da empresa para criar um.</p>
      ) : !areas.length ? (
        <p>Nenhuma área atendida neste ambiente no momento.</p>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field id="convidado-email" label="E-mail do convidado">
            <input
              id="convidado-email"
              className={field}
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="convidado-programa" label="Programa que paga a viagem">
              <select
                id="convidado-programa"
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
            <Field id="convidado-centro" label="Centro de custo da viagem">
              <select
                id="convidado-centro"
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
            <Field id="convidado-origem" label="Ponto de origem">
              <select
                id="convidado-origem"
                className={field}
                required
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
              >
                <option value="">Selecione</option>
                {places}
              </select>
            </Field>
            <Field id="convidado-destino" label="Ponto de destino">
              <select
                id="convidado-destino"
                className={field}
                required
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                <option value="">Selecione</option>
                {places}
              </select>
            </Field>
            <Field id="convidado-saida" label="Saída">
              <select
                id="convidado-saida"
                className={field}
                value={scheduled ? 'scheduled' : 'now'}
                onChange={(event) => setScheduled(event.target.value === 'scheduled')}
              >
                <option value="now">Quando o convidado aceitar</option>
                <option value="scheduled">Agendar</option>
              </select>
            </Field>
            {scheduled && (
              <Field id="convidado-hora" label="Data e hora da saída (São Paulo)">
                <input
                  id="convidado-hora"
                  className={field}
                  type="datetime-local"
                  required
                  value={departure}
                  onChange={(event) => setDeparture(event.target.value)}
                />
              </Field>
            )}
            <Field id="convidado-validade" label="Validade do convite">
              <select
                id="convidado-validade"
                className={field}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              >
                {INVITE_MINUTES.map((value) => (
                  <option key={value} value={value}>
                    {value} minutos
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-red-700">
              {problem}
            </p>
          )}
          <button type="submit" className={primary} disabled={action.busy || !email.includes('@')}>
            Gerar convite de viagem
          </button>
        </form>
      )}
      {issued && (
        <>
          <InviteLink
            id="convidado-link"
            link={issued.link}
            note={
              'Válido até ' +
              formatDateTime(issued.until) +
              ' (São Paulo). O PIN de embarque e o acompanhamento da viagem ficam só com o convidado.'
            }
          />
          <Confirm
            label="Revogar este convite"
            confirmLabel="Confirmar revogação"
            busy={action.busy}
            onConfirm={async () => {
              let done = false;
              await action.run('revoke:' + issued.id, async () => {
                const revoked = await business.revokeGuestInvite(issued.id);
                setIssued(null);
                done = true;
                return revoked
                  ? 'Convite revogado. O link deixou de funcionar e o voucher não foi usado.'
                  : 'Este convite já tinha sido respondido ou encerrado.';
              });
              return done;
            }}
          >
            Revogar o convite desta viagem? O link deixa de funcionar. Para o convidado viajar, será preciso gerar outro.
          </Confirm>
        </>
      )}
      {action.message}
    </section>
  );
}
