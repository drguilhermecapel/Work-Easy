import { useHref } from 'react-router-dom';
import { features } from '../../../config/features';
import { validityEnd } from '../../../lib/timezone';
import type { AssignmentStatus, FleetBeneficiary, FleetRole } from '../../../services/rideFleets';

// Class names, labels and small helpers shared by the fleet page and its panel (PAR-508).

export const card = 'space-y-4 rounded-2xl border border-gray-200 bg-white p-5';
export const cardTitle = 'text-lg font-semibold text-gray-900';
export const hint = 'text-sm text-gray-600';
export const primary = 'rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
export const secondary =
  'rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 disabled:opacity-50';
export const danger = 'rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-700 disabled:opacity-50';
export const field = 'mt-1 block w-full rounded-xl border border-gray-300 bg-white p-2.5 text-gray-900';
export const banner = 'rounded-xl bg-amber-50 p-3 text-amber-900';

const ROLES: Record<FleetRole, string> = {
  admin: 'Responsável pela frota',
  manager: 'Gestor da frota',
  fleet_driver: 'Motorista da frota',
};
export const roleName = (role: string) => ROLES[role as FleetRole] ?? role;

const ASSIGNMENTS: Record<AssignmentStatus, string> = {
  pending_review: 'Em revisão pela operação',
  approved: 'Cessão aprovada',
  ended: 'Cessão encerrada',
  rejected: 'Cessão recusada pela operação',
};
export const assignmentName = (status: string) => ASSIGNMENTS[status as AssignmentStatus] ?? status;

export const BENEFICIARIES: { value: FleetBeneficiary; name: string }[] = [
  { value: 'driver', name: 'Motorista' },
  { value: 'fleet', name: 'Frota' },
];
export const beneficiaryName = (value: string) => BENEFICIARIES.find((item) => item.value === value)?.name ?? value;

const LEGS: Record<string, string> = {
  requested: 'Aguardando motorista',
  accepted: 'Motorista confirmado',
  arriving: 'A caminho do embarque',
  boarded: 'Em viagem',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  unknown: 'Em conferência pela operação',
};
export const legStatus = (status: string) => LEGS[status] ?? status;

/** Validity of an adhesion invite: the database takes from 5 minutes to 7 days. */
export const ADHESION_VALIDITY = [
  { minutes: 60, name: '1 hora' },
  { minutes: 1440, name: '1 dia' },
  { minutes: 4320, name: '3 dias' },
  { minutes: 10080, name: '7 dias' },
];

/** True when a validity (plain date or instant) is over at `now`. A plain date covers its whole day in São Paulo. */
export const isOver = (value: string, now: number) => {
  const end = validityEnd(value);
  return !!end && end.getTime() <= now;
};

/**
 * Address of the invite page, to which the screen appends `#adesao=<token>` (a fragment is not
 * sent to servers). Null when a hash-routed build has no public address configured: check it
 * before issuing, because the token is answered only once.
 */
export function useInvitePage(): string | null {
  const href = useHref('/corridas/convite');
  const site = features.siteUrl;
  if (import.meta.env.VITE_ROUTER === 'hash' && !site) return null;
  return site ? new URL('corridas/convite', site + '/').href : new URL(href, window.location.href).href;
}
