import { useAsync } from '../../../lib/useAsync';
import { ownership, type ErasurePlanItem } from '../../../services/rideOwnership';

// DD118: before deleting the profile, the holder of a family, company or fleet reads what happens
// to each one. A failure to read stays silent: the general text of the page already applies.

const KIND: Record<ErasurePlanItem['kind'], string> = { family: 'Grupo familiar', organization: 'Empresa', fleet: 'Frota' };

export default function ErasureGroups({ userId }: { userId: string }) {
  const plan = useAsync(() => ownership.erasurePlan(), 'erasure-plan:' + userId);
  const items = plan.data ?? [];
  if (!items.length) return null;
  return (
    <div role="status" className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-gray-800">
      <p className="font-semibold">Você é titular de:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item.id}>
            {KIND[item.kind]} “{item.name}”:{' '}
            {item.outcome === 'transfer'
              ? `a titularidade passa para ${item.successor_name?.trim() || 'a pessoa da administração que entrou primeiro no grupo'}.`
              : 'a conta será encerrada, porque não há outra pessoa na administração. Para evitar, nomeie alguém para a administração antes de excluir a conta.'}
          </li>
        ))}
      </ul>
    </div>
  );
}
