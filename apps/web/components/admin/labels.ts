import type { ProviderStatus } from '../../services/types';
import type { AdminPaymentStatus, DataRequestStatus, DocumentStatus, RegistryStatus, StepState } from '../../services/admin';

// Wording of the administration screens. "Confirmado pelo WorkEasy" is a person
// checking the council's public lookup; the app never reads the council back.

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  draft: 'Rascunho',
  pending_review: 'Em análise',
  approved: 'Aprovado',
  suspended: 'Suspenso',
};

export const PROVIDER_STATUS_STYLES: Record<ProviderStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
};

export const REGISTRY_STATUS_LABELS: Record<RegistryStatus, string> = {
  not_required: 'Registro não exigido',
  informed: 'Registro informado',
  confirmed: 'Registro confirmado pelo WorkEasy',
  rejected: 'Registro rejeitado',
};

export const REGISTRY_STATUS_STYLES: Record<RegistryStatus, string> = {
  not_required: 'bg-gray-100 text-gray-600',
  informed: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  submitted: 'Enviado',
  accepted: 'Aceito',
  rejected: 'Rejeitado',
};

export const DOCUMENT_STATUS_STYLES: Record<DocumentStatus, string> = {
  submitted: 'bg-amber-100 text-amber-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

/** State of one document step of a policy (a step may have several documents; see stepStatuses). */
export const STEP_STATE_LABELS: Record<StepState, string> = {
  accepted: 'Aceito',
  submitted: 'Enviado, a revisar',
  rejected: 'Rejeitado',
  missing: 'Faltando',
};

export const STEP_STATE_STYLES: Record<StepState, string> = {
  accepted: 'bg-green-100 text-green-800',
  submitted: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
  missing: 'bg-gray-100 text-gray-700',
};

export const PAYMENT_STATUS_LABELS: Record<AdminPaymentStatus, string> = {
  pending: 'Aguardando',
  confirmed: 'Confirmado',
  received: 'Recebido',
  held: 'Retido',
  released: 'Repassado',
  refunded: 'Devolvido',
  failed: 'Não concluído',
  canceled: 'Cancelado',
};

export const PAYMENT_STATUS_STYLES: Record<AdminPaymentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  received: 'bg-green-100 text-green-800',
  held: 'bg-indigo-100 text-indigo-800',
  released: 'bg-green-100 text-green-800',
  refunded: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-600',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  credit_card: 'Cartão',
  boleto: 'Boleto',
  undefined: 'A escolher',
};

export const DATA_REQUEST_STATUS_LABELS: Record<DataRequestStatus, string> = {
  pending: 'Pendente',
  processing: 'Em andamento',
  completed: 'Concluída',
  failed: 'Falhou',
};

export const DATA_REQUEST_STATUS_STYLES: Record<DataRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export const DATA_REQUEST_KIND_LABELS = { export: 'Cópia dos dados', delete: 'Exclusão da conta' } as const;

/** Statuses of every entity of the metrics view, in plain words. */
export const METRIC_ENTITY_LABELS = {
  requests: 'Pedidos',
  proposals: 'Propostas',
  bookings: 'Atendimentos',
  payments: 'Pagamentos',
  providers: 'Prestadores',
} as const;

export const METRIC_STATUS_LABELS: Record<string, string> = {
  // requests
  open: 'Aberto',
  matched: 'Com profissional',
  closed: 'Encerrado',
  canceled: 'Cancelado',
  // proposals
  sent: 'Enviada',
  accepted: 'Aceita',
  declined: 'Não escolhida',
  withdrawn: 'Retirada',
  // bookings
  requested: 'Solicitado',
  paid: 'Pago',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  released: 'Liberado',
  disputed: 'Em contestação',
  // payments
  pending: 'Aguardando',
  confirmed: 'Confirmado',
  received: 'Recebido',
  held: 'Retido',
  refunded: 'Devolvido',
  failed: 'Não concluído',
  // providers
  draft: 'Rascunho',
  pending_review: 'Em análise',
  approved: 'Aprovado',
  suspended: 'Suspenso',
};
