import { useId } from 'react';
import { Link } from 'react-router-dom';
import { formatCents } from '../../../lib/money';
import { useAsync } from '../../../lib/useAsync';
import { SELF_FUNDING, parties, type Funding, type FundedProgram, type PayerMandate } from '../../../services/rideParties';
import { field } from './common';

const option = 'flex items-start gap-2';
const detail = 'ml-6 space-y-2 rounded-xl bg-gray-50 p-3 text-sm';

const payer = (mandate: PayerMandate) =>
  mandate.kind === 'family' ? `o grupo familiar ${mandate.payer_label} paga` : `${mandate.payer_label}, acompanhante, paga`;
const excess = (program: FundedProgram) =>
  program.excess_payer === 'rider'
    ? `A empresa paga até ${formatCents(program.ride_value_cents)} por corrida. Se o preço passar disso, a diferença aparece na cotação e fica por sua conta, só depois do seu aceite.`
    : `A empresa paga até ${formatCents(program.ride_value_cents)} por corrida. Acima desse valor a corrida não é cotada por este programa.`;
const bounds = (mandate: PayerMandate) =>
  (typeof mandate.ceiling_cents === 'number' ? ` · até ${formatCents(mandate.ceiling_cents)} por corrida` : '') +
  (typeof mandate.limit_cents === 'number' ? ` · seu limite mensal é ${formatCents(mandate.limit_cents)}` : '');

function ProgramDetail({
  program,
  value,
  onChange,
}: {
  program: FundedProgram;
  value: Extract<Funding, { kind: 'funded' }>;
  onChange: (value: Funding) => void;
}) {
  return (
    <div className={detail}>
      <label className="block">
        Centro de custo
        <select
          className={field}
          value={value.costCenter}
          onChange={(e) => onChange({ ...value, costCenter: e.target.value, grant: null })}
        >
          <option value="">Selecione</option>
          {program.cost_centers.map((center) => (
            <option key={center.id} value={center.id}>
              {center.code} · {center.label}
            </option>
          ))}
        </select>
      </label>
      {program.requires_approval &&
        (program.grants.length ? (
          <label className="block">
            Autorização aprovada
            <select
              className={field}
              value={value.grant ?? ''}
              onChange={(e) => {
                const grant = program.grants.find((g) => g.id === e.target.value);
                onChange({ ...value, grant: grant?.id ?? null, costCenter: grant?.cost_center_id ?? value.costCenter });
              }}
            >
              <option value="">Selecione</option>
              {program.grants.map((grant) => (
                <option key={grant.id} value={grant.id}>
                  {grant.purpose}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>
            Este programa pede aprovação antes da viagem.{' '}
            <Link className="text-primary underline" to="/corridas/empresa">
              Pedir autorização em Empresa
            </Link>
          </p>
        ))}
      <p>{excess(program)} O gestor vê data, centro de custo e valor, sem o trajeto.</p>
    </div>
  );
}

/**
 * "Quem viaja e quem paga" of a standalone quote. Controlled: the form owns the value and sends it
 * through `quoteRideFor`. Renders nothing when the account can only ride and pay for itself.
 */
export default function FundingChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: Funding;
  onChange: (value: Funding) => void;
  disabled?: boolean;
}) {
  // The quote form is mounted again for each signed-in account, so one reading per mount is enough.
  const result = useAsync(async () => ({ overview: await parties.overview(), loaded: Date.now() }), 'funding');
  const name = useId();
  if (result.error && !result.data)
    return <p role="status">Não foi possível consultar seus grupos agora. A cotação segue no seu nome.</p>;
  if (!result.data) return null;
  const { overview, loaded: now } = result.data;
  const mandates = overview.mandates.filter((m) => !m.valid_until || Date.parse(m.valid_until) > now);
  const programs = overview.programs;
  // The database already reads a record past its date as expired.
  const dependents = overview.dependents.filter((d) => d.status === 'verified');
  if (!mandates.length && !programs.length && !dependents.length) return null;
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="font-semibold">Quem viaja e quem paga</legend>
      <label className={option}>
        <input type="radio" name={name} checked={value.kind === 'self'} onChange={() => onChange(SELF_FUNDING)} />
        <span>Eu viajo e eu pago</span>
      </label>
      {mandates.map((mandate) => {
        const chosen = value.kind === 'mandate' && value.mandate === mandate.id;
        return (
          <div key={mandate.id} className="space-y-2">
            <label className={option}>
              <input
                type="radio"
                name={name}
                checked={chosen}
                onChange={() => onChange({ kind: 'mandate', mandate: mandate.id })}
              />
              <span>
                Eu viajo e {payer(mandate)}
                {bounds(mandate)}
              </span>
            </label>
            {chosen && (
              <p className={detail}>
                Quem paga vê o preço, o recibo e a previsão de embarque desta corrida, dentro do limite combinado. O
                preço fica reservado a quem paga.
              </p>
            )}
          </div>
        );
      })}
      {programs.map((program) => {
        const chosen = value.kind === 'funded' && value.program === program.program_id;
        return (
          <div key={program.program_id} className="space-y-2">
            <label className={option}>
              <input
                type="radio"
                name={name}
                checked={chosen}
                onChange={() =>
                  onChange({
                    kind: 'funded',
                    program: program.program_id,
                    costCenter: program.cost_centers.length === 1 ? program.cost_centers[0].id : '',
                    grant: null,
                    approval: program.requires_approval,
                  })
                }
              />
              <span>
                Eu viajo a trabalho · {program.account_name} · {program.label}
              </span>
            </label>
            {chosen && value.kind === 'funded' && <ProgramDetail program={program} value={value} onChange={onChange} />}
          </div>
        );
      })}
      {dependents.map((dependent) => {
        const chosen = value.kind === 'dependent' && value.dependent === dependent.id;
        return (
          <div key={dependent.id} className="space-y-2">
            <label className={option}>
              <input
                type="radio"
                name={name}
                checked={chosen}
                onChange={() => onChange({ kind: 'dependent', dependent: dependent.id, consent: false })}
              />
              <span>
                {dependent.label} viaja ({dependent.age_band} anos) · eu respondo pela viagem e pago
              </span>
            </label>
            {chosen && value.kind === 'dependent' && (
              <div className={detail}>
                <label className={option}>
                  <input
                    type="checkbox"
                    checked={value.consent}
                    onChange={(e) => onChange({ ...value, consent: e.target.checked })}
                  />
                  <span>
                    Sou responsável legal por {dependent.label}, autorizo esta viagem e sei que o embarque só acontece
                    com o código de confirmação informado ao motorista.
                  </span>
                </label>
                <p>
                  Só motoristas liberados pela operação para este tipo de viagem recebem o pedido. Você acompanha o
                  trecho e chama o plantão no próprio trecho, em Corridas.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
