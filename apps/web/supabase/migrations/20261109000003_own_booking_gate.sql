-- An own job (a provider's client without an account, charged through the platform) needs the
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
