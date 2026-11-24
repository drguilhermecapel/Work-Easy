-- 05 Bookings, labor lock: a request is not refused on creation because of the confirmed contact of its
-- client's account. The confirmed phone and e-mail of a linked CRM entry are compared with the other entries
-- only when the booking becomes accepted (a provider accepts it, or a client accepts a proposal, or the
-- provider creates its own job, which is born accepted). A request inserted as requested is checked on the
-- accounts (the client, the household owner, and the accounts with a confirmed contact in common) and on the
-- CRM entries that carry no account, as before.
--
-- Before the acceptance-time contact (20261110400001), a request never matched by phone: the CRM entry of a
-- platform client had no phone until acceptance. This keeps that behavior and states it in the rule.
--
-- private.labor_lock_check holds the rule; private.check_labor_lock keeps its signature and always compares
-- the contacts (the acceptance, the care shifts). private.enforce_booking_labor_lock passes false only for a
-- booking inserted as requested. The rest of the rule is unchanged.

create or replace function private.labor_lock_check(
  p_provider uuid,
  p_client uuid,
  p_provider_client uuid,
  p_household uuid,
  p_period tstzrange,
  p_booking uuid,
  p_shift uuid,
  p_match_contacts boolean
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
  -- one of the accounts above, or when, with p_match_contacts, it carries the phone or the e-mail of this
  -- entry. Without p_match_contacts (a request on creation), only two entries without an account are
  -- compared by what they typed.
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
    select c.id, c.client_id, c.phone_key, c.email_key from carried c where c.id = p_provider_client
  )
  select coalesce(array_agg(c.id), '{}') into v_cluster
    from carried c
   where c.client_id = any (v_accounts)
      or exists (select 1 from me
                  where (p_match_contacts or (me.client_id is null and c.client_id is null))
                    and ((me.phone_key <> '' and c.phone_key = me.phone_key)
                      or (me.email_key <> '' and c.email_key = me.email_key)));
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

revoke all on function private.labor_lock_check(uuid, uuid, uuid, uuid, tstzrange, uuid, uuid, boolean) from public;

-- Same signature as before. The acceptance and the care shifts call it, and they compare the contacts.
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
begin
  perform private.labor_lock_check(p_provider, p_client, p_provider_client, p_household, p_period,
                                   p_booking, p_shift, true);
end;
$$;

revoke all on function private.check_labor_lock(uuid, uuid, uuid, uuid, tstzrange, uuid, uuid) from public;

-- Body of 20261110400001_contact_at_acceptance.sql, with one change in the last check: a booking inserted as
-- requested is checked without comparing the confirmed contact of a linked account.
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

  perform private.labor_lock_check(new.provider_id, new.client_id, new.provider_client_id,
                                   new.household_id, new.period, new.id, null,
                                   not (tg_op = 'INSERT' and new.status = 'requested'));
  return new;
end;
$$;
