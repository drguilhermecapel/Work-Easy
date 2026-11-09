-- Restores the acceptance gate of 20261109000004 in transition_booking. The reason-length limit in
-- 20261109100002 re-created the function from an older body and dropped the check that a provider
-- accepts a requested booking only while approved for its occupation.
create or replace function public.transition_booking(
  p_booking uuid,
  p_to public.booking_status,
  p_reason text default null
)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_service boolean := private.is_service_role();
  v_admin boolean := public.is_admin();
  v_is_provider boolean;
  v_is_client boolean;
  v_ok boolean;
begin
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'reason too long';
  end if;

  select * into v_booking from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  v_is_provider := v_uid is not null and v_uid = v_booking.provider_id;
  v_is_client := v_uid is not null and v_uid = v_booking.client_id;
  if not (v_service or v_admin or v_is_provider or v_is_client) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_to is null or p_to = v_booking.status then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  -- A provider accepts only while approved for the occupation of the booking.
  if p_to = 'accepted' and v_is_provider
     and not private.offers_occupation(v_booking.provider_id, v_booking.occupation_slug) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  v_ok := (v_is_provider and private.booking_transition_allowed('provider', v_booking.status, p_to))
       or (v_is_client and private.booking_transition_allowed('client', v_booking.status, p_to)
           and (p_to <> 'disputed' or now() <= upper(v_booking.period) + interval '7 days'))
       or (v_service and private.booking_transition_allowed('service', v_booking.status, p_to));

  if not v_ok and v_admin then
    if nullif(trim(p_reason), '') is null then
      raise exception 'not_allowed' using errcode = 'P0001', detail = 'reason required';
    end if;
    v_ok := true;
  end if;
  if not v_ok then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  perform set_config('workeasy.transition_reason', coalesce(p_reason, ''), true);
  begin
    update public.bookings
       set status = p_to,
           canceled_reason = case when p_to = 'canceled' then coalesce(p_reason, canceled_reason) else canceled_reason end
     where id = v_booking.id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  perform set_config('workeasy.transition_reason', '', true);
  return p_to;
end;
$$;
