import { useState } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { formatDateTime } from '../../components/admin/format';
import { inputClass, secondaryButton } from '../../components/admin/styles';
import { Card, EmptyState, Field } from '../../components/admin/ui';
import { useAction } from '../../components/mobility/safety/state';
import { formatCents } from '../../lib/money';
import { formatDateBR } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { partiesRegistry, type IssuedGuestInvite } from '../../services/ridePartiesAdmin';
import { attempt, monthName, type Action } from './ridePartyFormat';
import { Confirm } from './ridePartyUi';

// What the operation could not list before (DD125): drivers cleared for trips with a dependent,
// the guest invites the companies issued (with a revocation) and the closed invoices. Each list is
// read only when its button is pressed.

const VEHICLES: Record<string, string> = { compact: 'Compacto', sedan: 'Sedã', van: 'Van' };
const INVITES: Record<IssuedGuestInvite['status'], string> = {
  pending: 'Aguardando resposta',
  accepted: 'Aceito',
  declined: 'Recusado',
  expired: 'Vencido',
  revoked: 'Revogado',
};
const row = 'space-y-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0';

function Clearances() {
  const { data, loading, error } = useAsync(partiesRegistry.clearances, 'liberacoes');
  return (
    <>
      {loading && !data && <p role="status">Consultando liberações…</p>}
      <ErrorAlert error={error} />
      {data && data.length === 0 && <EmptyState>Nenhum motorista liberado para viagens com dependente.</EmptyState>}
      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((item) => (
            <li key={item.driver_id} className={row}>
              <p className="font-semibold">
                {item.driver_label ?? 'Motorista'} · {VEHICLES[item.vehicle] ?? item.vehicle}
              </p>
              <p className="text-sm">
                {item.active ? 'Liberação vigente até ' : 'Liberação encerrada em '}
                {formatDateBR(item.valid_until)} · referência {item.evidence_ref} · registrada em {formatDateTime(item.granted_at)}
                {item.driver_status !== 'approved' && ' · cadastro do motorista fora de aprovação'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Invite({ invite, action }: { invite: IssuedGuestInvite; action: Action }) {
  const [reason, setReason] = useState('');
  const text = reason.trim();
  const id = 'convite-' + invite.id;
  const trip = invite.legs.map((leg) => `${leg.origin} → ${leg.destination}`).join(', ');
  return (
    <li className={row}>
      <p className="font-semibold">
        {invite.account_name} · {INVITES[invite.status]}
      </p>
      <p className="text-sm">
        {trip || 'Itinerário não informado'} · emitido em {formatDateTime(invite.created_at)} · vence em {formatDateTime(invite.expires_at)}
        {invite.scheduled_at ? ' · viagem em ' + formatDateTime(invite.scheduled_at) : ''}
      </p>
      {invite.status === 'pending' && (
        <div className="space-y-2">
          <Field id={id + '-motivo'} label={'Motivo da revogação do convite de ' + invite.account_name} hint="Sem nomes nem dados pessoais. De 4 a 200 caracteres.">
            <input id={id + '-motivo'} type="text" className={inputClass} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Confirm
            label={'Revogar convite de ' + invite.account_name}
            confirmLabel="Confirmar revogação"
            disabled={text.length < 4}
            busy={action.busy}
            onConfirm={() =>
              attempt(action, 'revoke:' + invite.id, async () => {
                await partiesRegistry.revokeGuestInvite(invite.id, text);
                return `Convite de ${invite.account_name} revogado. A autorização do convidado foi encerrada.`;
              })
            }
          >
            O convite deixa de valer e a autorização de viagem ligada a ele é encerrada. A empresa pode emitir outro.
          </Confirm>
        </div>
      )}
    </li>
  );
}

function Invites() {
  const { data, loading, error, reload } = useAsync(partiesRegistry.guestInvites, 'convites-emitidos');
  const action = useAction(reload);
  return (
    <>
      {loading && !data && <p role="status">Consultando convites…</p>}
      <ErrorAlert error={error} />
      {data && data.length === 0 && <EmptyState>Nenhum convite de convidado emitido pelas empresas.</EmptyState>}
      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((invite) => (
            <Invite key={invite.id} invite={invite} action={action} />
          ))}
        </ul>
      )}
      {action.message}
    </>
  );
}

function Invoices() {
  const { data, loading, error } = useAsync(partiesRegistry.closedInvoices, 'faturas-fechadas');
  return (
    <>
      {loading && !data && <p role="status">Consultando faturas…</p>}
      <ErrorAlert error={error} />
      {data && data.length === 0 && <EmptyState>Nenhuma fatura fechada neste ambiente.</EmptyState>}
      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((invoice) => (
            <li key={invoice.id} className={row}>
              <p className="font-semibold">
                {invoice.account_name} · {monthName(invoice.month)}
              </p>
              <p className="text-sm">
                {formatCents(invoice.total_cents)} · {invoice.lines} {invoice.lines === 1 ? 'item' : 'itens'} · fechada em{' '}
                {formatDateTime(invoice.closed_at)}
                {invoice.open_disputes > 0 && ` · ${invoice.open_disputes} contestação em aberto`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const LISTS = [
  { id: 'liberacoes', label: 'Motoristas liberados para dependentes', List: Clearances },
  { id: 'convites', label: 'Convites de convidados', List: Invites },
  { id: 'faturas', label: 'Faturas fechadas', List: Invoices },
];

/** The registries of the accounts console, one at a time. */
export default function RidePartyRegistry() {
  const [open, setOpen] = useState<string | null>(null);
  const chosen = LISTS.find((list) => list.id === open);
  return (
    <section aria-labelledby="contas-registros" className="space-y-3">
      <h2 id="contas-registros" className="text-lg font-semibold">
        Registros
      </h2>
      <p className="text-sm text-gray-600">Consulte o que já foi decidido. As listas mostram só o ambiente desta implantação.</p>
      <div className="flex flex-wrap gap-2">
        {LISTS.map((list) => (
          <button key={list.id} type="button" className={secondaryButton} aria-pressed={open === list.id} onClick={() => setOpen(open === list.id ? null : list.id)}>
            {list.label}
          </button>
        ))}
      </div>
      {chosen && (
        <Card className="space-y-3">
          <h3 className="font-semibold text-gray-900">{chosen.label}</h3>
          <chosen.List />
        </Card>
      )}
    </section>
  );
}
