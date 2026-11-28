import { useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorAlert from '../../ErrorAlert';
import { formatDateBR } from '../../../lib/timezone';
import { parties, type AgeBand, type Dependent, type PartyAccount } from '../../../services/rideParties';
import { label as alertName, useAction, useSafetyPoll } from '../safety/state';
import { ConfirmAction, banner, card, field, primary, secondary } from './common';
import { legStatus, until } from './state';

const BANDS: Record<AgeBand, string> = { '13-15': '13 a 15 anos', '16-17': '16 ou 17 anos' };
const BASES: [code: string, label: string][] = [
  ['parental_authority', 'Mãe ou pai (poder familiar)'],
  ['guardianship', 'Guarda ou tutela judicial'],
];
const situation = (dependent: Dependent) =>
  ({
    pending: 'Em conferência pela operação. A viagem só pode ser cotada depois da conferência.',
    verified:
      'Conferido pela operação' + (dependent.valid_until ? ` · vale até ${formatDateBR(dependent.valid_until)}` : ''),
    rejected: 'Cadastro não aceito pela operação.',
    expired: 'Cadastro vencido. Registre de novo para renovar a conferência.',
  })[dependent.status] ?? dependent.status;

function WatchPanel({ leg }: { leg: string }) {
  const result = useSafetyPoll(() => parties.guardianWatch(leg), leg);
  const action = useAction(result.reload);
  const [protocol, setProtocol] = useState('');
  const watch = result.data;
  return (
    <div className="space-y-2 rounded-xl bg-gray-50 p-3">
      {watch ? (
        <>
          {watch.simulation && <p className={banner}>Ambiente de ensaio. Dados fictícios.</p>}
          <p aria-live="polite">
            {legStatus(watch.status)}
            {watch.location && ` · último sinal de localização ${until(watch.location.at)}`}
          </p>
          {watch.alerts.length ? (
            <ul className="space-y-1" aria-label="Alertas deste trecho">
              {watch.alerts.map((alert) => (
                <li key={alert.kind + alert.at} className="rounded-xl bg-amber-50 p-2 text-amber-900">
                  {alertName(alert.kind)} · {until(alert.at)}
                  {alert.escalated_protocol && ` · plantão acionado, protocolo ${alert.escalated_protocol}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">Nenhum alerta de desvio ou de sinal ausente neste trecho.</p>
          )}
        </>
      ) : (
        result.loading && <p role="status">Consultando trecho…</p>
      )}
      <ErrorAlert error={result.error} />
      {protocol ? (
        <p role="status">Plantão acionado. Protocolo {protocol}. Acompanhe a resposta no trecho, em Corridas.</p>
      ) : (
        <>
          <button
            type="button"
            className={primary}
            disabled={action.busy}
            onClick={() =>
              void action.run('escalate', async (key) => {
                setProtocol(await parties.guardianEscalate(leg, key));
                return 'Alerta enviado ao plantão.';
              })
            }
          >
            Chamar o plantão para este trecho
          </button>
          <p className="text-sm text-gray-600">
            O plantão recebe o pedido como emergência e abre um protocolo. O discador de emergência fica no trecho, em
            Corridas.
          </p>
        </>
      )}
      {action.message}
    </div>
  );
}

/** Guardian's follow-up of a leg that carries a dependent: situation, deviation alerts and human escalation. */
export function GuardianWatch({ leg, label }: { leg: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const who = label ? ` de ${label}` : ' do dependente';
  return (
    <section aria-label={`Acompanhamento da viagem${who}`} className="space-y-2">
      <button type="button" className={secondary} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Fechar acompanhamento' : `Acompanhar a viagem${who}`}
      </button>
      {open && <WatchPanel leg={leg} />}
    </section>
  );
}

/** The guardian removes the dependent's record whenever no trip with them is under way. */
function Withdraw({ dependent, onChange }: { dependent: Dependent; onChange: () => void }) {
  const action = useAction(onChange);
  return (
    <div>
      <ConfirmAction
        label={`Retirar o cadastro de ${dependent.label}`}
        confirmLabel="Confirmar retirada do cadastro"
        busy={action.busy}
        onConfirm={() =>
          action.run('withdraw:' + dependent.id, async () => {
            await parties.withdrawDependent(dependent.id);
            return 'Cadastro retirado. O nome, a faixa etária e as viagens ligadas ao dependente deixam de ficar guardados.';
          })
        }
      >
        O cadastro de {dependent.label} e as ligações com cotações e viagens são apagados agora. Para uma nova viagem, será
        preciso cadastrar de novo e esperar a conferência da operação.
      </ConfirmAction>
      {action.message}
    </div>
  );
}

function Register({ accounts, onChange }: { accounts: PartyAccount[]; onChange: () => void }) {
  const [account, setAccount] = useState(accounts[0]?.id ?? '');
  const [name, setName] = useState('');
  const [band, setBand] = useState<AgeBand>('13-15');
  const [basis, setBasis] = useState(BASES[0][0]);
  const action = useAction(onChange);
  return (
    <form
      className={card}
      onSubmit={(event) => {
        event.preventDefault();
        void action.run('register:' + JSON.stringify([account, name, band, basis]), async (key) => {
          await parties.registerDependent(account, name.trim(), band, basis, key);
          setName('');
          return 'Cadastro enviado. A operação confere o vínculo antes de liberar viagens.';
        });
      }}
    >
      <h3 className="font-semibold">Cadastrar dependente</h3>
      <p className="text-sm">
        O adolescente não tem conta: a viagem é pedida e paga por você, que responde por ela. A operação confere o
        vínculo e a idade antes de liberar viagens. Documento e data de nascimento não ficam guardados no cadastro.
      </p>
      {accounts.length > 1 && (
        <label className="block">
          Grupo familiar
          <select className={field} value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        Nome ou apelido do dependente
        <input className={field} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        Faixa etária
        <select className={field} value={band} onChange={(e) => setBand(e.target.value as AgeBand)}>
          {Object.entries(BANDS).map(([code, text]) => (
            <option key={code} value={code}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Vínculo com o dependente
        <select className={field} value={basis} onChange={(e) => setBasis(e.target.value)}>
          {BASES.map(([code, text]) => (
            <option key={code} value={code}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={primary} disabled={action.busy || !name.trim() || !account}>
        Enviar para conferência
      </button>
      {action.message}
    </form>
  );
}

/** PAR-504: dependents of a family group, their review status and the guardian's watch over a trip. */
export default function DependentPanel({
  accounts,
  dependents,
  onChange,
}: {
  accounts: PartyAccount[];
  dependents: Dependent[];
  onChange: () => void;
}) {
  // DD116: only the holder of the family registers a dependent and acts as guardian.
  const families = accounts.filter((a) => a.kind === 'family' && a.owner);
  return (
    <section aria-labelledby="dependentes" className="space-y-3">
      <h2 id="dependentes" className="text-lg font-semibold">
        Adolescente com responsável
      </h2>
      <p>
        Viagens de adolescentes de 13 a 17 anos dependem da praça e da faixa etária, de motorista liberado pela operação
        e do código de confirmação no embarque.
      </p>
      {dependents.map((dependent) => {
        const active = dependent.legs.filter((leg) => !['completed', 'cancelled'].includes(leg.status));
        return (
          <article key={dependent.id} className={card}>
            <h3 className="font-semibold">
              {dependent.label} · {BANDS[dependent.age_band] ?? dependent.age_band}
            </h3>
            <p>{situation(dependent)}</p>
            {dependent.status === 'verified' && !active.length && (
              <p className="text-sm">
                Para pedir uma viagem,{' '}
                <Link className="text-primary underline" to="/corridas">
                  abra Corridas
                </Link>{' '}
                e escolha {dependent.label} em “Quem viaja e quem paga”. O código de embarque é gerado no trecho:
                entregue-o só a {dependent.label}.
              </p>
            )}
            {active.map((leg) => (
              <div key={leg.leg_id} className="space-y-2 border-l-2 border-primary/30 pl-3">
                <p>
                  {legStatus(leg.status)}
                  {leg.pickup_at && ` · saída ${until(leg.pickup_at)}`}
                </p>
                <GuardianWatch leg={leg.leg_id} label={dependent.label} />
              </div>
            ))}
            {!active.length && <Withdraw dependent={dependent} onChange={onChange} />}
          </article>
        );
      })}
      {!dependents.length && <p className="text-sm text-gray-600">Nenhum dependente cadastrado.</p>}
      {families.length ? (
        <Register accounts={families} onChange={onChange} />
      ) : (
        <p className="text-sm text-gray-600">
          Para cadastrar um dependente, crie antes um grupo familiar nesta página: o cadastro fica ligado ao grupo de
          que você é titular, e só quem é titular do grupo pede e acompanha as viagens do dependente.
        </p>
      )}
    </section>
  );
}
