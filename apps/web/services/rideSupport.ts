import { db, nullable, unwrap } from './client';

export const helpReasons = {
  safety: 'Segurança',
  no_show: 'Ausência',
  price: 'Preço',
  schedule: 'Horário',
  payment: 'Pagamento',
  other: 'Outro',
} as const;

export const supportOutcomes = {
  assisted: 'Orientação prestada',
  rebooked: 'Reagendamento combinado',
  cost_reviewed: 'Custo revisado',
  escalated: 'Encaminhado à equipe responsável',
  duplicate: 'Solicitação duplicada',
} as const;

export type HelpReason = keyof typeof helpReasons;
export type SupportOutcome = keyof typeof supportOutcomes;
export interface SupportRequest {
  protocol: string;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
  code: SupportOutcome | null;
}
export interface SupportQueueItem extends SupportRequest {
  leg: string | null;
  kind: 'ride_help' | 'ride_receipt_incomplete' | 'ride_deletion_review';
  environment: 'live' | 'simulation';
  claimed_by: string | null;
  claimed_by_me: boolean;
  can_claim: boolean;
  can_resolve: boolean;
}
export interface RideSupportContact {
  environment: 'live' | 'simulation';
  channel: 'email' | 'phone' | null;
  address: string | null;
  team: string | null;
  from: string | null;
  until: string | null;
  on_duty: boolean;
  requests: SupportRequest[];
}

export const listSupportQueue = async () => unwrap<SupportQueueItem[]>(await db().rpc('admin_ride_support_queue'));
export const getSupportContact = async (leg: string) => unwrap<RideSupportContact>(await db().rpc('ride_support_contact', { p_leg: leg }));
export const claimSupportRequest = async (protocol: string) =>
  unwrap<string>(await db().rpc('admin_ride_support_action', { p_protocol: protocol, p_action: 'claim', p_code: nullable(null)! }));
export const resolveSupportRequest = async (protocol: string, code: SupportOutcome) =>
  unwrap<string>(await db().rpc('admin_ride_support_action', { p_protocol: protocol, p_action: 'resolve', p_code: code }));
