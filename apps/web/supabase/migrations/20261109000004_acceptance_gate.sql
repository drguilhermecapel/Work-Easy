-- Acceptance needs an approved provider. A provider suspended, or who lost the approval of the
-- occupation, cannot be engaged any more: a sent proposal, a requested booking or an offered care
-- shift stops being acceptable (the matching offers are also withdrawn by the trigger in
-- 20261109000005_suspension_cascade.sql). Bodies below are the ones of the earlier migrations plus
-- the approval checks.

create or replace function public.accept_proposal(p_proposal uuid, p_period tstzrange)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.proposals;
  v_request public.requests;
  v_client public.profiles;
  v_provider_client uuid;
  v_booking uuid;
begin
  select * into v_proposal from public.proposals where id = p_proposal for update;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into v_request from public.requests where id = v_proposal.request_id for update;
  if v_request.client_id is distinct from v_uid then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  -- The scheduler closes expired requests only every 15 minutes: check the date here too.
  if v_request.status <> 'open' or v_request.expires_at <= now() then
    raise exception 'request_not_open' using errcode = 'P0001';
  end if;
  if v_proposal.status <> 'sent' or v_proposal.valid_until < now() then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  -- The provider must still be approved for this occupation (suspension, lost approval).
  if not private.offers_occupation(v_proposal.provider_id, v_request.occupation_slug) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  -- The client picks the period: it must be a future slot of at most 24 hours within
  -- two years (a past or months-long period would block the provider's agenda and fill the
  -- labor-lock count).
  if p_period is null or isempty(p_period) or lower(p_period) is null or upper(p_period) is null
     or lower(p_period) <= now()
     or lower(p_period) > now() + interval '2 years'
     or upper(p_period) - lower(p_period) > interval '24 hours' then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  update public.proposals set status = 'accepted' where id = v_proposal.id;
  update public.proposals set status = 'declined'
   where request_id = v_request.id and id <> v_proposal.id and status = 'sent';
  update public.requests set status = 'matched' where id = v_request.id;

  select * into v_client from public.profiles where id = v_uid;
  v_provider_client := private.ensure_provider_client(v_proposal.provider_id, v_client);

  begin
    insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, request_id,
                                 proposal_id, period, price_cents, status, origin)
    values (v_uid, v_provider_client, v_proposal.provider_id, v_request.occupation_slug, v_request.id,
            v_proposal.id, p_period, v_proposal.price_cents, 'accepted', 'platform')
    returning id into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;

  perform private.audit('proposal.accepted', 'proposal', v_proposal.id::text,
                        jsonb_build_object('booking_id', v_booking, 'request_id', v_request.id));
  return v_booking;
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

create or replace function public.accept_shift_offer(p_shift uuid)
returns public.shift_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found or not exists (select 1 from public.shift_offers o
                               where o.shift_id = p_shift and o.provider_id = v_uid and o.status = 'offered') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  -- A caregiver takes a shift only while approved with an approved care occupation.
  if not private.is_care_provider(v_uid) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_shift.status <> 'offered' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  begin
    update public.shifts set provider_id = v_uid, status = 'assigned' where id = p_shift;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  update public.shift_offers set status = case when provider_id = v_uid then 'accepted' else 'expired' end
   where shift_id = p_shift and status = 'offered';
  perform private.audit('shift.accepted', 'shift', p_shift::text, '{}'::jsonb);
  return 'assigned';
end;
$$;
