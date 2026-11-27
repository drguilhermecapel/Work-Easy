import { serve } from '../_runtime/supabase.ts';
import { environment, orderContract, orderDeps } from '../_runtime/ride-order.ts';
import { ridePspRpc } from '../_runtime/ride-rpc.ts';
import { orderRefund, type RefundDeps } from '../_shared/ride-order-adjustments.ts';
const deps: RefundDeps = {
  ...orderDeps,
  refund: (id, actor, extras, evidence) =>
    ridePspRpc('ride_prepare_order_refund', {
      p_case: id,
      p_actor: actor,
      p_environment: environment,
      p_extras: extras,
      p_evidence: evidence,
    }),
  claimRefund: (id) => ridePspRpc('ride_claim_order_refund', { p_case: id, p_environment: environment }),
};
serve((req) => orderRefund(req, deps, orderContract));
