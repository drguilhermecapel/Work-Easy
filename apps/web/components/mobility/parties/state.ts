import { useHref } from 'react-router-dom';
import { formatDateTime } from '../../admin/format';
import { invitePageUrl } from '../../../services/rideParties';

// Labels and small helpers shared by the family, companion and dependent screens.

export const until = (at: string) => formatDateTime(at) + ' (São Paulo)';
export const validEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
export const NO_SITE = 'O endereço dos convites ainda não foi configurado para este aplicativo.';
export const SHOWN_ONCE =
  'Este convite já tinha sido gerado e o link só aparece uma vez. Se você não o guardou, revogue o convite e gere outro.';

/** Builds the address of the invite page for this router, or null when the build has no site to point to. */
export function useInvitePage() {
  const href = useHref('/corridas/convite');
  return () => invitePageUrl(href);
}

const LEG_STATUS: Record<string, string> = {
  requested: 'Aguardando motorista',
  accepted: 'Motorista confirmado',
  arriving: 'Motorista a caminho do embarque',
  boarded: 'Em viagem',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  unknown: 'Em conferência pela operação',
};
export const legStatus = (code: string) => LEG_STATUS[code] ?? code;
