-- An own booking (a provider's own job) does not take a period that overlaps a care shift the provider
-- already holds (status assigned or checked_in). The same double booking that book_direct refuses applies
-- here: the shifts table refuses two shifts of one provider at once, but not a shift against a booking.
-- The refusal is slot_unavailable, as for any other taken slot. Shifts of other providers do not count,
-- and a period that starts when a shift ends does not overlap it (tstzrange bounds are [lower, upper)).
--
-- The rest of the function is the definition of 20261109000003_own_booking_gate.sql, unchanged.
-- An own job, a provider's client without an account, charged through the platform, needs the
-- same approval as a platform job: the provider is approved, the occupation is approved and its
-- registry was not rejected. The earlier check only excluded suspended providers.
create or replace function public.create_own_booking(
  p_provider_client uuid,
  p_occupation text,
  p_period tstzrange,
  p_price_cents int,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_client public.provider_clients;
  v_booking uuid;
begin
  select * into v_client from public.provider_clients
   where id = p_provider_client and provider_id = v_uid and origin = 'own';
  if not found or not private.offers_occupation(v_uid, p_occupation) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- A care shift the provider already holds for this period (assigned or checked in) takes the slot.
  if exists (
       select 1 from public.shifts s
        where s.provider_id = v_uid
          and s.status in ('assigned', 'checked_in')
          and s.period && p_period
     ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  begin
    insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, period,
                                 price_cents, status, origin, notes)
    values (null, v_client.id, v_uid, p_occupation, p_period, p_price_cents, 'accepted', 'own', p_notes)
    returning id into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  return v_booking;
end;
$$;
