-- Account deletion, bookings: the accepted bookings a user takes part in, as client or provider, are canceled
-- with the reason "cancelada pela exclusão da conta", so they do not block the deletion. Paid, in-progress and
-- disputed bookings are not touched here: account-delete refuses the deletion while one of them exists.
-- account-delete calls this function as the service role, before anonymize_user.
--
-- The status is written straight to bookings, because the service role has no accepted -> canceled step in
-- private.booking_transition_allowed, and this function is the deletion path. The reason goes to canceled_reason
-- and, through the workeasy.transition_reason setting, to booking_events.reason, as transition_booking does.
-- Returns how many bookings were canceled. Running it again cancels nothing.
--
-- Not notified: the counterpart should get a message through private.notify, but no template of the
-- notifications table covers a booking cancellation (the accepted list is in 20261109300006).
create function public.cancel_unpaid_accepted_bookings_for_user(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  perform set_config('workeasy.transition_reason', 'cancelada pela exclusão da conta', true);
  with canceled as (
    update public.bookings b
       set status = 'canceled',
           canceled_reason = 'cancelada pela exclusão da conta'
     where b.status = 'accepted'
       and (b.client_id = p_user or b.provider_id = p_user)
    returning b.id
  )
  select count(*)::int into v_count from canceled;
  perform set_config('workeasy.transition_reason', '', true);
  return v_count;
end;
$$;

revoke all on function public.cancel_unpaid_accepted_bookings_for_user(uuid) from public, anon, authenticated;
grant execute on function public.cancel_unpaid_accepted_bookings_for_user(uuid) to service_role;
