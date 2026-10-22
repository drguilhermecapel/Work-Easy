-- 03 Providers: provider profile, occupations with registry, service area, documents
-- (private storage bucket), services, availability, time off and the Pro CRM.
-- The public reads providers only through search_providers() and get_provider_page().

create table public.providers (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  bio text check (char_length(bio) <= 2000),
  avatar_path text,
  status public.provider_status not null default 'draft',
  plan public.plan_code not null default 'free',
  base_neighborhood_id uuid references public.neighborhoods (id),
  accepts_platform_requests boolean not null default true,
  created_at timestamptz not null default now()
);

create index providers_status_idx on public.providers (status);
create index providers_base_neighborhood_idx on public.providers (base_neighborhood_id);

create table public.provider_occupations (
  provider_id uuid not null references public.providers (id) on delete cascade,
  occupation_slug text not null references public.occupations (slug) on update cascade,
  is_primary boolean not null default false,
  registry_number text check (char_length(registry_number) <= 40),
  registry_uf char(2) check (registry_uf ~ '^[A-Z]{2}$'),
  registry_status public.registry_status not null default 'not_required',
  -- Per-occupation approval by an admin (admin_set_provider_status approves, at the first
  -- approval, the occupations on file whose policy documents are all accepted;
  -- admin_set_occupation_approval approves the others and the ones added later). Only approved occupations with a registry that was not rejected
  -- are searchable, receive requests or can be booked.
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (provider_id, occupation_slug)
);

create index provider_occupations_occupation_idx on public.provider_occupations (occupation_slug);
create unique index provider_occupations_one_primary on public.provider_occupations (provider_id) where is_primary;

create table public.provider_neighborhoods (
  provider_id uuid not null references public.providers (id) on delete cascade,
  neighborhood_id uuid not null references public.neighborhoods (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider_id, neighborhood_id)
);

create index provider_neighborhoods_neighborhood_idx on public.provider_neighborhoods (neighborhood_id);

create table public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  step public.verification_step not null,
  -- Object name inside the provider-documents bucket: '<provider_id>/<file>'.
  storage_path text not null,
  status public.document_status not null default 'submitted',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  expires_at date,
  rejection_reason text,
  created_at timestamptz not null default now(),
  constraint provider_documents_path_in_own_folder check (storage_path like provider_id::text || '/%')
);

create index provider_documents_provider_idx on public.provider_documents (provider_id, step);
create index provider_documents_status_idx on public.provider_documents (status);
create index provider_documents_reviewed_by_idx on public.provider_documents (reviewed_by);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null,
  occupation_slug text not null,
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 2000),
  price_min_cents int not null check (price_min_cents >= 0),
  price_max_cents int check (price_max_cents >= price_min_cents),
  unit public.price_unit not null,
  duration_minutes int check (duration_minutes between 5 and 1440),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- A service belongs to an occupation the provider has.
  foreign key (provider_id, occupation_slug)
    references public.provider_occupations (provider_id, occupation_slug) on delete cascade
);

create index services_provider_idx on public.services (provider_id, occupation_slug) where active;
create index services_occupation_idx on public.services (occupation_slug);

-- Weekly windows in São Paulo local time.
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

create index availability_provider_idx on public.availability (provider_id, weekday);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  period tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  created_at timestamptz not null default now()
);

create index time_off_provider_idx on public.time_off using gist (provider_id, period);

-- The Pro CRM: clients the provider brought (origin own) or met on the platform.
create table public.provider_clients (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  phone text check (char_length(phone) <= 32),
  email text check (char_length(email) <= 320),
  notes text check (char_length(notes) <= 4000),
  origin public.booking_origin not null default 'own',
  created_at timestamptz not null default now(),
  -- Target of the composite foreign keys that keep other tables inside one CRM.
  unique (id, provider_id)
);

comment on column public.provider_clients.client_id is
  'Platform account of this client. Written only by private.ensure_provider_client (security definer); the API roles cannot set it.';
comment on column public.provider_clients.origin is
  'platform when the entry comes from a real job on the platform, own for clients the provider brought. Server-owned.';

create index provider_clients_provider_idx on public.provider_clients (provider_id);
create index provider_clients_client_idx on public.provider_clients (client_id);
create unique index provider_clients_one_per_account on public.provider_clients (provider_id, client_id)
  where client_id is not null;

alter table public.providers enable row level security;
alter table public.provider_occupations enable row level security;
alter table public.provider_neighborhoods enable row level security;
alter table public.provider_documents enable row level security;
alter table public.services enable row level security;
alter table public.availability enable row level security;
alter table public.time_off enable row level security;
alter table public.provider_clients enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_provider_approved(p_provider uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.providers p where p.id = p_provider and p.status = 'approved');
$$;

revoke all on function public.is_provider_approved(uuid) from public;
grant execute on function public.is_provider_approved(uuid) to anon, authenticated, service_role;

-- An occupation requires a registry number when its policy asks for the
-- registro_profissional verification step.
create function private.requires_registry(p_occupation text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select 'registro_profissional' = any (p.verification)
       from public.occupation_policies p where p.occupation_slug = p_occupation),
    false
  );
$$;

-- Whether an occupation has a policy row. The policy is what says which documents an
-- occupation needs, so an occupation without one can be neither added by a provider nor
-- approved by an admin: the rules fail closed, never open.
create function private.occupation_has_policy(p_occupation text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.occupation_policies p where p.occupation_slug = p_occupation);
$$;

-- Whether a provider serves a neighborhood (listed area or base neighborhood).
create function private.provider_serves(p_provider uuid, p_neighborhood uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.provider_neighborhoods pn
                  where pn.provider_id = p_provider and pn.neighborhood_id = p_neighborhood)
      or exists (select 1 from public.providers p
                  where p.id = p_provider and p.base_neighborhood_id = p_neighborhood);
$$;

-- Status of a provider row, readable by the invoker triggers and storage policies that run
-- as the API role.
create function private.provider_status_of(p_provider uuid)
returns public.provider_status
language sql
stable
security definer
set search_path = ''
as $$
  select p.status from public.providers p where p.id = p_provider;
$$;

create function private.is_provider(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.providers p where p.id = p_user);
$$;

-- A provider offers an occupation to the public (search, page), to requests and to direct
-- bookings only when the provider is approved, the occupation was approved and its
-- registry was not rejected.
create function private.offers_occupation(p_provider uuid, p_occupation text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.providers pr
      join public.provider_occupations po on po.provider_id = pr.id
     where pr.id = p_provider
       and pr.status = 'approved'
       and po.occupation_slug = p_occupation
       and po.approved
       and po.registry_status <> 'rejected'
  );
$$;

-- Care line: an occupation whose policy prices by shift ('plantao').
create function private.is_care_occupation(p_occupation text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select 'plantao' = any (p.price_units)
       from public.occupation_policies p where p.occupation_slug = p_occupation),
    false
  );
$$;

-- Approved provider with at least one approved, non-rejected care occupation.
create function private.is_care_provider(p_provider uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.providers pr
      join public.provider_occupations po on po.provider_id = pr.id
     where pr.id = p_provider
       and pr.status = 'approved'
       and po.approved
       and po.registry_status <> 'rejected'
       and private.is_care_occupation(po.occupation_slug)
  );
$$;

-- Phone numbers compared by their digits (country code and punctuation ignored). Numbers
-- with fewer than 8 digits identify nobody.
create function private.norm_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(d) >= 8 then right(d, 11) else '' end
    from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Owners edit their page; status and plan change only through review and billing.
create function private.guard_provider_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_context() and (
       new.id is distinct from old.id
       or new.status is distinct from old.status
       or new.plan is distinct from old.plan
     ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger providers_guard_update
  before update on public.providers
  for each row execute function private.guard_provider_update();

-- Registry rule: required by the policy -> a number is mandatory and the status starts
-- 'informed'; otherwise 'not_required'. Only admins (via admin_set_registry_status)
-- move it to confirmed/rejected. Approval of the occupation is also server-owned: an
-- occupation added through the API is never approved, it cannot be added while the
-- provider is in review or suspended, and a rejected registry that gets a new number
-- needs a new approval.
create function private.apply_registry_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_required boolean := private.requires_registry(new.occupation_slug);
  v_provider_status public.provider_status;
begin
  new.registry_number := nullif(trim(new.registry_number), '');

  -- An occupation without a policy cannot be taken (become_provider and adding an
  -- occupation both land here), whoever writes the row.
  if (tg_op = 'INSERT' or new.occupation_slug is distinct from old.occupation_slug)
     and not private.occupation_has_policy(new.occupation_slug) then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'policy missing';
  end if;

  if v_required and new.registry_number is null then
    raise exception 'registry_required' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if private.is_client_context() then
      v_provider_status := private.provider_status_of(new.provider_id);
      if v_provider_status is distinct from 'draft' and v_provider_status is distinct from 'approved' then
        raise exception 'not_allowed' using errcode = 'P0001';
      end if;
      new.approved := false;
    end if;
  else
    if private.is_client_context() then
      if new.provider_id is distinct from old.provider_id
         or new.occupation_slug is distinct from old.occupation_slug
         or new.registry_status is distinct from old.registry_status
         or new.approved is distinct from old.approved then
        raise exception 'not_allowed' using errcode = 'P0001';
      end if;
    elsif new.registry_status is distinct from old.registry_status then
      return new; -- explicit decision by an admin function or the service role
    end if;

    -- Only a new number (or UF) sends the registry back to review.
    if new.registry_number is not distinct from old.registry_number
       and new.registry_uf is not distinct from old.registry_uf
       and new.occupation_slug is not distinct from old.occupation_slug then
      return new;
    end if;

    -- A rejected registry does not come back just by typing another number.
    if old.registry_status = 'rejected' then
      new.approved := false;
    end if;
  end if;

  new.registry_status := case when v_required then 'informed' else 'not_required' end;
  return new;
end;
$$;

create trigger provider_occupations_registry
  before insert or update on public.provider_occupations
  for each row execute function private.apply_registry_rule();

-- Owners upload documents; the review fields belong to admins.
create function private.guard_provider_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_context() then
    if tg_op = 'INSERT' then
      new.status := 'submitted';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.rejection_reason := null;
    else
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger provider_documents_guard
  before insert or update on public.provider_documents
  for each row execute function private.guard_provider_document();

-- CRM entries are written by the provider, but who the client is stays server-owned: the
-- link to a platform account (client_id) and the origin are set only by
-- private.ensure_provider_client. The column grants already hide both from the API roles;
-- this trigger keeps the rule if a grant is ever widened.
create function private.guard_provider_client()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_context() then
    if tg_op = 'INSERT' then
      if new.client_id is not null or new.origin is distinct from 'own' then
        raise exception 'not_allowed' using errcode = 'P0001';
      end if;
    elsif new.provider_id is distinct from old.provider_id
          or new.client_id is distinct from old.client_id
          or new.origin is distinct from old.origin then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger provider_clients_guard
  before insert or update on public.provider_clients
  for each row execute function private.guard_provider_client();

-- A service's unit must be one of the units the occupation policy allows.
create function private.check_service_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.occupation_policies p
     where p.occupation_slug = new.occupation_slug and new.unit = any (p.price_units)
  ) then
    raise exception 'unit_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger services_check_unit
  before insert or update of unit, occupation_slug on public.services
  for each row execute function private.check_service_unit();

-- ---------------------------------------------------------------------------
-- Storage: private bucket for verification documents
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-documents', 'provider-documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- A document object that an admin already looked at (accepted or rejected) is evidence: it
-- is neither replaced nor deleted by the owner.
create function private.document_object_locked(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.provider_documents d where d.storage_path = p_name and d.status <> 'submitted');
$$;

-- Objects live under '<provider_id>/...'; the owner and admins read them. Only providers
-- upload. There is no UPDATE policy: every upload is a new object (no upsert over a
-- reviewed file); the owner deletes only objects that were not reviewed yet.
create policy provider_documents_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'provider-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy provider_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_provider((select auth.uid()))
  );

create policy provider_documents_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'provider-documents'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and not private.document_object_locked(name))
      or (select public.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.become_provider(
  p_display_name text,
  p_slug text,
  p_occupation text,
  p_registry_number text default null,
  p_registry_uf text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null)
     or exists (select 1 from public.providers p where p.id = v_uid) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  begin
    insert into public.providers (id, display_name, slug)
    values (v_uid, trim(p_display_name), lower(trim(p_slug)));
  exception when unique_violation then
    raise exception 'slug_taken' using errcode = 'P0001';
  end;

  insert into public.provider_occupations (provider_id, occupation_slug, is_primary, registry_number, registry_uf)
  values (v_uid, p_occupation, true, p_registry_number, upper(nullif(trim(p_registry_uf), '')));

  update public.profiles set role = 'provider' where id = v_uid;

  perform private.audit('provider.created', 'provider', v_uid::text,
                        jsonb_build_object('occupation', p_occupation));
  return v_uid;
end;
$$;

-- Moves a draft to the review queue once every verification step required by the
-- provider's occupations has a submitted or accepted document whose file was uploaded.
create function public.submit_provider_for_review()
returns public.provider_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.provider_status;
  v_missing public.verification_step[];
begin
  select status into v_status from public.providers where id = v_uid for update;
  if v_status is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_status <> 'draft' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct step), '{}') into v_missing
    from (
      select unnest(p.verification) as step
        from public.provider_occupations po
        join public.occupation_policies p on p.occupation_slug = po.occupation_slug
       where po.provider_id = v_uid
    ) required
   where not exists (
     select 1 from public.provider_documents d
      where d.provider_id = v_uid and d.step = required.step and d.status in ('submitted', 'accepted')
        -- a record without the uploaded file does not count
        and exists (select 1 from storage.objects o
                     where o.bucket_id = 'provider-documents' and o.name = d.storage_path)
   );

  if cardinality(v_missing) > 0 then
    raise exception 'documents_missing' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;

  update public.providers set status = 'pending_review' where id = v_uid;
  perform private.audit('provider.submitted', 'provider', v_uid::text, '{}'::jsonb);
  return 'pending_review';
end;
$$;

-- Public search. With rating_ranking the order is by average rating (providers with
-- at least 3 published reviews first), then name; without it the order is a stable
-- daily shuffle and no rating is returned.
create function public.search_providers(
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
     case when v_ranking and coalesce(ra.n, 0) >= 3 then 0 else 1 end,
     case when v_ranking and coalesce(ra.n, 0) >= 3 then ra.avg_rating end desc nulls last,
     case when v_ranking then c.display_name end,
     case when not v_ranking then md5(c.id::text || private.sp_date(now())::text) end,
     c.id
   limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- Public page of an approved provider: only approved occupations (and their services) are
-- shown. Reviews appear only when published, which the review trigger already denies for
-- occupations without rating_ranking.
create function public.get_provider_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider public.providers;
begin
  select * into v_provider from public.providers p where p.slug = p_slug and p.status = 'approved';
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'provider', jsonb_build_object(
      'id', v_provider.id,
      'display_name', v_provider.display_name,
      'slug', v_provider.slug,
      'bio', v_provider.bio,
      'avatar_path', v_provider.avatar_path,
      'plan', v_provider.plan,
      'base_neighborhood', (select jsonb_build_object('id', n.id, 'name', n.name, 'slug', n.slug)
                              from public.neighborhoods n where n.id = v_provider.base_neighborhood_id)
    ),
    'occupations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', o.slug, 'name', o.name, 'is_primary', po.is_primary,
               'registry_name', p.registry_name, 'registry_number', po.registry_number,
               'registry_uf', po.registry_uf, 'registry_status', po.registry_status,
               'rating_ranking', p.rating_ranking)
             order by po.is_primary desc, o.name)
        from public.provider_occupations po
        join public.occupations o on o.slug = po.occupation_slug
        join public.occupation_policies p on p.occupation_slug = po.occupation_slug
       where po.provider_id = v_provider.id and po.approved and po.registry_status <> 'rejected'), '[]'::jsonb),
    'neighborhoods', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'slug', n.slug, 'zone', n.zone) order by n.name)
        from public.provider_neighborhoods pn
        join public.neighborhoods n on n.id = pn.neighborhood_id
       where pn.provider_id = v_provider.id), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'occupation_slug', s.occupation_slug, 'title', s.title,
               'description', s.description, 'price_min_cents', s.price_min_cents,
               'price_max_cents', s.price_max_cents, 'unit', s.unit,
               'duration_minutes', s.duration_minutes)
             order by s.price_min_cents)
        from public.services s
        join public.provider_occupations po on po.provider_id = s.provider_id and po.occupation_slug = s.occupation_slug
                                            and po.approved and po.registry_status <> 'rejected'
       where s.provider_id = v_provider.id and s.active), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', a.weekday, 'start_time', a.start_time, 'end_time', a.end_time)
             order by a.weekday, a.start_time)
        from public.availability a
       where a.provider_id = v_provider.id), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('rating', r.rating, 'comment', r.comment,
                                          'occupation_slug', r.occupation_slug, 'created_at', r.created_at)
             order by r.created_at desc)
        from (
          select rv.rating, rv.comment, b.occupation_slug, rv.created_at
            from public.reviews rv
            join public.bookings b on b.id = rv.booking_id
            join public.occupation_policies p on p.occupation_slug = b.occupation_slug and p.rating_ranking
           where rv.provider_id = v_provider.id and rv.published
           order by rv.created_at desc
           limit 50
        ) r), '[]'::jsonb)
  );
end;
$$;

-- Whether a page address is free. It looks at every provider, approved or not (a draft holds its
-- address, and become_provider answers slug_taken for it), and says only yes or no: it never
-- tells who holds the address. An address that could never be valid (not a slug, over 80
-- characters) is not available.
create function public.slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_slug is not null
         and lower(trim(p_slug)) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
         and char_length(trim(p_slug)) <= 80
         and not exists (select 1 from public.providers p where p.slug = lower(trim(p_slug)));
$$;

revoke all on function public.become_provider(text, text, text, text, text) from public;
revoke all on function public.submit_provider_for_review() from public;
revoke all on function public.slug_available(text) from public;
revoke all on function public.search_providers(text, uuid, int, int) from public;
revoke all on function public.get_provider_page(text) from public;
grant execute on function public.become_provider(text, text, text, text, text) to authenticated;
grant execute on function public.submit_provider_for_review() to authenticated;
grant execute on function public.search_providers(text, uuid, int, int) to anon, authenticated;
grant execute on function public.get_provider_page(text) to anon, authenticated;
grant execute on function public.slug_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies and grants: the owner reads and writes what is theirs; admins read all.
-- ---------------------------------------------------------------------------

create policy providers_select on public.providers
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy providers_update_own on public.providers
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy provider_occupations_select on public.provider_occupations
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));
create policy provider_occupations_insert_own on public.provider_occupations
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy provider_occupations_update_own on public.provider_occupations
  for update to authenticated
  using (provider_id = (select auth.uid())) with check (provider_id = (select auth.uid()));
create policy provider_occupations_delete_own on public.provider_occupations
  for delete to authenticated using (provider_id = (select auth.uid()) and not is_primary);

create policy provider_neighborhoods_select on public.provider_neighborhoods
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));
create policy provider_neighborhoods_insert_own on public.provider_neighborhoods
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy provider_neighborhoods_delete_own on public.provider_neighborhoods
  for delete to authenticated using (provider_id = (select auth.uid()));

create policy provider_documents_select on public.provider_documents
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));
create policy provider_documents_insert_own on public.provider_documents
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy provider_documents_delete_own on public.provider_documents
  for delete to authenticated using (provider_id = (select auth.uid()) and status = 'submitted');

create policy services_select on public.services
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));
create policy services_insert_own on public.services
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy services_update_own on public.services
  for update to authenticated
  using (provider_id = (select auth.uid())) with check (provider_id = (select auth.uid()));
create policy services_delete_own on public.services
  for delete to authenticated using (provider_id = (select auth.uid()));

create policy availability_select on public.availability
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));
create policy availability_insert_own on public.availability
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy availability_update_own on public.availability
  for update to authenticated
  using (provider_id = (select auth.uid())) with check (provider_id = (select auth.uid()));
create policy availability_delete_own on public.availability
  for delete to authenticated using (provider_id = (select auth.uid()));

create policy time_off_select on public.time_off
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));
create policy time_off_insert_own on public.time_off
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy time_off_update_own on public.time_off
  for update to authenticated
  using (provider_id = (select auth.uid())) with check (provider_id = (select auth.uid()));
create policy time_off_delete_own on public.time_off
  for delete to authenticated using (provider_id = (select auth.uid()));

create policy provider_clients_select on public.provider_clients
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));
create policy provider_clients_insert_own on public.provider_clients
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy provider_clients_update_own on public.provider_clients
  for update to authenticated
  using (provider_id = (select auth.uid())) with check (provider_id = (select auth.uid()));
create policy provider_clients_delete_own on public.provider_clients
  for delete to authenticated using (provider_id = (select auth.uid()));

grant select, update on public.providers to authenticated;
grant select, insert, update, delete on public.provider_occupations to authenticated;
grant select, insert, delete on public.provider_neighborhoods to authenticated;
grant select, insert, delete on public.provider_documents to authenticated;
grant select, insert, update, delete on public.services, public.availability, public.time_off to authenticated;

-- CRM: the provider writes the contact data only. client_id (the link to a platform
-- account) and origin are set by private.ensure_provider_client, never by the API role.
grant select, delete on public.provider_clients to authenticated;
grant insert (provider_id, name, phone, email, notes) on public.provider_clients to authenticated;
grant update (name, phone, email, notes) on public.provider_clients to authenticated;

revoke all on all functions in schema private from public;
-- Called by invoker triggers and storage policies that run as the API role.
grant execute on function private.requires_registry(text) to authenticated;
grant execute on function private.occupation_has_policy(text) to authenticated;
grant execute on function private.provider_status_of(uuid) to authenticated;
grant execute on function private.is_provider(uuid) to authenticated;
grant execute on function private.document_object_locked(text) to authenticated;
grant execute on function private.norm_phone(text) to authenticated;
