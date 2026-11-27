import { db, unwrap } from './client';

export const rideFinanceLabels = {
  capture: 'Confirmar recebimento',
  capture_failed: 'Registrar falha de cobrança',
  capture_unknown: 'Marcar cobrança incerta',
  payout: 'Confirmar repasse',
  payout_failed: 'Registrar falha de repasse',
  payout_unknown: 'Marcar repasse incerto',
  refund: 'Confirmar reembolso',
  refund_failed: 'Registrar falha de reembolso',
  refund_unknown: 'Marcar reembolso incerto',
  dispute_open: 'Abrir disputa',
  dispute_release: 'Encerrar disputa sem débito',
  chargeback: 'Registrar débito de chargeback',
} as const;

export type RideFinanceKind = keyof typeof rideFinanceLabels;
export type RideCostReview = {
  status: 'unknown' | 'cancelled';
  environment: 'simulation' | 'live';
  cost_cents: number | null;
  can_review: boolean;
  paid_cents: number;
  payable_cents: number | null;
  evidence: string | null;
};

export type RideSettlement = { recognized: false; review?: RideCostReview | null } | {
  recognized: true;
  environment: 'simulation' | 'live';
  source: 'unclaimed' | 'manual' | 'psp_sandbox' | 'psp_live';
  fare_cents: number;
  extras_cents: number;
  fee_cents: number;
  driver_cents: number;
  cash_cents: number;
  receivable_cents: number;
  driver_balance_cents: number;
  commission_cents: number;
  processing_cost_cents: number;
  disputed_cents: number;
  reversed_cents: number;
  reversed_extras_cents: number;
  unknown: { operation_id: string; kind: RideFinanceKind; amount_cents: number; extras_cents: number } | null;
};

export const getRideSettlement = async (legId: string) =>
  unwrap<RideSettlement>(await db().rpc('admin_ride_settlement', { p_leg: legId }));

export const simulateRideFinanceEvent = async (
  legId: string, operationId: string, kind: RideFinanceKind, amountCents: number, extrasCents: number,
) => unwrap<RideSettlement>(await db().rpc('admin_simulate_ride_payment_event', {
  p_leg: legId, p_operation: operationId, p_kind: kind, p_amount_cents: amountCents, p_extras_cents: extrasCents,
}));

export const confirmSimulatedRideCost = async (legId: string, operationId: string, costCents: number, evidence: string) =>
  unwrap<RideSettlement>(await db().rpc('admin_confirm_simulated_ride_cost', {
    p_leg: legId, p_operation: operationId, p_cost_cents: costCents, p_reference: evidence,
  }));

export const confirmLiveRideCost = async (legId: string, operationId: string, costCents: number, evidence: string) =>
  unwrap<RideSettlement>(await db().rpc('admin_confirm_live_ride_cost', {
    p_leg: legId, p_operation: operationId, p_cost_cents: costCents, p_reference: evidence,
  }));

export const recordRideCostDisbursement = async (legId: string, operationId: string, amountCents: number, evidence: string) =>
  unwrap<RideSettlement>(await db().rpc('admin_record_ride_cost_disbursement', {
    p_leg: legId, p_operation: operationId, p_amount_cents: amountCents, p_reference: evidence,
  }));
