import { useState } from 'react';
import { formatCents } from '../../../lib/money';
import { redeemVoucher, type VoucherMethod, type VoucherRedemption } from '../../../services/rideBusiness';
import { useAction } from '../safety/state';
import { field, primary } from './shared';

const METHODS: Record<VoucherMethod, string> = { pix: 'Pix', card: 'cartão' };

/**
 * "Usar voucher" of a completed leg funded by a company. A voucher that covers the whole fare is
 * already applied when the leg ends, and opening the leg's payment applies it too; here the payer
 * reads the result or chooses the method of what the voucher does not cover. A personal charge is
 * never prepared while the voucher is unused.
 */
export default function UseVoucher({ legId, onChange }: { legId: string; onChange?: () => void }) {
  const action = useAction(onChange);
  const [method, setMethod] = useState<VoucherMethod>('pix');
  const [result, setResult] = useState<VoucherRedemption | null>(null);
  const id = 'voucher-forma-' + legId;
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 p-3">
      <h4 className="font-semibold">Voucher da empresa</h4>
      {result ? (
        <p role="status">
          Voucher aplicado: {formatCents(result.applied_cents)}.{' '}
          {result.remainder_cents > 0
            ? 'Diferença a seu cargo: ' + formatCents(result.remainder_cents) + ', por ' + METHODS[result.method] +
              '. Pague em "Formas de pagamento do trecho".'
            : 'Nada a pagar por você neste trecho.'}
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            O voucher paga a parte da empresa. Quando ele cobre a tarifa inteira, já é aplicado ao fim do trecho. Se a
            tarifa passar do voucher, a diferença que você aceitou na cotação fica no mesmo pedido, na forma escolhida
            abaixo, e só é cobrada depois que o voucher é usado.
          </p>
          <label htmlFor={id} className="block text-sm font-medium text-gray-700">
            Forma de pagamento da diferença
          </label>
          <select id={id} className={field} value={method} onChange={(event) => setMethod(event.target.value as VoucherMethod)}>
            <option value="pix">Pix</option>
            <option value="card">Cartão</option>
          </select>
          <button
            type="button"
            className={primary}
            disabled={action.busy}
            onClick={() =>
              void action.run('voucher:' + legId + ':' + method, async () => {
                setResult(await redeemVoucher(legId, method));
                return '';
              })
            }
          >
            Usar voucher
          </button>
        </>
      )}
      {action.message}
    </div>
  );
}
