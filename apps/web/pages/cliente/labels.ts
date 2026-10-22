import type { ProposalStatus, RequestStatus } from '../../services/types';
import type { BookingStatus } from '../../services/bookings';
import type { PaymentMethod, PaymentStatus } from '../../services/payments';
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

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: 'Aguardando o profissional',
  accepted: 'Aceito',
  paid: 'Pago',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  released: 'Liberado',
  canceled: 'Cancelado',
  disputed: 'Em contestação',
};

export const BOOKING_STATUS_STYLES: Record<BookingStatus, string> = {
  requested: 'bg-amber-100 text-amber-800',
  accepted: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',
  released: 'bg-green-100 text-green-800',
  canceled: 'bg-gray-100 text-gray-600',
  disputed: 'bg-red-100 text-red-800',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Aguardando pagamento',
  confirmed: 'Pagamento confirmado',
  received: 'Pagamento recebido',
  held: 'Pagamento retido',
  released: 'Pagamento repassado',
  refunded: 'Pagamento devolvido',
  failed: 'Pagamento não concluído',
  canceled: 'Cobrança cancelada',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod | 'undefined', string> = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  boleto: 'Boleto',
  undefined: 'A escolher',
};
