import type { ProposalStatus, RequestStatus } from '../../services/types';
import { formatDateBR, validityEnd } from '../../lib/timezone';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  open: 'Aberto',
  matched: 'Profissional escolhido',
  closed: 'Encerrado',
  canceled: 'Cancelado',
};

export const REQUEST_STATUS_STYLES: Record<RequestStatus, string> = {
  open: 'bg-blue-100 text-blue-800',
  matched: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
  canceled: 'bg-gray-100 text-gray-600',
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  sent: 'Recebida',
  accepted: 'Aceita',
  declined: 'Não escolhida',
  withdrawn: 'Retirada pelo profissional',
};

/** Timestamp or plain date → "dd/mm/aaaa" in São Paulo. */
export const formatDate = (value: string): string => formatDateBR(value);

/** A proposal's valid_until (date or timestamp) has passed at `now`. */
export const isExpired = (validUntil: string | null, now: number): boolean => {
  if (validUntil === null) return false;
  const end = validityEnd(validUntil);
  return end !== null && end.getTime() <= now;
};
