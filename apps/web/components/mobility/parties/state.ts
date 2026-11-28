import { useHref } from 'react-router-dom';
import { formatDateTime } from '../../admin/format';
import { INVITE_MINUTES, invitePageUrl } from '../../../services/rideParties';

// Labels and small helpers shared by the family, companion and dependent screens.

export const until = (at: string) => formatDateTime(at) + ' (São Paulo)';
export interface Validity {
  minutes: number;
  name: string;
}
/** A ride invite stays open for minutes: the price it carries is only good for that long. */
export const RIDE_VALIDITY: Validity[] = INVITE_MINUTES.map((minutes) => ({ minutes, name: minutes + ' minutos' }));
/** An adhesion or companion invite: the database takes from 5 minutes to 7 days. */
export const ADHESION_VALIDITY: Validity[] = [
  { minutes: 60, name: '1 hora' },
  { minutes: 1440, name: '1 dia' },
  { minutes: 4320, name: '3 dias' },
  { minutes: 10080, name: '7 dias' },
];
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

/** Ride events a companion may be given, as the owner chooses them. */
export const NOTICES: [code: string, label: string][] = [
  ['accepted', 'Motorista confirmado'],
  ['arriving', 'Motorista a caminho'],
  ['boarded', 'Embarque'],
  ['completed', 'Chegada ao destino'],
  ['cancelled', 'Cancelamento'],
];
export const NOTICE_NAMES: Record<string, string> = Object.fromEntries(NOTICES.map(([code, label]) => [code, label.toLowerCase()]));
