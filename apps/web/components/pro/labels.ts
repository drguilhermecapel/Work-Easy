import type { Enums } from '../../lib/database.types';
import type { PaymentMethod, PaymentStatus } from '../../services/charges';
import type { BookingStatus } from '../../services/proAgenda';
import type { QuoteStatus } from '../../services/quotes';
import type { ProviderStatus } from '../../services/types';

// Words the Pro screens use for database states. Registry numbers are
// "informados" or "confirmados pelo WorkEasy", never presented as verified.

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  draft: 'Rascunho',
  pending_review: 'Em análise',
  approved: 'Aprovado',
  suspended: 'Suspenso',
};

export const PROVIDER_STATUS_STYLES: Record<ProviderStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
};

export const PROVIDER_STATUS_HELP: Record<ProviderStatus, string> = {
  draft: 'Seu cadastro ainda não foi enviado. Complete os passos em Cadastro e envie para análise. Enquanto isso você não aparece nas buscas, não recebe pedidos e não cobra clientes.',
  pending_review: 'Sua documentação está em análise pela equipe do WorkEasy. Você será liberado quando o cadastro for aprovado; até lá não recebe pedidos nem cobra clientes.',
  approved: 'Seu cadastro está aprovado: você aparece nas buscas, recebe pedidos dos bairros que atende e pode usar as ferramentas abaixo.',
  suspended: 'Seu cadastro está suspenso. Você não aparece nas buscas nem recebe pedidos. Fale com o suporte do WorkEasy para entender o motivo.',
};

export const REGISTRY_STATUS_LABELS: Record<Enums<'registry_status'>, string> = {
  not_required: 'Registro não exigido',
  informed: 'Informado (ainda não confirmado)',
  confirmed: 'Confirmado pelo WorkEasy',
  rejected: 'Recusado',
};

export const DOCUMENT_STATUS_LABELS: Record<Enums<'document_status'>, string> = {
  submitted: 'Enviado, aguardando análise',
  accepted: 'Aceito',
  rejected: 'Recusado',
};

export const DOCUMENT_STATUS_STYLES: Record<Enums<'document_status'> | 'missing', string> = {
  submitted: 'bg-amber-100 text-amber-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  missing: 'bg-gray-100 text-gray-700',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: 'Solicitado',
  accepted: 'Confirmado',
  paid: 'Pago',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  released: 'Encerrado',
  canceled: 'Cancelado',
  disputed: 'Em disputa',
};

export const BOOKING_STATUS_STYLES: Record<BookingStatus, string> = {
  requested: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-700',
  released: 'bg-gray-100 text-gray-700',
  canceled: 'bg-gray-100 text-gray-500',
  disputed: 'bg-red-100 text-red-800',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Aguardando pagamento',
  confirmed: 'Pagamento confirmado',
  received: 'Recebido',
  held: 'Em retenção',
  released: 'Liberado',
  refunded: 'Estornado',
  failed: 'Falhou',
  canceled: 'Cancelado',
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-green-100 text-green-800',
  received: 'bg-green-100 text-green-800',
  held: 'bg-blue-100 text-blue-800',
  released: 'bg-green-100 text-green-800',
  refunded: 'bg-gray-100 text-gray-700',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-500',
};

/** The card is paid on the Asaas invoice page: the app never handles card data. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  credit_card: 'Cartão, na página de pagamento do Asaas',
  undefined: 'O cliente escolhe na fatura',
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  accepted: 'Aceito pelo cliente',
  declined: 'Recusado pelo cliente',
  expired: 'Vencido',
};

export const QUOTE_STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-500',
};

export const PROPOSAL_STATUS_LABELS: Record<Enums<'proposal_status'>, string> = {
  sent: 'Enviada',
  accepted: 'Aceita pelo cliente',
  declined: 'Não escolhida',
  withdrawn: 'Retirada',
};

export const PROPOSAL_STATUS_STYLES: Record<Enums<'proposal_status'>, string> = {
  sent: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-gray-100 text-gray-600',
  withdrawn: 'bg-gray-100 text-gray-500',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<Enums<'subscription_status'>, string> = {
  pending: 'Aguardando o primeiro pagamento',
  trialing: 'Período de teste',
  active: 'Ativa',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelada',
};
