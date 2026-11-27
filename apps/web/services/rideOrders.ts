import { db, invokeFunction, nullable, unwrap, unwrapMaybe } from './client';
export type Method = 'card' | 'cash' | 'pix';
export type Order = {
  id: string;
  leg_id: string;
  component: 'fare' | 'tip' | 'wait';
  method: Method;
  total: number;
  extras: number;
  commission: number | null;
  received: number;
  refunded: number;
  status: string;
  invoice: string | null;
  mine: boolean;
  can_invite: boolean;
  can_report_cash: boolean;
  benefit: number;
  benefit_returned: number;
  receipts: { id: string; tendered: number; change: number; status: string }[];
  cases: { id: string; amount: number; status: string; reason: string | null; decision: string | null }[];
};
type WaitRule = {
  base_cents: number;
  multiplier_bps: number;
  free_wait_minutes: number;
  wait_cents_per_minute: number;
  absence_policy: string;
};
export type Terms = {
  seq: number;
  total_cents: number;
  maximum_cents: number;
  extras_cents: number;
  rule: WaitRule | null;
};
export type Desk = {
  environment: 'live' | 'simulation';
  methods: string[];
  can_open: boolean;
  has_plan: boolean;
  wait: { minutes: number; cents: number } | null;
  orders: Order[];
  operator: boolean;
  invites: { id: string; cents: number; expires: string; status: string; incoming: boolean }[];
  benefits: { id: string; source: string; available: number; until: string }[];
  wallet: {
    available: number;
    fee: number;
    limit: number;
    withdrawals: { id: string; gross: number; fee: number; status: string }[];
  } | null;
};
export type OrderReceipt = {
  order: string;
  component: string;
  environment: string;
  versions: {
    revision: number;
    at: string;
    total: number;
    extras: number;
    commission: number;
    method: Method;
    status: string;
    received: number;
    refunded: number;
    deposited: number | null;
    recovered: number | null;
    processing: number | null;
  }[];
};
export type OrderStatement = {
  gross: number;
  received: number;
  refunded: number;
  funded: number;
  commission: number | null;
  driver_balance: number | null;
  receivable: number | null;
  processor: number | null;
  driver_paid: number;
  driver_recovered: number;
  cash_received: number;
  has_cash: boolean;
};
export type IssuerStatus = {
  status: 'review' | 'debited' | 'released';
  amount: number | null;
  returned: number | null;
};
export const rideOrders = {
  statement: async (leg: string) =>
    unwrapMaybe<OrderStatement>(await db().rpc('ride_order_statement', { p_leg: leg })),
  termsWallet: async () =>
    unwrapMaybe<{ time: string; fee: number; limit: number }>(await db().rpc('ride_my_withdrawal_terms')),
  commissionCash: async (leg: string, cents: number, reference: string, key: string) =>
    unwrap<string>(
      await db().rpc('admin_settle_ride_cash_commission', {
        p_leg: leg,
        p_cents: cents,
        p_reference: reference,
        p_key: key,
      }),
    ),
  fundingPayout: async (order: string, cents: number, reference: string, key: string) =>
    unwrap<string>(
      await db().rpc('admin_record_order_funding_payout', {
        p_order: order,
        p_cents: cents,
        p_reference: reference,
        p_key: key,
      }),
    ),
  voidCash: async (receipt: string, reference: string) =>
    unwrap<string>(await db().rpc('admin_void_ride_cash_report', { p_receipt: receipt, p_reference: reference })),
  issuer: async (order: string) =>
    unwrapMaybe<IssuerStatus>(await db().rpc('ride_issuer_status', { p_order: order })),
  issuerDecision: async (order: string, lost: boolean, amount: number, extras: number, reference: string) =>
    unwrap<string>(
      await db().rpc('admin_resolve_ride_issuer', {
        p_order: order,
        p_lost: lost,
        p_amount: amount,
        p_extras: extras,
        p_reference: reference,
      }),
    ),
  issuerReturn: async (order: string, cents: number, reference: string, key: string) =>
    unwrap<string>(
      await db().rpc('admin_record_issuer_split_return', {
        p_order: order,
        p_cents: cents,
        p_reference: reference,
        p_key: key,
      }),
    ),
  desk: async (leg: string | null) =>
    unwrapMaybe<Desk>(await db().rpc('ride_order_desk', { p_leg: nullable(leg) })),
  terms: async (quote: string) => unwrap<Terms[]>(await db().rpc('ride_quote_payment_terms', { p_quote: quote })),
  open: async (leg: string, method: Method) =>
    unwrap<string>(await db().rpc('ride_open_payment_order', { p_leg: leg, p_method: method })),
  code: async () => unwrap<string>(await db().rpc('ride_make_share_code')),
  invite: async (order: string, code: string, cents: number, key: string) =>
    unwrap<string>(
      await db().rpc('ride_invite_fare_code', {
        p_order: order,
        p_code: code,
        p_cents: cents,
        p_key: key,
      }),
    ),
  answer: async (invite: string, accept: boolean) =>
    unwrap<string>(await db().rpc('ride_answer_fare_share', { p_invite: invite, p_accept: accept })),
  add: async (leg: string, component: 'tip' | 'wait', cents: number, method: Method, key: string) =>
    unwrap<string>(
      await db().rpc('ride_add_order_component', {
        p_leg: leg,
        p_component: component,
        p_cents: cents,
        p_method: method,
        p_key: key,
      }),
    ),
  benefit: async (order: string, benefit: string, cents: number) =>
    unwrap<number>(
      await db().rpc('ride_apply_order_benefit', { p_order: order, p_benefit: benefit, p_cents: cents }),
    ),
  report: async (order: string, tendered: number, change: number, key: string) =>
    unwrap<string>(
      await db().rpc('ride_cash_report', { p_order: order, p_tendered: tendered, p_change: change, p_key: key }),
    ),
  confirm: async (receipt: string, agree: boolean) =>
    unwrap<string>(await db().rpc('ride_cash_confirm', { p_receipt: receipt, p_agree: agree })),
  balancePix: async (order: string) => unwrap<number>(await db().rpc('ride_cash_balance_pix', { p_order: order })),
  checkout: (order: string) => invokeFunction('ride-order-checkout', { leg_id: order }),
  receipt: async (order: string) => unwrap<OrderReceipt>(await db().rpc('ride_order_receipt', { p_order: order })),
  review: async (order: string, cents: number, reason: string, key: string) =>
    unwrap<string>(
      await db().rpc('ride_request_order_review', {
        p_order: order,
        p_cents: cents,
        p_reason: reason,
        p_key: key,
      }),
    ),
  decide: async (id: string, approve: boolean, reason: string) =>
    unwrap<string>(
      await db().rpc('ride_decide_order_review', { p_case: id, p_approve: approve, p_reason: reason }),
    ),
  resolve: async (id: string, source: 'cash' | 'benefit', extras: number, reference: string) =>
    unwrap<string>(
      await db().rpc('ride_refund_order_source', {
        p_case: id,
        p_origin: source,
        p_extras: extras,
        p_reference: reference,
      }),
    ),
  sendRefund: (id: string, extras: number, evidence: string) =>
    invokeFunction('ride-order-refund', { case_id: id, extras_cents: extras, evidence }),
  transfer: (id: string) => invokeFunction('ride-wallet-transfer', { withdrawal: id }),
  withdraw: async (key: string, cents: number, fee: number) =>
    unwrap<string>(await db().rpc('ride_request_withdrawal', { p_key: key, p_cents: cents, p_fee: fee })),
};
