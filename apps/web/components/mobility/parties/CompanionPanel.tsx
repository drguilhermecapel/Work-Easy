import { useState } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { parties, type Companion } from '../../../services/rideParties';
import { useAction, useSafetyPoll } from '../safety/state';
import { ConfirmAction, InviteLink, ValidityField, banner, card, field, primary, secondary } from './common';
import { NO_SITE, SHOWN_ONCE, legStatus, until, useInvitePage, validEmail } from './state';

const NOTICES: [code: string, label: string][] = [
  ['accepted', 'Motorista confirmado'],
  ['arriving', 'Motorista a caminho'],
  ['boarded', 'Embarque'],
  ['completed', 'Chegada ao destino'],
  ['cancelled', 'Cancelamento'],
];
const noticeNames = (codes: string[]) =>
  NOTICES.filter(([code]) => codes.includes(code))
    .map(([, label]) => label.toLowerCase())
    .join(', ') || 'nenhum aviso';

function NoticeChoices({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="font-medium">{legend}</legend>
      {NOTICES.map(([code, label]) => (
        <label key={code} className="mr-4 inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.includes(code)}
            onChange={(e) => onChange(e.target.checked ? [...value, code] : value.filter((c) => c !== code))}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function OwnCompanion({ companion, onChange }: { companion: Companion; onChange: () => void }) {
  const [notices, setNotices] = useState(companion.notices);
  const [pays, setPays] = useState(companion.pays);
  const action = useAction(onChange);
  return (
    <article className={card}>
      <h3 className="font-semibold">{companion.label}</h3>
      <NoticeChoices legend={`Avisos que ${companion.label} recebe`} value={notices} onChange={setNotices} />
      {companion.pays ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={pays} onChange={(e) => setPays(e.target.checked)} />
          {companion.label} paga minhas corridas
        </label>
      ) : (
        <p className="text-sm text-gray-600">
          Você paga as suas corridas. Para que {companion.label} passe a pagar, retire o acompanhante e envie um novo
          convite com essa opção: a pessoa precisa aceitar.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className={secondary}
          disabled={action.busy}
          onClick={() =>
            void action.run('save', async () => {
              await parties.setCompanion(companion.companion_id, notices, pays);
              return 'Preferências do acompanhante salvas.';
            })
          }
        >
          Salvar avisos de {companion.label}
        </button>
        <ConfirmAction
          label={`Retirar ${companion.label}`}
          confirmLabel="Confirmar retirada"
          busy={action.busy}
          onConfirm={() =>
            action.run('revoke', async () => {
              await parties.revokeCompanion(companion.companion_id);
              return 'Acompanhante retirado. Seu acesso ao plantão continua igual.';
            })
          }
        >
          {companion.label} deixa de receber avisos, de consultar o andamento e de pagar novas corridas. Seu acesso ao
          plantão e aos seus protocolos continua igual.
        </ConfirmAction>
      </div>
      {action.message}
    </article>
  );
}

function Progress({ owner }: { owner: string }) {
  const result = useSafetyPoll(() => parties.companionProgress(owner), owner);
  const progress = result.data;
  return (
    <div aria-live="polite" className="space-y-1 rounded-xl bg-gray-50 p-3">
      {progress ? (
        <>
          {progress.simulation && <p className={banner}>Ambiente de ensaio. Dados fictícios.</p>}
          <p>{legStatus(progress.status)}</p>
          {progress.eta && <p>Previsão de chegada {until(progress.eta)}</p>}
        </>
      ) : (
        <p>{result.loading ? 'Consultando andamento…' : 'Nenhuma corrida em andamento agora.'}</p>
      )}
      <ErrorAlert error={result.error} />
    </div>
  );
}

function Accompanied({ companion, onChange }: { companion: Companion; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const action = useAction(onChange);
  return (
    <article className={card}>
      <h3 className="font-semibold">Você acompanha {companion.label}</h3>
      <p className="text-sm">
        Avisos escolhidos por {companion.label}: {noticeNames(companion.notices)}. Eles chegam em Corridas, em “Avisos de
        embarque”. {companion.pays && `Você paga as corridas de ${companion.label}, dentro do limite combinado.`}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={secondary} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Fechar andamento' : `Ver andamento de ${companion.label}`}
        </button>
        <ConfirmAction
          label="Deixar de acompanhar"
          confirmLabel="Confirmar saída"
          busy={action.busy}
          onConfirm={() =>
            action.run('leave', async () => {
              await parties.revokeCompanion(companion.owner_id);
              return 'Você deixou de acompanhar esta pessoa.';
            })
          }
        >
          Você deixa de receber avisos e de pagar novas corridas de {companion.label}. Cobranças de corridas já pedidas
          continuam valendo.
        </ConfirmAction>
      </div>
      {open && <Progress owner={companion.owner_id} />}
      {action.message}
    </article>
  );
}

function InviteCompanion({ onChange }: { onChange: () => void }) {
  const [email, setEmail] = useState('');
  const [notices, setNotices] = useState(['arriving', 'boarded', 'completed']);
  const [pays, setPays] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [invite, setInvite] = useState<{ link: string; expires: string } | null>(null);
  const action = useAction(onChange);
  const page = useInvitePage();
  return (
    <article className={card}>
      <h3 className="font-semibold">Convidar acompanhante</h3>
      <label className="block">
        E-mail do acompanhante
        <input className={field} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <NoticeChoices legend="Avisos que a pessoa recebe" value={notices} onChange={setNotices} />
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={pays} onChange={(e) => setPays(e.target.checked)} />
        Pedir que esta pessoa pague minhas corridas
      </label>
      <ValidityField value={minutes} onChange={setMinutes} />
      <button
        type="button"
        className={primary}
        disabled={action.busy || !validEmail(email) || (!notices.length && !pays)}
        onClick={() =>
          void action.run('invite:' + JSON.stringify([email, notices, pays, minutes]), async (key) => {
            const base = page();
            if (!base) return NO_SITE;
            const issued = await parties.inviteCompanion(email.trim(), notices, pays, minutes, key);
            if (!issued.token) return SHOWN_ONCE;
            setInvite({ link: base + '?tipo=acompanhante#adesao=' + issued.token, expires: issued.expires_at });
            setEmail('');
            return 'Convite criado. Copie o link e envie para a pessoa.';
          })
        }
      >
        Gerar convite de acompanhante
      </button>
      {invite && <InviteLink link={invite.link} expires={invite.expires} />}
      {action.message}
    </article>
  );
}

/** PAR-503: the person chooses a trusted companion, which notices they get and who pays. */
export default function CompanionPanel({ companions, onChange }: { companions: Companion[]; onChange: () => void }) {
  const mine = companions.filter((c) => c.mine);
  const accompanied = companions.filter((c) => !c.mine);
  return (
    <section aria-labelledby="acompanhante" className="space-y-3">
      <h2 id="acompanhante" className="text-lg font-semibold">
        Acompanhante de confiança
      </h2>
      <p>
        Escolha alguém para receber avisos das suas corridas e, se quiser, pagar por elas. A pessoa vê só a situação e a
        previsão: o trajeto, o código de embarque e as suas conversas com o plantão continuam com você.
      </p>
      {mine.map((companion) => (
        <OwnCompanion key={companion.companion_id} companion={companion} onChange={onChange} />
      ))}
      {!mine.length && <p className="text-sm text-gray-600">Você ainda não tem acompanhante. Gere um convite abaixo.</p>}
      <InviteCompanion onChange={onChange} />
      {accompanied.map((companion) => (
        <Accompanied key={companion.owner_id} companion={companion} onChange={onChange} />
      ))}
    </section>
  );
}
