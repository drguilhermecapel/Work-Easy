-- 02 Free-text reasons (DB-04, PRIV-03): a reason has at most 500 characters, and the audit log
-- keeps no reason text. The booking history (booking_events.reason) and the booking or shift
-- itself keep the text, and anonymize_user clears it there. The audit log is append-only, so
-- entries written before this migration keep their text; see the notes of the change.

-- Existing rows are not checked (NOT VALID): the history is append-only and is not rewritten.
alter table public.booking_events
  add constraint booking_events_reason_len check (char_length(reason) <= 500) not valid;

-- The reason goes to the history only; the audit entry keeps the rest of the transition.
create or replace function private.log_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('workeasy.transition_reason', true), '');
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor_id, reason)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(), v_reason);

  perform private.audit(
    case when tg_op = 'INSERT' then 'booking.created' else 'booking.transition' end,
    'booking', new.id::text,
    jsonb_build_object('from', case when tg_op = 'UPDATE' then old.status end, 'to', new.status,
                       'platform_fee_cents', new.platform_fee_cents));
  return null;
end;
$$;

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

create or replace function public.cancel_shift(p_shift uuid, p_reason text default null)
returns public.shift_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts;
  v_status public.shift_status;
begin
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'reason too long';
  end if;

  select * into v_shift from public.shifts where id = p_shift for update;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if v_shift.provider_id = v_uid then
    if v_shift.status <> 'assigned' then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    update public.shift_offers set status = case when provider_id = v_uid then 'declined' else 'offered' end
     where shift_id = p_shift and (provider_id = v_uid or status in ('offered', 'expired'));
    update public.shifts set provider_id = null, status = 'open' where id = p_shift;
    v_status := 'open';
    if exists (select 1 from public.shift_offers o where o.shift_id = p_shift and o.status = 'offered') then
      update public.shifts set status = 'offered' where id = p_shift;
      v_status := 'offered';
    end if;
  elsif private.owns_household(v_shift.household_id) or public.is_admin() then
    if v_shift.status not in ('open', 'offered', 'assigned') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    update public.shifts set status = 'canceled' where id = p_shift;
    update public.shift_offers set status = 'expired' where shift_id = p_shift and status = 'offered';
    v_status := 'canceled';
  else
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- The reason is not written to the audit log (it stays out of the immutable record).
  perform private.audit('shift.canceled', 'shift', p_shift::text,
                        jsonb_build_object('by_caregiver', v_shift.provider_id = v_uid, 'status', v_status));
  return v_status;
end;
$$;
