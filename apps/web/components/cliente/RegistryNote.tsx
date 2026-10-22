import React from 'react';
import { BadgeCheck, FileText } from 'lucide-react';
import type { PublicRegistryStatus } from '../../services/discovery';

interface Props {
  status: PublicRegistryStatus | null;
  registryName?: string | null;
  number?: string | null;
  uf?: string | null;
}

/**
 * Professional registry line. "Informado" is what the professional typed;
 * "confirmado pelo WorkEasy" only after an administrator checked it. Nothing for occupations without a registry.
 */
const RegistryNote: React.FC<Props> = ({ status, registryName, number, uf }) => {
  if (!status || status === 'not_required') return null;
  const registry = registryName || 'Registro profissional';
  const code = number ? ` nº ${number}${uf ? `/${uf}` : ''}` : '';
  const confirmed = status === 'confirmed';
  const Icon = confirmed ? BadgeCheck : FileText;
  return (
    <p className={`inline-flex items-start gap-1.5 text-xs ${confirmed ? 'text-green-800' : 'text-gray-600'}`}>
      <Icon size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        {registry}
        {code}: {confirmed ? 'confirmado pelo WorkEasy' : 'informado pelo profissional'}
      </span>
    </p>
  );
};

export default RegistryNote;
