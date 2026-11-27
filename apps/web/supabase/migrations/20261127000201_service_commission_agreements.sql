-- The service split is separate from transport. No category, provider or flag is activated by this migration.
insert into public.platform_settings (key,value) values ('service_recurring_commission_enabled','false')
on conflict (key) do nothing;

create table private.service_commission_releases (
  occupation_slug text not null references public.occupations(slug),
  version text not null check (length(btrim(version)) between 1 and 80),
  terms_reference text not null check (terms_reference ~ '^https://[^[:space:]]+$' and length(terms_reference) <= 300),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at > starts_at),
  primary key (occupation_slug, version),
  exclude using gist (occupation_slug with =, tstzrange(starts_at,ends_at,'[)') with &&)
);
create table private.service_commission_agreements (
  provider_id uuid not null references public.providers(id) on delete cascade,
  occupation_slug text not null,
  version text not null,
  accepted_at timestamptz not null,
  applies_from timestamptz not null check (applies_from >= accepted_at),
  primary key (provider_id,occupation_slug,version),
  foreign key (occupation_slug,version) references private.service_commission_releases
);
revoke all on private.service_commission_releases, private.service_commission_agreements from public, anon, authenticated;

-- A published version can only be closed to future offers. Amend terms with a new version.
create function private.guard_service_commission_release() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or (to_jsonb(new)-'ends_at') is distinct from (to_jsonb(old)-'ends_at')
     or new.ends_at is null or new.ends_at < statement_timestamp()
     or (old.ends_at is not null and new.ends_at > old.ends_at) then
    raise exception 'immutable_commission_terms' using errcode='P0001';
  end if;
  return new;
end $$;
create trigger service_commission_release_version before update or delete on private.service_commission_releases
for each row execute function private.guard_service_commission_release();

-- The server binds a policy to a proposal at issue or a direct booking at request, not to its later payment.
alter table public.proposals add column service_fee_policy_version text;
alter table public.bookings add column service_fee_policy_version text,
  add column service_fee_covered_by_pro boolean not null default false;
create function private.agreed_service_commission(p_provider uuid,p_occupation text,p_at timestamptz)
returns text language sql stable security definer set search_path='' as $$
  select a.version from private.service_commission_agreements a
  join private.service_commission_releases r using (occupation_slug,version)
  join public.occupation_policies op using (occupation_slug)
  where a.provider_id=p_provider and a.occupation_slug=p_occupation and a.accepted_at<=p_at
    and tstzrange(r.starts_at,r.ends_at,'[)') @> p_at
    and op.billing='comissao_primeiro_servico' and op.confidence='conferido'
$$;
create function private.can_sell_service_pro(p_provider uuid)
returns boolean language sql stable security definer set search_path='' as $$
  -- Accounts with no rollout keep their existing Pro option. A mixed provider may buy it for legacy occupations only.
  select not exists(select 1 from private.service_commission_agreements a where a.provider_id=p_provider)
     or exists(
       select 1 from public.provider_occupations po
       where po.provider_id=p_provider and private.offers_occupation(p_provider,po.occupation_slug)
       and not exists (
         select 1 from private.service_commission_agreements a
         join private.service_commission_releases r using (occupation_slug,version)
         join public.occupation_policies op using (occupation_slug)
         where a.provider_id=p_provider and a.occupation_slug=po.occupation_slug
           and tstzrange(r.starts_at,r.ends_at,'[)') @> now()
           and op.billing='comissao_primeiro_servico' and op.confidence='conferido'
       )
     )
$$;
create function public.service_pro_sales_allowed(p_provider uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is distinct from p_provider and not private.is_service_role() then
    raise exception 'not_allowed' using errcode='P0001';
  end if;
  return private.can_sell_service_pro(p_provider);
end $$;
create function public.service_commission_options()
returns table(occupation_slug text, version text, terms_reference text, accepted_at timestamptz, applies_from timestamptz)
language sql stable security definer set search_path='' as $$
  select r.occupation_slug,r.version,r.terms_reference,a.accepted_at,a.applies_from
  from private.service_commission_releases r
  join public.occupation_policies op using(occupation_slug)
  left join private.service_commission_agreements a on a.provider_id=auth.uid()
    and a.occupation_slug=r.occupation_slug and a.version=r.version
  where private.offers_occupation(auth.uid(),r.occupation_slug)
    and tstzrange(r.starts_at,r.ends_at,'[)') @> now()
    and op.billing='comissao_primeiro_servico' and op.confidence='conferido'
    and (a.provider_id is not null or
        (private.setting_bool('commission_enabled',false) and private.setting_bool('service_recurring_commission_enabled',false)))
  order by r.occupation_slug
$$;
create function public.accept_service_commission(p_occupation text,p_version text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare
  v_provider uuid := auth.uid();
  v_when timestamptz := statement_timestamp();
  v_start timestamptz;
  v_subscription public.subscriptions;
begin
  if v_provider is null then raise exception 'not_allowed' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-billing:'||v_provider::text,0));
  select applies_from into v_start from private.service_commission_agreements where
    provider_id=v_provider and occupation_slug=p_occupation and version=p_version;
  if found then return v_start; end if;
  if not exists(select 1 from public.service_commission_options() o where
                o.occupation_slug=p_occupation and o.version=p_version) then
    raise exception 'service_policy_unavailable' using errcode='P0001';
  end if;
  select * into v_subscription from public.subscriptions where provider_id=v_provider for update;
  v_start := greatest(v_when,coalesce(v_subscription.current_period_end,v_when));
  insert into private.service_commission_agreements values(v_provider,p_occupation,p_version,v_when,v_start);
  -- A real remote recurrence must first be canceled by the normal Asaas flow. The entire acceptance rolls back on conflict.
  if not private.can_sell_service_pro(v_provider) and v_subscription.asaas_subscription_id is not null
     and v_subscription.status <> 'canceled' then
    raise exception 'cancel_pro_renewal_first' using errcode='P0001';
  end if;
  return v_start;
end $$;

-- Serialize a new remote subscription claim against accepting the last migrated occupation.
-- subscriptions-manage compensates a rejected local claim by removing the newly created remote recurrence.
create function private.guard_service_pro_sale() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.asaas_subscription_id is not null and (tg_op='INSERT' or
     old.asaas_subscription_id is distinct from new.asaas_subscription_id) then
    perform pg_advisory_xact_lock(hashtextextended('service-billing:'||new.provider_id::text,0));
    if not private.can_sell_service_pro(new.provider_id) then
      raise exception 'service_commission_only' using errcode='P0001';
    end if;
  end if;
  return new;
end $$;
create trigger subscriptions_12_service_model before insert or update on public.subscriptions
for each row execute function private.guard_service_pro_sale();

create function private.stamp_proposal_service_policy() returns trigger language plpgsql security definer set search_path='' as $$
begin
  select private.agreed_service_commission(new.provider_id,r.occupation_slug,statement_timestamp())
    into new.service_fee_policy_version from public.requests r where r.id=new.request_id;
  return new;
end $$;
create trigger proposals_05_service_policy before insert on public.proposals
for each row execute function private.stamp_proposal_service_policy();

create or replace function private.set_booking_fee() returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_offered_at timestamptz := statement_timestamp();
begin
  if tg_op='INSERT' then
    new.service_fee_policy_version := null;
    new.service_fee_covered_by_pro := false;
    if new.origin='platform' then
      if new.proposal_id is not null then
        select p.service_fee_policy_version,p.created_at into new.service_fee_policy_version,v_offered_at
        from public.proposals p join public.requests r on r.id=p.request_id
        where p.id=new.proposal_id and p.provider_id=new.provider_id and r.occupation_slug=new.occupation_slug;
      else
        new.service_fee_policy_version := private.agreed_service_commission(new.provider_id,new.occupation_slug,statement_timestamp());
      end if;
    end if;
    if new.service_fee_policy_version is not null then
      select exists(select 1 from private.service_commission_agreements a where
        a.provider_id=new.provider_id and a.occupation_slug=new.occupation_slug
        and a.version=new.service_fee_policy_version and a.applies_from>a.accepted_at and a.applies_from>v_offered_at)
        into new.service_fee_covered_by_pro;
    end if;
    new.platform_fee_cents:=0;
  end if;
  if new.status='accepted' and (tg_op='INSERT' or old.status is distinct from 'accepted') then
    if new.service_fee_policy_version is null then
      new.platform_fee_cents := private.platform_fee(new.id,new.client_id,new.provider_client_id,new.provider_id,
                                                     new.occupation_slug,new.origin,new.price_cents);
    elsif not new.service_fee_covered_by_pro and private.setting_bool('commission_enabled',false) and private.setting_bool('service_recurring_commission_enabled',false)
      and exists(select 1 from public.occupation_policies where occupation_slug=new.occupation_slug
                 and billing='comissao_primeiro_servico' and confidence='conferido') then
      new.platform_fee_cents:=new.price_cents/10;
    else
      new.platform_fee_cents:=0;
    end if;
  end if;
  return new;
end $$;

create or replace function public.compute_platform_fee(p_booking uuid) returns int
language plpgsql stable security definer set search_path='' as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id=p_booking;
  if not found or not (private.is_service_role() or public.is_admin() or
    coalesce(auth.uid() in (b.provider_id,b.client_id),false)) then
    raise exception 'not_allowed' using errcode='P0001';
  end if;
  if b.status<>'requested' then return b.platform_fee_cents; end if;
  if b.service_fee_policy_version is not null then
    if not b.service_fee_covered_by_pro and private.setting_bool('commission_enabled',false) and private.setting_bool('service_recurring_commission_enabled',false)
      and exists(select 1 from public.occupation_policies where occupation_slug=b.occupation_slug
                 and billing='comissao_primeiro_servico' and confidence='conferido') then return b.price_cents/10; end if;
    return 0;
  end if;
  return private.platform_fee(b.id,b.client_id,b.provider_client_id,b.provider_id,b.occupation_slug,b.origin,b.price_cents);
end $$;

revoke all on function public.service_commission_options(), public.service_pro_sales_allowed(uuid), public.accept_service_commission(text,text) from public,anon,authenticated;
grant execute on function public.service_commission_options(), public.accept_service_commission(text,text) to authenticated;
grant execute on function public.service_pro_sales_allowed(uuid) to authenticated,service_role;
revoke all on function private.agreed_service_commission(uuid,text,timestamptz),private.can_sell_service_pro(uuid),private.guard_service_commission_release(),private.guard_service_pro_sale(),private.stamp_proposal_service_policy() from public,anon,authenticated;

-- Only legacy proposals consume the free allowance of a mixed account.
create or replace function private.check_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
  v_active int;
  v_plan public.plan_code;
  v_allowance int;
  v_used int;
begin
  -- Only a new proposal, or one becoming active again, takes a slot.
  if tg_op = 'UPDATE'
     and not (new.status in ('sent', 'accepted') and old.status not in ('sent', 'accepted')) then
    return new;
  end if;

  select * into v_request from public.requests where id = new.request_id for update;

  if v_request.status is distinct from 'open' or v_request.expires_at <= now() then
    raise exception 'request_not_open' using errcode = 'P0001';
  end if;

  if v_request.client_id = new.provider_id
     or not private.offers_occupation(new.provider_id, v_request.occupation_slug)
     or not private.provider_serves(new.provider_id, v_request.neighborhood_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select count(*) into v_active
    from public.proposals p
   where p.request_id = new.request_id and p.status in ('sent', 'accepted') and p.id <> new.id;

  if v_active >= private.setting_int('proposal_limit', 3) then
    raise exception 'proposal_limit' using errcode = 'P0001';
  end if;

  -- Free allowance. Counted when the proposal is created (a withdrawn one that comes back was
  -- already counted), only for API callers: the server side (seeds, support) is not limited.
  -- An allowance of 0 or less means no limit. This function is security definer, so
  -- private.is_client_context() (which reads current_user) would see the owner here; the
  -- SET ROLE value is what a definer call leaves untouched.
  if tg_op = 'INSERT' and current_setting('role', true) in ('anon', 'authenticated') then
    select pr.plan into v_plan from public.providers pr where pr.id = new.provider_id;
    v_allowance := private.setting_int('free_proposals_per_month', 5);
    if new.service_fee_policy_version is null and coalesce(v_plan, 'free') = 'free' and v_allowance > 0 then
      -- Two simultaneous proposals to different requests must not both slip under the limit
      perform pg_advisory_xact_lock(hashtextextended('free_proposals:' || new.provider_id::text, 0));
      select count(*) into v_used
        from public.proposals p
       where p.provider_id = new.provider_id
         and p.service_fee_policy_version is null
         and p.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
      if v_used >= v_allowance then
        raise exception 'free_proposal_limit' using errcode = 'P0001',
          detail = format('%s proposals this month, allowance %s', v_used, v_allowance);
      end if;
    end if;
  end if;
  return new;
end;
$$;
