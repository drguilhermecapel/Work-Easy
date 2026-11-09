-- A provider keeps at most 50 weekly windows, and two windows of the same weekday cannot overlap.
-- Windows that only touch (one ends when the next starts) are fine.
-- The rules run once per statement over the rows it wrote, so a bulk insert or update is checked as a
-- whole. Writes to one provider's windows wait for each other on the provider row. The lock is "no key
-- update": the foreign key check of the same statement already holds a key share on that row, and a
-- stronger lock would deadlock with another writer doing the same thing.
create function private.guard_availability_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.providers p
   where p.id in (select n.provider_id from new_windows n)
   order by p.id
   for no key update;

  if exists (
    select 1 from public.availability a
     where a.provider_id in (select n.provider_id from new_windows n)
     group by a.provider_id
    having count(*) > 50
  ) then
    raise exception 'availability_limit' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.availability a
      join public.availability b
        on b.provider_id = a.provider_id and b.weekday = a.weekday and b.id > a.id
     where a.provider_id in (select n.provider_id from new_windows n)
       and a.start_time < b.end_time
       and b.start_time < a.end_time
  ) then
    raise exception 'availability_overlap' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

revoke all on function private.guard_availability_rules() from public;

create trigger availability_rules_insert
  after insert on public.availability
  referencing new table as new_windows
  for each statement execute function private.guard_availability_rules();

create trigger availability_rules_update
  after update on public.availability
  referencing new table as new_windows
  for each statement execute function private.guard_availability_rules();

-- Free slots of p_duration_minutes in one São Paulo day, starting every 30 minutes
-- inside the availability windows, outside time off, bookings and shifts.
-- The public booking page calls this for anonymous visitors, so the function stays executable by anon.
-- Only days from today (São Paulo) to a year ahead are computed, the same horizon book_direct accepts.
-- Other days return no slots without reading the windows.
create or replace function public.available_slots(p_provider uuid, p_day date, p_duration_minutes int)
returns tstzrange[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_length interval := make_interval(mins => p_duration_minutes);
begin
  if p_duration_minutes is null or p_duration_minutes not between 5 and 1440
     or not public.is_provider_approved(p_provider)
     or p_day is null
     or p_day < (now() at time zone 'America/Sao_Paulo')::date
     or p_day > (now() at time zone 'America/Sao_Paulo')::date + 365 then
    return '{}';
  end if;

  return coalesce((
    select array_agg(slot order by lower(slot))
      from (
        select distinct tstzrange(s, s + v_length) as slot
          from public.availability a
          cross join lateral generate_series(
            (p_day + a.start_time) at time zone 'America/Sao_Paulo',
            ((p_day + a.end_time) at time zone 'America/Sao_Paulo') - v_length,
            interval '30 minutes') s
         where a.provider_id = p_provider
           and a.weekday = extract(dow from p_day)
      ) slots
     where lower(slot) > now()
       and not exists (select 1 from public.time_off t
                        where t.provider_id = p_provider and t.period && slots.slot)
       and not exists (select 1 from public.bookings b
                        where b.provider_id = p_provider and b.period && slots.slot
                          and b.status in ('requested', 'accepted', 'paid', 'in_progress'))
       and not exists (select 1 from public.shifts sh -- created in 09_care
                        where sh.provider_id = p_provider and sh.period && slots.slot
                          and sh.status in ('assigned', 'checked_in'))
  ), '{}');
end;
$$;
