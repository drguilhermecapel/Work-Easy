-- Accepting a booking takes the provider's agenda. transition_booking (the definition of
-- 20261109300001_transition_gate_restored.sql) did not look at the provider's care shifts when a
-- booking became accepted. The admin can reactivate a canceled booking to accepted with a reason, and
-- that reactivation could overlap a shift the provider holds. A reactivation that ran at the same time
-- as accept_shift_offer could confirm both under READ COMMITTED.
--
-- A transition whose target is accepted (a provider accepting a request, or the admin reactivating a
-- booking) now takes the provider's row with FOR NO KEY UPDATE, the lock of the accept paths and of
-- book_direct, and then is refused with slot_unavailable when the provider holds a care shift in status
-- assigned or checked_in whose period overlaps the period of the booking. Periods are tstzrange values
-- with [lower, upper) bounds, so a booking that only touches the shift is accepted. Every other target
-- status, the admin check, the audit record and the grants are unchanged.
--
-- The rest of the function is the definition of 20261109300001_transition_gate_restored.sql, unchanged.
-- create or replace keeps the grants and the volatility of the function.
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

  -- Accepting takes the provider's agenda: the same row lock as the accept paths and book_direct, held
  -- until the end of the call, then a care shift the provider holds for this period takes the slot.
  if p_to = 'accepted' then
    perform 1 from public.providers p where p.id = v_booking.provider_id for no key update;
    if exists (
         select 1 from public.shifts s
          where s.provider_id = v_booking.provider_id
            and s.status in ('assigned', 'checked_in')
            and s.period && v_booking.period
       ) then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;
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
