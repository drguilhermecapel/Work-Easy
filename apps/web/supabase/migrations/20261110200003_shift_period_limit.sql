-- 09 Care, shift length: a shift covers at most 60 calendar days from its start. A plantao is a
-- day or a run of days; a longer engagement is recorded as several shifts. The limit also bounds
-- the labor lock, which checks every week of a shift's period once a caregiver is assigned: an
-- unbounded period would make that check scan years of weeks.

create function private.guard_shift_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if upper(new.period) > lower(new.period) + interval '60 days' then
    raise exception 'shift_too_long' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The name sorts before shifts_10_guard and shifts_20_labor_lock, so a refused period never
-- reaches the lock.
create trigger shifts_05_period_limit
  before insert or update of period on public.shifts
  for each row execute function private.guard_shift_period();

revoke all on function private.guard_shift_period() from public;
