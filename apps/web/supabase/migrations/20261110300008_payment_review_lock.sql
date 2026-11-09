-- Records that an administrator dealt with a payment that needed manual action (a refund the
-- gateway refused, or a payment received after the booking was canceled). It writes
-- 'payment.reviewed' with the reason, which takes the payment's earlier entries out of
-- admin_payments_attention. It refuses when nothing is waiting, so a second administrator
-- who arrives late gets invalid_transition instead of a duplicate entry.
-- The payment row is locked before the waiting check, so two reviews of the same payment run one
-- after the other: the second one checks again after the first has committed its entry.
create or replace function public.admin_review_payment(p_payment uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment uuid;
begin
  perform private.require_admin();
  if nullif(trim(p_reason), '') is null then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'reason required';
  end if;

  select p.id into v_payment from public.payments p where p.id = p_payment for update;
  if v_payment is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.admin_payments_attention a where a.payment_id = p_payment) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  perform private.audit('payment.reviewed', 'payments', p_payment::text,
                        jsonb_build_object('reason', trim(p_reason)));
  return true;
end;
$$;
