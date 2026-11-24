-- 05 Bookings, labor lock: one employer counts once across all of its households and its CRM entries.
--
-- 1. Households: every household with the same owner is the same employer. A booking in any household
--    owned by an account of the employer counts, as a shift in any such household already did.
-- 2. CRM entries linked to an account carry that account's confirmed phone and e-mail (auth.users). The
--    phone or e-mail typed in the provider's CRM is never used for a linked entry, because the provider
--    can change it. An entry without an account carries the phone and e-mail typed in the entry, as
--    before. Entries that carry the same phone (digits only) or the same e-mail are one employer.
--
-- Accounts still join only through contact data confirmed in auth.users, and the phone typed in a profile
-- is never used. The rule of the week, the days and the advisory lock are unchanged.
-- Redefines private.check_labor_lock with the same signature; the body of 20261110200007 is kept except
-- for the two changes above.

create or replace function private.check_labor_lock(
  p_provider uuid,
  p_client uuid,
  p_provider_client uuid,
  p_household uuid,
  p_period tstzrange,
  p_booking uuid,
  p_shift uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int := private.setting_int('labor_lock_days_per_week', 2);
  v_owner uuid;
  v_me_client uuid;
  v_seeds uuid[] := '{}';
  v_accounts uuid[] := '{}';
  v_cluster uuid[] := '{}';
  v_week date;
  v_days int;
begin
  if p_provider is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('labor_lock:' || p_provider::text, 0));

  -- The household owner and the household are the same employer.
  if p_household is not null then
    select h.owner_id into v_owner from public.households h where h.id = p_household;
  end if;

  -- The account the platform linked to this provider's CRM entry (written only by the platform), when
  -- the check has an entry.
  select pc.client_id into v_me_client
    from public.provider_clients pc
   where pc.id = p_provider_client and pc.provider_id = p_provider;

  -- Accounts this check starts from: the client, the household owner, and the linked account.
  select coalesce(array_agg(x.id), '{}') into v_seeds
    from (
      select p_client as id
      union all
      select v_owner
      union all
      select v_me_client
    ) x
   where x.id is not null;

  -- Every account of the same employer: the seeds themselves, and any account whose confirmed phone
  -- or confirmed e-mail equals the confirmed phone or e-mail of a seed.
  select coalesce(array_agg(distinct m.id), '{}') into v_accounts
    from (
      select s.id from auth.users s where s.id = any (v_seeds)
      union
      select a.id
        from auth.users a
        join auth.users s on s.id = any (v_seeds)
       where a.phone_confirmed_at is not null and s.phone_confirmed_at is not null
         and private.norm_phone(a.phone) <> ''
         and private.norm_phone(a.phone) = private.norm_phone(s.phone)
      union
      select a.id
        from auth.users a
        join auth.users s on s.id = any (v_seeds)
       where a.email_confirmed_at is not null and s.email_confirmed_at is not null
         and lower(trim(coalesce(a.email, ''))) <> ''
         and lower(trim(a.email)) = lower(trim(s.email))
    ) m;

  -- The CRM entries of this provider that stand for the same employer. Each entry carries the contact
  -- that identifies its person: the confirmed phone and e-mail of its account when it is linked, and the
  -- phone and e-mail typed in the entry when it is not. An entry is in the cluster when it is linked to
  -- one of the accounts above, or when it carries the phone or the e-mail of this entry.
  with carried as (
    select pc.id, pc.client_id,
           case when pc.client_id is null then private.norm_phone(pc.phone)
                when u.phone_confirmed_at is not null then private.norm_phone(u.phone)
                else '' end as phone_key,
           case when pc.client_id is null then lower(trim(coalesce(pc.email, '')))
                when u.email_confirmed_at is not null then lower(trim(coalesce(u.email, '')))
                else '' end as email_key
      from public.provider_clients pc
      left join auth.users u on u.id = pc.client_id
     where pc.provider_id = p_provider
  ),
  me as (
    select c.phone_key, c.email_key from carried c where c.id = p_provider_client
  )
  select coalesce(array_agg(c.id), '{}') into v_cluster
    from carried c
   where c.client_id = any (v_accounts)
      or exists (select 1 from me
                  where (me.phone_key <> '' and c.phone_key = me.phone_key)
                     or (me.email_key <> '' and c.email_key = me.email_key));
  if p_provider_client is not null then
    v_cluster := array_append(v_cluster, p_provider_client);
  end if;

  for v_week in
    select distinct date_trunc('week', d)::date from private.local_days(p_period) d
  loop
    select count(distinct day) into v_days
      from (
        select d as day from private.local_days(p_period) d
        union all
        select d
          from public.bookings b
          join public.occupation_policies op on op.occupation_slug = b.occupation_slug and op.labor_lock
          cross join lateral private.local_days(b.period) d
         where b.provider_id = p_provider
           and b.id is distinct from p_booking
           and b.status <> 'canceled'
           and (b.client_id = any (v_accounts)
                or b.provider_client_id = any (v_cluster)
                or b.household_id = p_household
                -- a booking in any household owned by an account of the employer
                or b.household_id in (select h.id from public.households h where h.owner_id = any (v_accounts)))
        union all
        -- shifts and households are created in 09_care
        select d
          from public.shifts s
          join public.households h on h.id = s.household_id
          cross join lateral private.local_days(s.period) d
         where s.provider_id = p_provider
           and s.id is distinct from p_shift
           and s.status in ('assigned', 'checked_in', 'completed')
           and (s.household_id = p_household or h.owner_id = any (v_accounts))
      ) days
     where date_trunc('week', day)::date = v_week;

    if v_days > v_limit then
      raise exception 'labor_lock' using errcode = 'P0001',
        detail = format('week %s: %s days, limit %s', v_week, v_days, v_limit);
    end if;
  end loop;
end;
$$;

revoke all on function private.check_labor_lock(uuid, uuid, uuid, uuid, tstzrange, uuid, uuid) from public;
