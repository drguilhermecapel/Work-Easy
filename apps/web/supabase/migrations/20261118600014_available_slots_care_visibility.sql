-- available_slots shows the occupation by a care shift (assigned or checked in) only to the provider
-- herself and to the accounts that have a household with a care shift of this provider (DD50).
-- Anonymous visitors and other signed-in accounts see those hours as free. book_direct still refuses
-- such a period for every caller (see 20261118500002_direct_booking_care_shift_overlap), so the
-- refusal happens on the write. Occupation by reservations stays visible to everyone, as before (DD29).
-- The body below is copied from 20261118600006_available_slots_anon_no_care.sql; only the shift branch changes.
-- Volatility, security definer, the empty search_path and the grants are unchanged.
-- Free slots of p_duration_minutes in one São Paulo day, starting every 30 minutes
-- inside the availability windows, outside time off, bookings and (for the callers named above) care shifts.
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
       -- care shifts: only the provider and the accounts with a household that holds a shift with this provider
       -- are checked against them. The leading "is not null" keeps the comparison from giving null for an
       -- anonymous visitor (auth.uid() is null there), which would hide the hour instead of showing it free.
       and not ((select auth.uid()) is not null
                and ((select auth.uid()) = p_provider
                     or exists (select 1 from public.shifts s
                                  join public.households h on h.id = s.household_id
                                 where s.provider_id = p_provider and h.owner_id = (select auth.uid())))
                and exists (select 1 from public.shifts sh -- created in 09_care
                             where sh.provider_id = p_provider and sh.period && slots.slot
                               and sh.status in ('assigned', 'checked_in')))
  ), '{}');
end;
$$;
