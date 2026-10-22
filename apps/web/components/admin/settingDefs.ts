import { DEFAULT_SETTINGS } from '../../config/features';
import { formatCents } from '../../lib/money';
import type { BooleanSettingKey, NumberSettingKey } from '../../services/admin';
import { formatBps } from './format';

// Wording and shape of each setting the administration screen edits.

/** Fixed warning shown next to every money feature switch. */
export const LEGAL_NOTICE = 'Depende de parecer jurídico e de conta Asaas configurada.';

export interface BooleanDef {
  key: BooleanSettingKey;
  title: string;
  /** What the feature does once it is on. */
  what: string;
  /** What is true for the users while it is off (the starting state). */
  whileOff: string;
}

export const BOOLEAN_DEFS: BooleanDef[] = [
  {
    key: 'commission_enabled',
    title: 'Comissão da plataforma',
    what: 'Quando ligada, cobra a comissão no primeiro serviço com cliente novo, nas ocupações cuja política permite.',
    whileOff: 'Enquanto estiver desligada, nenhuma comissão é calculada nem cobrada.',
  },
  {
    key: 'escrow_enabled',
    title: 'Pagamento retido',
    what: 'Quando ligado, o valor pago fica retido até o atendimento ser liberado.',
    whileOff: 'Enquanto estiver desligado, nenhum valor é retido: o pagamento segue direto para o profissional.',
  },
];

export interface NumberDef {
  key: NumberSettingKey;
  title: string;
  label: string;
  hint: string;
  show: (value: number) => string;
  toText: (value: number) => string;
}

export const NUMBER_DEFS: NumberDef[] = [
  {
    key: 'commission_bps',
    title: 'Percentual da comissão',
    label: 'Pontos-base (100 = 1%)',
    hint: 'Não tem efeito enquanto a comissão estiver desligada.',
    show: value => `${value} pontos-base (${formatBps(value)})`,
    toText: String,
  },
  {
    key: 'pro_price_cents',
    title: 'Preço mensal do plano Pro',
    label: 'Valor em reais',
    hint: 'Vale para novas assinaturas, por exemplo 49,90.',
    show: formatCents,
    toText: value => (value / 100).toFixed(2).replace('.', ','),
  },
  {
    key: 'proposal_limit',
    title: 'Propostas por pedido',
    label: 'Quantidade máxima',
    hint: 'Quantas propostas um pedido recebe antes de fechar para novas.',
    show: value => `${value}`,
    toText: String,
  },
  {
    key: 'labor_lock_days_per_week',
    title: 'Dias por semana com o mesmo profissional na mesma casa',
    label: 'Dias por semana',
    hint: 'Na ocupação com trava trabalhista. A regra de empregados domésticos (LC 150/2015) fala em mais de 2 dias por semana; mude só com parecer jurídico.',
    show: value => `${value} ${value === 1 ? 'dia' : 'dias'}`,
    toText: String,
  },
];


export const SETTING_FIELDS = {
  commission_bps: 'commissionBps',
  pro_price_cents: 'proPriceCents',
  proposal_limit: 'proposalLimit',
  labor_lock_days_per_week: 'laborLockDaysPerWeek',
} as const satisfies Record<NumberSettingKey, keyof typeof DEFAULT_SETTINGS>;
