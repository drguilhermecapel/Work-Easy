-- Booking requests. A request nobody answers within 48 hours (or whose slot has passed) is
-- canceled, so it stops holding the provider's agenda. The sweep runs every 15 minutes, and
-- book_direct also sweeps the provider it is booking so an expired request never blocks a new one.
-- The per-client cap is now checked under a lock on the client's profile row: concurrent requests
-- from the same client used to read the count before each other's inserts were committed.

create function private.expire_booking_requests(p_provider uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.bookings
     set status = 'canceled',
         canceled_reason = 'request_expired'
   where status = 'requested'
     and (created_at < now() - interval '48 hours' or lower(period) <= now())
     and (p_provider is null or provider_id = p_provider);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.expire_booking_requests(uuid) from public;

select cron.schedule('workeasy-expire-booking-requests', '*/15 * * * *', 'select private.expire_booking_requests()');

-- Direct booking by a client inside the provider's availability and outside time off.
create or replace function public.book_direct(
  p_provider uuid,
  p_service uuid,
  p_period tstzrange,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_service public.services;
  v_client public.profiles;
  v_start timestamp;
  v_end timestamp;
  v_booking uuid;
begin
  -- Held until the end of the call: concurrent requests of the same client wait here, so each
  -- count below sees the requests the others have committed.
  select * into v_client from public.profiles where id = v_uid and deleted_at is null for update;
  if not found or v_uid = p_provider or not public.is_provider_approved(p_provider) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into v_service from public.services where id = p_service and provider_id = p_provider and active;
  if not found or not private.offers_occupation(p_provider, v_service.occupation_slug) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  perform private.expire_booking_requests(p_provider);

  -- Open requests hold the provider's agenda and count for the labor lock: cap them.
  if (select count(*) from public.bookings b
       where b.client_id = v_uid and b.status = 'requested') >= 10
     or (select count(*) from public.bookings b
          where b.client_id = v_uid and b.provider_id = p_provider and b.status = 'requested') >= 3 then
    raise exception 'booking_limit' using errcode = 'P0001';
  end if;

  if p_period is null or isempty(p_period) or lower(p_period) is null or upper(p_period) is null
     or lower(p_period) <= now() then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  v_start := lower(p_period) at time zone 'America/Sao_Paulo';
  v_end := upper(p_period) at time zone 'America/Sao_Paulo';
  if v_start::date <> v_end::date
     or not exists (
       select 1 from public.availability a
        where a.provider_id = p_provider
          and a.weekday = extract(dow from v_start)
          and a.start_time <= v_start::time
          and v_end::time <= a.end_time
     )
     or exists (select 1 from public.time_off t where t.provider_id = p_provider and t.period && p_period) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  begin
    insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, service_id,
                                 period, price_cents, status, origin, notes)
    values (v_uid, private.ensure_provider_client(p_provider, v_client), p_provider, v_service.occupation_slug,
            v_service.id, p_period, v_service.price_min_cents, 'requested', 'platform', p_notes)
    returning id into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  return v_booking;
end;
$$;
