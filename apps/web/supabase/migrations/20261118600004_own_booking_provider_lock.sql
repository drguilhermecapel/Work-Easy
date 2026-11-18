-- create_own_booking checks the provider's care shifts before it inserts the booking, but it did not take
-- the provider's row lock. The accept paths (accept_proposal and accept_shift_offer, 20261118600001) and
-- book_direct (20261118500002) all lock the provider's row before they check the agenda. Without the same
-- lock here, an own booking and a shift assignment running at the same time can both commit an overlapping
-- period under READ COMMITTED. This takes the same lock, so the three paths run one after another for the
-- same provider. The check and the insert are otherwise unchanged from 20261118500003.
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

  -- Same lock as book_direct and the accept paths: serializes the agenda check with any other write to it.
  perform 1 from public.providers p where p.id = v_uid for no key update;

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
