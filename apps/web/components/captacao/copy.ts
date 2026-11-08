import { formatCents } from '../../lib/money';
import type { PlatformFacts } from './usePlatformFacts';

// Sentences that carry a number from the platform. Each one has two forms: with the number
// when it was read, and without any number when it was not (demo, unreadable, or not set).

export const PENDING = 'Carregando…';

export const days = (count: number): string => `${count} ${count === 1 ? 'dia' : 'dias'}`;

export const proposalsText = (limit: number | null): string =>
  limit !== null
    ? `Cada pedido recebe até ${limit} ${limit === 1 ? 'proposta' : 'propostas'}.`
    : 'Cada pedido recebe um número limitado de propostas.';

export const commissionText = (commissionEnabled: boolean | null): string => {
  if (commissionEnabled === false) return 'Hoje está desligada: o WorkEasy não cobra comissão sobre serviços fechados pela plataforma.';
  if (commissionEnabled === true) return 'Está ligada para algumas ocupações. A forma de cobrança de cada ocupação aparece na página do serviço.';
  return 'A forma de cobrança prevista para cada ocupação aparece na página do serviço.';
};

const priceText = (cents: number | null): string =>
  cents !== null ? `${formatCents(cents)} por mês.` : 'Definido pela plataforma. O valor aparece na tela de assinatura, depois do cadastro.';

const trialText = (trialDays: number | null): string =>
  trialDays !== null
    ? `${days(trialDays)} para quem nunca assinou. A primeira cobrança só vence quando o teste acaba, e cancelar antes evita a cobrança.`
    : 'Quando a plataforma oferece teste grátis, a tela de assinatura informa o prazo.';

const freeProposalsText = (allowance: number | null): string =>
  allowance !== null
    ? `Até ${allowance} ${allowance === 1 ? 'proposta nova' : 'propostas novas'} por mês em pedidos da plataforma.`
    : 'O plano grátis pode ter um limite mensal de propostas novas. O número aparece na tela de assinatura.';

/** Rows of the Pro section of /para-profissionais. While the platform is being read, the rows that depend on it say so. */
export const proRows = (facts: PlatformFacts, loading: boolean): Array<{ term: string; value: string }> => [
  { term: 'Preço do plano Pro', value: loading ? PENDING : priceText(facts.proPriceCents) },
  { term: 'Teste grátis do Pro', value: loading ? PENDING : trialText(facts.proTrialDays) },
  { term: 'Propostas no plano grátis', value: loading ? PENDING : freeProposalsText(facts.freeProposalsPerMonth) },
  {
    term: 'Propostas no plano Pro',
    value: 'Sem o limite mensal do plano grátis. Cada pedido continua recebendo só um número limitado de propostas, somando todos os profissionais.',
  },
  {
    term: 'Cobrança de clientes seus',
    value:
      'Por Pix, boleto ou cartão, na sua conta de recebimento no Asaas, depois de ativar o recebimento. O WorkEasy não cobra comissão sobre essas cobranças; as tarifas do Asaas são cobradas por ele.',
  },
  { term: 'Comissão sobre pedidos da plataforma', value: loading ? PENDING : commissionText(facts.commissionEnabled) },
  { term: 'Cancelamento', value: 'Você pode cancelar a assinatura quando quiser.' },
];
