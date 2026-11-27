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
export type RideSettlement = { recognized: false } | {
  recognized: true;
  environment: 'simulation' | 'live';
  fare_cents: number;
  extras_cents: number;
  fee_cents: number;
  driver_cents: number;
  cash_cents: number;
  receivable_cents: number;
  driver_balance_cents: number;
  commission_cents: number;
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
