import { useState } from 'react';
import { shortId } from '../../components/admin/format';
import { inputClass, primaryButton } from '../../components/admin/styles';
import { Card, Field } from '../../components/admin/ui';
import { useAction } from '../../components/mobility/safety/state';
import { formatDateBR, lastBookableDayInSaoPaulo, validityEnd } from '../../lib/timezone';
import { partiesAdmin } from '../../services/ridePartiesAdmin';
import type { RideDashboard } from '../../services/rides';
import { attempt, evidenceProblem, EVIDENCE } from './ridePartyFormat';
import { Confirm, VerifyAccount } from './ridePartyUi';

// What the queue does not list: the clearance of a driver for trips with a dependent (the drivers
// come from the operation's own review list) and the check of a fleet outside the queue window,
// the one action that still starts from a code informed in the support ticket.

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const VEHICLES: Record<string, string> = { compact: 'Compacto', sedan: 'Sedã', van: 'Van' };

function DriverClearance({ drivers }: { drivers: RideDashboard['reviews'] }) {
  const action = useAction();
  const approved = drivers.filter((driver) => driver.status === 'approved');
  const [driver, setDriver] = useState('');
  const [evidence, setEvidence] = useState('');
  const [until, setUntil] = useState('');
  const proof = evidence.trim();
  const ready = !!driver && EVIDENCE.test(proof);
  const end = until ? validityEnd(until) : null;
  const who = 'motorista ' + shortId(driver);
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold text-gray-900">Liberar motorista para viagens com dependente</h3>
      <p className="text-sm text-gray-600">
        Só um motorista aprovado e com liberação vigente recebe pedidos que levam um adolescente. Registre a referência
        da checagem feita; retirar a liberação não desfaz viagens já aceitas.
      </p>
      {approved.length === 0 ? (
        <p className="text-sm">Nenhum motorista aprovado neste ambiente.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || !end) return;
            void action.run('clear:' + driver, async () => {
              await partiesAdmin.setDriverClearance(driver, proof, end.toISOString());
              return `Liberação do ${who} registrada até ${formatDateBR(until)}.`;
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="liberacao-motorista" label="Motorista aprovado" hint="O mesmo código curto da revisão de motoristas, em Corridas.">
              <select id="liberacao-motorista" className={inputClass} value={driver} onChange={(event) => setDriver(event.target.value)}>
                <option value="">Selecione</option>
                {approved.map((item) => (
                  <option key={item.driver_id} value={item.driver_id}>
                    Motorista {shortId(item.driver_id)} · {VEHICLES[item.vehicle] ?? item.vehicle}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="liberacao-evidencia" label="Referência da checagem" hint="Só o código do dossiê." error={evidenceProblem(proof)}>
              <input id="liberacao-evidencia" type="text" className={inputClass} maxLength={80} value={evidence} onChange={(event) => setEvidence(event.target.value)} />
            </Field>
            <Field id="liberacao-validade" label="Liberação válida até" hint="Só para liberar. No máximo 12 meses.">
              <input
                id="liberacao-validade"
                type="date"
                className={inputClass}
                min={lastBookableDayInSaoPaulo(new Date(), 0)}
                max={lastBookableDayInSaoPaulo(new Date(), 364)}
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButton} disabled={action.busy || !ready || !end}>
              Registrar liberação
            </button>
            <Confirm
              label="Retirar liberação"
              confirmLabel="Confirmar retirada"
              disabled={!ready}
              busy={action.busy}
              onConfirm={() =>
                attempt(action, 'unclear:' + driver, async () => {
                  await partiesAdmin.setDriverClearance(driver, proof, null);
                  return `Liberação do ${who} retirada. Ele deixa de receber pedidos com dependente.`;
                })
              }
            >
              Retirar a liberação do {who}? Ele deixa de receber novos pedidos com dependente. Viagens já aceitas não
              são desfeitas: cancele-as à parte se for o caso.
            </Confirm>
          </div>
        </form>
      )}
      {action.message}
    </Card>
  );
}

function OtherFleet() {
  const action = useAction();
  const [code, setCode] = useState('');
  const known = UUID.test(code);
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold text-gray-900">Conferência de frota fora da fila</h3>
      <p className="text-sm text-gray-600">
        A fila mostra as contas sem conferência ou com a conferência a encerrar em 30 dias, e as empresas aparecem em
        Programas de voucher. Para renovar antes disso ou retirar a conferência de uma frota, cole o código da conta
        informado no chamado.
      </p>
      <Field id="frota-codigo" label="Código da conta da frota" error={code && !known ? 'Cole o código completo, com 36 caracteres.' : null}>
        <input
          id="frota-codigo"
          type="text"
          className={inputClass + ' font-mono'}
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
        />
      </Field>
      {known && <VerifyAccount key={code} account={code} name={'a conta ' + shortId(code)} withdrawable action={action} />}
      {action.message}
    </Card>
  );
}

/** Operator actions that do not start from the queue. */
export default function RidePartyManual({ drivers }: { drivers: RideDashboard['reviews'] }) {
  return (
    <section aria-labelledby="contas-outras" className="space-y-3">
      <h2 id="contas-outras" className="text-lg font-semibold">
        Outras ações
      </h2>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <DriverClearance drivers={drivers} />
        <OtherFleet />
      </div>
    </section>
  );
}
