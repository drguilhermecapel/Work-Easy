import { formatCents } from '../../../lib/money';
import { formatDateBR } from '../../../lib/timezone';
import type { VoucherProgram } from '../../../services/rideBusiness';
import { card, cardTitle, hint } from './shared';

function state(program: VoucherProgram, now: number) {
  if (!program.enabled) return 'Pausado';
  if (program.valid_until && Date.parse(program.valid_until) <= now) return 'Encerrado';
  if (program.valid_from && Date.parse(program.valid_from) > now) return 'Ainda não começou';
  return 'Ativo';
}

function validity(program: VoucherProgram) {
  if (program.valid_from && program.valid_until)
    return formatDateBR(program.valid_from) + ' a ' + formatDateBR(program.valid_until);
  if (program.valid_until) return 'até ' + formatDateBR(program.valid_until);
  if (program.valid_from) return 'a partir de ' + formatDateBR(program.valid_from);
  return 'sem prazo definido';
}

function Budget({ program }: { program: VoucherProgram }) {
  const { budget_cents: budget, committed_cents: committed } = program;
  if (typeof budget !== 'number' || typeof committed !== 'number') return null;
  const available = Math.max(0, budget - committed);
  return (
    <div className="space-y-2">
      <progress
        className="h-2 w-full"
        max={Math.max(budget, 1)}
        value={Math.min(Math.max(committed, 0), budget)}
        aria-label={'Orçamento comprometido de ' + program.label}
      />
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-gray-600">Orçamento</dt>
          <dd className="font-semibold">{formatCents(budget)}</dd>
        </div>
        <div>
          <dt className="text-gray-600">Comprometido</dt>
          <dd className="font-semibold">{formatCents(committed)}</dd>
        </div>
        <div>
          <dt className="text-gray-600">Disponível</dt>
          <dd className="font-semibold">{formatCents(available)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Voucher programs of an organization, read only: the database gives no call to create or change a
 * program from this screen (finance registers them), so the panel shows the rules and the budget.
 */
export default function Programs({ programs, now }: { programs: VoucherProgram[]; now: number }) {
  return (
    <section className={card} aria-labelledby="empresa-programas">
      <h2 id="empresa-programas" className={cardTitle}>
        Programas de voucher
      </h2>
      {programs.length ? (
        <ul className="space-y-5">
          {programs.map((program) => (
            <li key={program.id} className="space-y-3 border-l-2 border-primary/30 pl-3">
              <h3 className="font-semibold">
                {program.label} · {state(program, now)}
              </h3>
              <Budget program={program} />
              <ul className="space-y-1 text-sm">
                <li>Valor por corrida: até {formatCents(program.ride_value_cents)}.</li>
                <li>
                  Limite por colaborador:{' '}
                  {typeof program.member_limit_cents === 'number'
                    ? formatCents(program.member_limit_cents)
                    : 'sem limite individual'}
                  .
                </li>
                <li>Áreas: {program.areas.length ? program.areas.join(', ') : 'todas as áreas atendidas'}.</li>
                <li>Categorias: {program.classes.length ? program.classes.join(', ') : 'todas as categorias'}.</li>
                {program.group_tag && <li>Restrito ao grupo {program.group_tag}.</li>}
                <li>Validade: {validity(program)}.</li>
                <li>
                  {program.excess_payer === 'rider'
                    ? 'Tarifa acima do voucher: a diferença é paga por quem viaja, só depois do aceite da cotação que mostra o valor.'
                    : 'Tarifa acima do voucher: a corrida não é cotada por este programa.'}
                </li>
                <li>
                  {program.requires_approval
                    ? 'Exige autorização de um aprovador antes da viagem.'
                    : 'Não exige autorização prévia.'}
                </li>
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p>Esta empresa ainda não tem programa de voucher. Sem programa, as corridas seguem pelo perfil pessoal.</p>
      )}
      <p className={hint}>
        O comprometido soma as viagens aceitas e não canceladas. Só a parcela de fato estornada volta ao orçamento.
        Programas e orçamentos são cadastrados pelo financeiro WorkEasy: para contratar ou alterar, fale com o plantão.
      </p>
    </section>
  );
}
