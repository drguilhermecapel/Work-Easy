-- Reporting and blocking (docs/lojas/google-play.md B04 and M06, docs/lojas/app-store.md B4).
-- The stores ask that an app with content written by users lets anyone report that content and
-- block who wrote it. What users write and others read here: provider profiles, reviews and
-- requests.
--
--   * content_reports: a report of a provider, a review, a request or an account, read by the
--     administration, which closes it as 'actioned' or 'dismissed'. Written only through
--     report_content() (one open report per target and reporter, 10 reports a day).
--   * user_blocks: one account blocks another. A block works both ways for what the platform
--     mediates: neither finds the other in the search, the provider does not see the client's
--     requests or get told of them, and proposals and bookings between the two are refused.
--     What already exists (an accepted booking, a payment) is not touched: cancelling keeps its
--     own rules.
--   * The provider search also stops ordering by name. With a rating ranking, providers with fewer
--     than 3 reviews came in alphabetical order, so a name starting with "A" was always first
--     (docs/operacao/01, 16.1). They now rotate by day, like the occupations without ranking.

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------

create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  -- What the blocker saw when blocking: a provider (by name) or the author of a request
  origin text not null check (origin in ('provider', 'request')),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- The blocked side never learns of the block: only the blocker (and the administration) reads it.
create policy user_blocks_select on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;
grant all on public.user_blocks to service_role;

create function private.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a));
$$;

create function private.add_block(p_blocked uuid, p_origin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or p_blocked is null or p_blocked = v_me then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('blocks:' || v_me::text, 0));
  if (select count(*) from public.user_blocks b where b.blocker_id = v_me) >= 200 then
    raise exception 'block_limit' using errcode = 'P0001';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id, origin)
  values (v_me, p_blocked, p_origin)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

-- A client (or anyone signed in) blocks a provider that is public.
create function public.block_provider(p_provider uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.providers pr where pr.id = p_provider and pr.status = 'approved') then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.add_block(p_provider, 'provider');
end;
$$;

-- A provider blocks whoever wrote a request. The provider never learns the client's id: the
-- request is the handle. Only a request the provider could answer, or already answered, counts.
create function public.block_request_author(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_me uuid := (select auth.uid());
begin
  select r.client_id into v_client
    from public.requests r
   where r.id = p_request
     and (exists (select 1 from public.proposals p where p.request_id = r.id and p.provider_id = v_me)
          or exists (select 1 from public.providers me
                      where me.id = v_me and me.status = 'approved'
                        and exists (select 1 from public.provider_occupations po
                                     where po.provider_id = me.id and po.occupation_slug = r.occupation_slug and po.approved)
                        and private.provider_serves(me.id, r.neighborhood_id)));
  if v_client is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.add_block(v_client, 'request');
end;
$$;

create function public.unblock_user(p_blocked uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.user_blocks where blocker_id = (select auth.uid()) and blocked_id = p_blocked;
$$;

-- The blocker's list, with a name only where the name is public (an approved provider).
create function public.my_blocks()
returns table (blocked_id uuid, label text, origin text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id,
         case when b.origin = 'provider' then pr.display_name end,
         b.origin,
         b.created_at
    from public.user_blocks b
    left join public.providers pr on pr.id = b.blocked_id and pr.status = 'approved'
   where b.blocker_id = (select auth.uid())
   order by b.created_at desc;
$$;

revoke all on function private.blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function private.add_block(uuid, text) from public, anon, authenticated;
revoke all on function public.block_provider(uuid) from public, anon;
revoke all on function public.block_request_author(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.block_provider(uuid) to authenticated;
grant execute on function public.block_request_author(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;

-- Proposals and bookings between two accounts with a block are refused, whoever blocked.
create function private.refuse_blocked_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.blocked_between(new.provider_id, (select r.client_id from public.requests r where r.id = new.request_id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function private.refuse_blocked_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origin = 'platform' and private.blocked_between(new.provider_id, new.client_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.refuse_blocked_proposal() from public, anon, authenticated;
revoke all on function private.refuse_blocked_booking() from public, anon, authenticated;

create trigger proposals_15_blocked
  before insert on public.proposals
  for each row execute function private.refuse_blocked_proposal();

create trigger bookings_15_blocked
  before insert on public.bookings
  for each row execute function private.refuse_blocked_booking();

-- A provider does not see the requests of a client with a block between them.
create or replace function public.open_requests_for_me()
returns table (
  id uuid,
  occupation_slug text,
  neighborhood_id uuid,
  neighborhood_name text,
  description text,
  preferred_dates text,
  urgent boolean,
  expires_at timestamptz,
  created_at timestamptz,
  proposal_count int,
  my_proposal_id uuid,
  my_proposal_status public.proposal_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.occupation_slug, r.neighborhood_id, n.name, r.description, r.preferred_dates,
         r.urgent, r.expires_at, r.created_at,
         (select count(*)::int from public.proposals p
           where p.request_id = r.id and p.status in ('sent', 'accepted')),
         mine.id, mine.status
    from public.providers me
    join public.requests r
      on r.status = 'open' and r.expires_at > now() and r.client_id <> me.id
    join public.neighborhoods n on n.id = r.neighborhood_id
    left join public.proposals mine on mine.request_id = r.id and mine.provider_id = me.id
   where me.id = (select auth.uid())
     and me.status = 'approved'
     and me.accepts_platform_requests
     and exists (select 1 from public.provider_occupations po
                  where po.provider_id = me.id and po.occupation_slug = r.occupation_slug
                    and po.approved and po.registry_status <> 'rejected')
     and private.provider_serves(me.id, r.neighborhood_id)
     and not private.blocked_between(me.id, r.client_id)
   order by r.urgent desc, r.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Provider search: no alphabetical order, and no provider with a block
-- ---------------------------------------------------------------------------

create or replace function public.search_providers(
  p_occupation text,
  p_neighborhood uuid default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  provider_id uuid,
  display_name text,
  slug text,
  bio text,
  avatar_path text,
  rating_avg numeric,
  rating_count int,
  price_min_cents int,
  price_max_cents int,
  unit public.price_unit,
  registry_status public.registry_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ranking boolean;
  v_me uuid := (select auth.uid());
begin
  select p.rating_ranking into v_ranking from public.occupation_policies p where p.occupation_slug = p_occupation;
  if not found then
    return;
  end if;

  return query
  with candidates as (
    select pr.id, pr.display_name, pr.slug, pr.bio, pr.avatar_path, po.registry_status
      from public.providers pr
      join public.provider_occupations po on po.provider_id = pr.id and po.occupation_slug = p_occupation
                                          and po.approved and po.registry_status <> 'rejected'
      join public.profiles pf on pf.id = pr.id and pf.deleted_at is null
     where pr.status = 'approved'
       and (p_neighborhood is null or private.provider_serves(pr.id, p_neighborhood))
       and not private.blocked_between(pr.id, v_me)
  ),
  ratings as (
    select r.provider_id, round(avg(r.rating), 2) as avg_rating, count(*)::int as n
      from public.reviews r
      join public.bookings b on b.id = r.booking_id and b.occupation_slug = p_occupation
     where r.published and r.provider_id in (select id from candidates)
     group by r.provider_id
  )
  select c.id,
         c.display_name,
         c.slug,
         c.bio,
         c.avatar_path,
         case when v_ranking then ra.avg_rating end,
         case when v_ranking then coalesce(ra.n, 0) end,
         price.min_cents,
         price.max_cents,
         price.unit,
         c.registry_status
    from candidates c
    left join ratings ra on ra.provider_id = c.id
    left join lateral (
      select s.price_min_cents as min_cents, coalesce(s.price_max_cents, s.price_min_cents) as max_cents, s.unit
        from public.services s
       where s.provider_id = c.id and s.occupation_slug = p_occupation and s.active
       order by s.price_min_cents
       limit 1
    ) price on true
   order by
     -- With a ranking, providers with 3 or more reviews come first, best average first
     case when v_ranking and coalesce(ra.n, 0) >= 3 then 0 else 1 end,
     case when v_ranking and coalesce(ra.n, 0) >= 3 then ra.avg_rating end desc nulls last,
     -- Everyone else (and ties) rotates by day: stable within a day, so pages do not repeat
     md5(c.id::text || private.sp_date(now())::text),
     c.id
   limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('provider', 'review', 'request')),
  target_id uuid not null,
  -- The account behind the target when the report was made, so a deleted target can still be acted on
  target_user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('ofensivo', 'assedio', 'fraude', 'spam', 'conteudo_improprio', 'outro')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution_note text check (char_length(resolution_note) <= 1000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index content_reports_one_open_uidx on public.content_reports (reporter_id, target_type, target_id)
  where status = 'open';
create index content_reports_status_idx on public.content_reports (status, created_at desc);
create index content_reports_target_user_idx on public.content_reports (target_user_id);
create index content_reports_resolved_by_idx on public.content_reports (resolved_by);

alter table public.content_reports enable row level security;

create policy content_reports_select on public.content_reports
  for select to authenticated using (reporter_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.content_reports from anon, authenticated;
grant select on public.content_reports to authenticated;
grant all on public.content_reports to service_role;

create function public.report_content(p_type text, p_target uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_target_user uuid;
  v_details text := nullif(trim(coalesce(p_details, '')), '');
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('ofensivo', 'assedio', 'fraude', 'spam', 'conteudo_improprio', 'outro')
     or char_length(coalesce(v_details, '')) > 1000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- Only what the reporter can actually see can be reported
  if p_type = 'provider' then
    select pr.id into v_target_user from public.providers pr where pr.id = p_target and pr.status = 'approved';
  elsif p_type = 'review' then
    select coalesce(rv.client_id, rv.provider_id) into v_target_user
      from public.reviews rv where rv.id = p_target and rv.published;
  elsif p_type = 'request' then
    select r.client_id into v_target_user
      from public.requests r
     where r.id = p_target
       and (exists (select 1 from public.proposals p where p.request_id = r.id and p.provider_id = v_me)
            or exists (select 1 from public.providers me
                        where me.id = v_me and me.status = 'approved'
                          and exists (select 1 from public.provider_occupations po
                                       where po.provider_id = me.id and po.occupation_slug = r.occupation_slug and po.approved)
                          and private.provider_serves(me.id, r.neighborhood_id)));
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target_user = v_me then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('reports:' || v_me::text, 0));
  if (select count(*) from public.content_reports c
       where c.reporter_id = v_me and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;

  select c.id into v_id from public.content_reports c
   where c.reporter_id = v_me and c.target_type = p_type and c.target_id = p_target and c.status = 'open';
  if v_id is not null then
    return v_id;
  end if;

  insert into public.content_reports (reporter_id, target_type, target_id, target_user_id, reason, details)
  values (v_me, p_type, p_target, v_target_user, p_reason, v_details)
  returning id into v_id;
  return v_id;
end;
$$;

-- Queue of the administration, with what was reported as it is now (null once it is gone).
create function public.admin_list_reports(p_status text default 'open', p_limit int default 20, p_offset int default 0)
returns table (
  id uuid,
  created_at timestamptz,
  status text,
  target_type text,
  target_id uuid,
  target_user_id uuid,
  target_label text,
  target_text text,
  reason text,
  details text,
  reporter_id uuid,
  resolution_note text,
  resolved_at timestamptz,
  open_reports_on_target bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select c.id, c.created_at, c.status, c.target_type, c.target_id, c.target_user_id,
           case c.target_type
             when 'provider' then (select pr.display_name from public.providers pr where pr.id = c.target_id)
             when 'review' then (select pr.display_name from public.reviews rv join public.providers pr on pr.id = rv.provider_id where rv.id = c.target_id)
             when 'request' then (select r.occupation_slug from public.requests r where r.id = c.target_id)
           end,
           case c.target_type
             when 'provider' then (select pr.bio from public.providers pr where pr.id = c.target_id)
             when 'review' then (select rv.comment from public.reviews rv where rv.id = c.target_id)
             when 'request' then (select r.description from public.requests r where r.id = c.target_id)
           end,
           c.reason, c.details, c.reporter_id, c.resolution_note, c.resolved_at,
           (select count(*) from public.content_reports o
             where o.target_type = c.target_type and o.target_id = c.target_id and o.status = 'open')
      from public.content_reports c
     where p_status is null or c.status = p_status
     order by c.created_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 100))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- Closes a report. What is done about the content (unpublishing a review, suspending a provider)
-- uses the administration tools that already exist; this records the decision.
create function public.admin_resolve_report(p_report uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform private.require_admin();
  if p_status is null or p_status not in ('actioned', 'dismissed') or char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.content_reports
     set status = p_status, resolution_note = v_note, resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_report and status = 'open';
  if not found then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  perform private.audit('report.resolved', 'content_report', p_report::text, jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.report_content(text, uuid, text, text) from public, anon;
revoke all on function public.admin_list_reports(text, int, int) from public, anon;
revoke all on function public.admin_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
grant execute on function public.admin_list_reports(text, int, int) to authenticated, service_role;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated, service_role;

-- When an account is deleted (anonymized), what it wrote in reports goes with it and its blocks end.
create function private.clear_reports_and_blocks_on_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.content_reports set details = null, reporter_id = null where reporter_id = new.id;
    delete from public.user_blocks where blocker_id = new.id or blocked_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function private.clear_reports_and_blocks_on_deletion() from public, anon, authenticated;

create trigger profiles_70_clear_reports_and_blocks
  after update of deleted_at on public.profiles
  for each row execute function private.clear_reports_and_blocks_on_deletion();
