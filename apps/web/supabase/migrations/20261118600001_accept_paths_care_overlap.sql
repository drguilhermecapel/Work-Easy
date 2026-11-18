-- The acceptance paths do not take a period that overlaps what the provider already holds.
--
-- accept_proposal (the client accepts a proposal): refused with slot_unavailable when the provider
-- holds a care shift (status assigned or checked_in) whose period overlaps the period of the booking.
-- The shifts table refuses two shifts of one provider at once, and bookings_no_overlap refuses two
-- bookings, but no constraint compares a shift with a booking, so the check is made here.
--
-- accept_shift_offer (a caregiver takes a shift): refused with slot_unavailable when the caregiver
-- holds a booking in a status that occupies the agenda (requested, accepted, paid or in_progress: the
-- same set as bookings_no_overlap) whose period overlaps the period of the shift.
--
-- Both paths take the provider row with FOR NO KEY UPDATE before the check and the write, as book_direct
-- does (20261110300007_direct_request_provider_lock.sql). A concurrent booking of the same provider that
-- takes that lock first is committed before the check runs, and the check then sees it.
-- Periods are tstzrange values with [lower, upper) bounds, so a period that starts when another one ends
-- does not overlap it.
--
-- Known limit: create_own_booking (20261118500003) does not take this lock. A shift accepted at the same
-- time as an own booking of the same provider is not covered by this migration.
--
-- The rest of each function is the definition of 20261109000004_acceptance_gate.sql, unchanged.
-- create or replace keeps the grants and the volatility of the functions.

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

  -- Held until the end of the call, for the agenda check below and the booking insert.
  perform 1 from public.providers p where p.id = v_proposal.provider_id for no key update;

  -- A care shift the provider already holds for this period (assigned or checked in) takes the slot.
  if exists (
       select 1 from public.shifts s
        where s.provider_id = v_proposal.provider_id
          and s.status in ('assigned', 'checked_in')
          and s.period && p_period
     ) then
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

  -- Held until the end of the call, for the agenda check below and the assignment.
  perform 1 from public.providers p where p.id = v_uid for no key update;

  -- A booking of the caregiver in a status that occupies the agenda takes the shift when the periods overlap.
  if exists (
       select 1 from public.bookings b
        where b.provider_id = v_uid
          and b.status in ('requested', 'accepted', 'paid', 'in_progress')
          and b.period && v_shift.period
     ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
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
