import { useHref } from 'react-router-dom';
import { features } from '../../../config/features';
import { saoPauloDateTime } from '../../../lib/timezone';
import type { OrgRole } from '../../../services/rideBusiness';

export const card = 'space-y-4 rounded-2xl border border-gray-200 bg-white p-5';
export const cardTitle = 'text-lg font-semibold text-gray-900';
export const hint = 'text-sm text-gray-600';
export const primary = 'rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
export const secondary =
  'rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 disabled:opacity-50';
export const danger = 'rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-700 disabled:opacity-50';
export const field = 'block w-full rounded-xl border border-gray-300 bg-white p-2.5 text-gray-900';

export const ROLES: { role: OrgRole; name: string; does: string }[] = [
  { role: 'member', name: 'Colaborador', does: 'viaja pelo perfil profissional' },
  { role: 'operator', name: 'Operador da central', does: 'agenda viagens para convidados' },
  { role: 'approver', name: 'Aprovador', does: 'decide os pedidos de autorização' },
  { role: 'manager', name: 'Gestor', does: 'consulta o relatório e as faturas' },
  { role: 'admin', name: 'Administrador', does: 'convida pessoas e define papéis e centros de custo' },
];
/** Roles an invite or a role change may give; the administrator is who opened the account. */
export const ASSIGNABLE = ROLES.filter((item) => item.role !== 'admin');
export const roleName = (role: string) => ROLES.find((item) => item.role === role)?.name ?? role;

/** Validity of a guest trip invite, in minutes. */
export const INVITE_MINUTES = [5, 15, 30, 60];
/** Validity of an adhesion invite: the database takes from 5 minutes to 7 days. */
export const ADHESION_VALIDITY = [
  { minutes: 60, name: '1 hora' },
  { minutes: 1440, name: '1 dia' },
  { minutes: 4320, name: '3 dias' },
  { minutes: 10080, name: '7 dias' },
];

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "2026-11" or "2026-11-01" → "novembro de 2026". */
export const monthName = (month: string) => {
  const date = new Date(month.slice(0, 7) + '-01T00:00:00Z');
  return Number.isNaN(date.getTime()) ? month : MONTH.format(date);
};

/** Value of a datetime-local field, read as São Paulo wall time → ISO instant; null when unreadable. */
export const toInstant = (value: string): string | null => {
  const [day, time] = value.split('T');
  return saoPauloDateTime(day ?? '', time ?? '')?.toISOString() ?? null;
};

export const NO_INVITE_PAGE = 'O endereço dos convites ainda não foi configurado para este aplicativo.';
export const SHOWN_ONCE =
  'Este convite já tinha sido gerado e o link aparece uma única vez. Se ele se perdeu, gere outro convite.';

/**
 * Address of the invite page, to which the screen appends `#adesao=<token>` or `#viagem=<token>`
 * (a fragment is not sent to servers). Null when a hash-routed build has no public address
 * configured: check it before issuing, because the token is answered only once.
 */
export function useInvitePage(): string | null {
  const href = useHref('/corridas/convite');
  const site = features.siteUrl;
  if (import.meta.env.VITE_ROUTER === 'hash' && !site) return null;
  return site ? new URL('corridas/convite', site + '/').href : new URL(href, window.location.href).href;
}
