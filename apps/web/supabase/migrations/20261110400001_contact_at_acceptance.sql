-- The client's name and phone reach the provider's CRM entry when the booking is accepted, not when
-- it is requested. A request nobody accepted yet releases no contact, the same rule as the profile
-- (see private.shares_contact). The provider reads its own CRM rows, so a copy made at request time
-- was readable before any acceptance.
--
-- - private.ensure_provider_client still creates the entry, one per provider and client, but with a
--   neutral label and no contact. The label is what the provider's agenda lists for a pending request.
-- - private.share_booking_contact, a before trigger on bookings, writes the name and the phone when a
--   platform booking becomes accepted (inserted accepted, or moved to accepted). It runs before the
--   labor lock check. A name the provider already changed is kept, and so is a phone the provider typed.
-- - private.enforce_booking_labor_lock checks the lock again when a booking becomes accepted. The
--   same-employer match by phone needs the client's contact, and that contact exists from acceptance on.
--   The other updates keep the earlier skip rule.

-- Creates the CRM entry of a platform client with a neutral label and no contact. The body of the
-- previous version (20261019000004_marketplace.sql) also copied the name and the phone; those now
-- come from private.share_client_contact at acceptance.
create or replace function private.ensure_provider_client(p_provider uuid, p_client public.profiles)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.provider_clients (provider_id, client_id, name, origin)
  values (p_provider, p_client.id, 'Cliente da plataforma', 'platform')
  on conflict (provider_id, client_id) where client_id is not null
  do update set client_id = excluded.client_id
  returning id into v_id;
  return v_id;
end;
$$;

-- Writes the client's name and phone into the CRM entry. The neutral label is replaced by the name;
-- a name the provider changed and a phone already on the entry are kept.
create function private.share_client_contact(p_provider_client uuid, p_client uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_client;
  if not found then
    return;
  end if;

  update public.provider_clients as pc
     set name = case when pc.name = 'Cliente da plataforma'
                     then coalesce(nullif(trim(v_profile.full_name), ''), 'Cliente')
                     else pc.name end,
         phone = coalesce(pc.phone, v_profile.phone)
   where pc.id = p_provider_client
     and pc.client_id = p_client;
end;
$$;

-- Runs when a platform booking becomes accepted, whether it is inserted accepted (proposal) or moved
-- to accepted (direct request). Named to run before the labor lock check (bookings_30_labor_lock).
create function private.share_booking_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted'
     and new.origin = 'platform'
     and new.client_id is not null
     and new.provider_client_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform private.share_client_contact(new.provider_client_id, new.client_id);
  end if;
  return new;
end;
$$;

create trigger bookings_25_share_contact
  before insert or update of status on public.bookings
  for each row execute function private.share_booking_contact();

-- Body of the previous version (20261019000005_bookings.sql), with one change: moving a booking to
-- accepted is always checked, because the same-employer match by phone and e-mail uses the contact
-- that is shared at acceptance.
create or replace function private.enforce_booking_labor_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'canceled'
     or not exists (select 1 from public.occupation_policies op
                     where op.occupation_slug = new.occupation_slug and op.labor_lock) then
    return new;
  end if;

  -- Only a change that can add a day for the same parties is checked again. Becoming accepted
  -- is always checked: a request made before acceptance is counted here with the contact shared
  -- at acceptance.
  if tg_op = 'UPDATE'
     and old.status <> 'canceled'
     and not (new.status = 'accepted' and old.status is distinct from 'accepted')
     and new.period = old.period
     and new.provider_id is not distinct from old.provider_id
     and new.client_id is not distinct from old.client_id
     and new.provider_client_id is not distinct from old.provider_client_id
     and new.household_id is not distinct from old.household_id then
    return new;
  end if;

  perform private.check_labor_lock(new.provider_id, new.client_id, new.provider_client_id,
                                   new.household_id, new.period, new.id, null);
  return new;
end;
$$;

-- Only the trigger runs these; the API roles and PUBLIC get no EXECUTE on them.
revoke all on function private.share_client_contact(uuid, uuid) from public, anon, authenticated;
revoke all on function private.share_booking_contact() from public, anon, authenticated;
