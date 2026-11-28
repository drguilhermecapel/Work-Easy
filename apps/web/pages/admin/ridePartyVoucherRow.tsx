import { useState } from 'react';
import { formatDateTime } from '../../components/admin/format';
import { inputClass, primaryButton } from '../../components/admin/styles';
import { Field } from '../../components/admin/ui';
import { formatCents } from '../../lib/money';
import { partiesAdmin, type QueueVoucher } from '../../services/ridePartiesAdmin';
import { attempt, type Action } from './ridePartyFormat';
import { Confirm } from './ridePartyUi';

// A company voucher held on a completed leg (DD124): the benefit cannot be applied, so the fare
// order waits and nothing is charged to the payer. The operation applies it once the release of
// the corridor is open again, or returns it to the program; either decision carries a reference.

const REASONS: Record<QueueVoucher['reason'], string> = {
  release_closed: 'a liberação do benefício neste trajeto está fechada',
  monetization_off: 'a cobrança está desligada neste ambiente ou trajeto',
  benefit_expired: 'a janela de uso do voucher terminou durante a espera',
};

export default function VoucherRow({ item, action }: { item: QueueVoucher; action: Action }) {
  const [reference, setReference] = useState('');
  const ref = reference.trim();
  const id = 'voucher-' + item.leg_id;
  const what = `${item.account_name}, ${item.program_label}, desde ${formatDateTime(item.since)}`;
  return (
    <li className="space-y-3 border-l-2 border-primary/30 pl-3">
      <h3 className="font-semibold text-gray-900">
        {item.account_name} · {item.program_label} · {formatCents(item.cents)}
      </h3>
      <p className="text-sm">
        Pedido do trecho retido desde {formatDateTime(item.since)} (São Paulo): {REASONS[item.reason]}. Nada é cobrado de
        quem viaja enquanto o caso estiver aqui. Janela do voucher: até {formatDateTime(item.expires_at)}.
      </p>
      {!item.ready && (
        <p className="text-sm text-gray-600">Aplicar fica disponível quando a liberação do benefício do trajeto voltar.</p>
      )}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ref || !item.ready) return;
          void action.run('apply:' + item.leg_id, async (key) => {
            const result = await partiesAdmin.resolveVoucherHold(item.leg_id, 'apply', ref, key);
            if (result.payer_choice)
              return `Voucher de ${item.account_name} liberado. Quem viaja escolhe em Corridas como pagar a diferença aceita e usa o voucher.`;
            const rest = result.applied_cents === null ? '' : ` Voucher aplicado: ${formatCents(result.applied_cents)}.`;
            return `Voucher de ${item.account_name} aplicado ao pedido do trecho.${rest} Quem viaja paga só a diferença aceita, se houver.`;
          });
        }}
      >
        <Field id={id + '-ref'} label={'Referência da decisão sobre o voucher de ' + what} hint="Identificador do registro conferido pela operação.">
          <input id={id + '-ref'} type="text" className={inputClass} maxLength={160} value={reference} onChange={(event) => setReference(event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={action.busy || !ref || !item.ready}>
            Aplicar voucher de {what}
          </button>
          <Confirm
            label={'Devolver ao programa o voucher de ' + what}
            confirmLabel="Confirmar devolução"
            disabled={!ref}
            busy={action.busy}
            onConfirm={() =>
              attempt(action, 'return:' + item.leg_id, async (key) => {
                await partiesAdmin.resolveVoucherHold(item.leg_id, 'return', ref, key);
                return `Voucher de ${item.account_name} devolvido ao programa. Quem viaja passa a pagar a tarifa pelo caminho comum.`;
              })
            }
          >
            Devolver o voucher de {what} ao programa? O valor volta ao saldo do programa e quem viaja passa a pagar a tarifa
            do trecho pelo caminho comum.
          </Confirm>
        </div>
      </form>
    </li>
  );
}
