-- 07 Quotes and reviews. A quote is shared by its public token (no login); a review is
-- accepted only for a finished job paid through the app.

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null default auth.uid() references public.providers (id) on delete cascade,
  provider_client_id uuid references public.provider_clients (id) on delete set null,
  client_name text check (char_length(client_name) <= 200),
  client_phone text check (char_length(client_phone) <= 32),
  title text not null check (char_length(title) between 2 and 200),
  -- [{description, quantity, unit_price_cents}]
  items jsonb not null default '[]',
  total_cents int not null default 0,
  valid_until date,
  notes text check (char_length(notes) <= 4000),
  status public.quote_status not null default 'draft',
  public_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_provider_idx on public.quotes (provider_id, created_at desc);
create index quotes_provider_client_idx on public.quotes (provider_client_id);

alter table public.payments
  add constraint payments_quote_id_fkey foreign key (quote_id) references public.quotes (id) on delete set null;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  client_id uuid default auth.uid() references public.profiles (id) on delete set null,
  provider_id uuid references public.providers (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create index reviews_provider_idx on public.reviews (provider_id, created_at desc) where published;
create index reviews_client_idx on public.reviews (client_id);

alter table public.quotes enable row level security;
alter table public.reviews enable row level security;

-- ---------------------------------------------------------------------------
-- Quote triggers
-- ---------------------------------------------------------------------------

-- Items are validated and the total is always recomputed on the server.
create function private.compute_quote_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_total numeric := 0;
begin
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) > 200 then
    raise exception 'quote items must be an array of at most 200 items' using errcode = '23514';
  end if;
  for v_item in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(v_item -> 'description') <> 'string'
       or jsonb_typeof(v_item -> 'quantity') <> 'number'
       or jsonb_typeof(v_item -> 'unit_price_cents') <> 'number'
       or (v_item ->> 'quantity')::numeric <= 0
       or (v_item ->> 'unit_price_cents')::numeric < 0
       or (v_item ->> 'unit_price_cents')::numeric <> trunc((v_item ->> 'unit_price_cents')::numeric) then
      raise exception 'invalid quote item: %', v_item using errcode = '23514';
    end if;
    v_total := v_total + round((v_item ->> 'quantity')::numeric * (v_item ->> 'unit_price_cents')::numeric);
  end loop;
  new.total_cents := v_total::int;
  return new;
end;
$$;

create trigger quotes_10_total
  before insert or update of items on public.quotes
  for each row execute function private.compute_quote_total();

-- Providers move quotes between draft and sent; the client's answer comes only through
-- respond_quote() and expiry from the scheduler.
create function private.guard_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'sent') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.provider_id is distinct from old.provider_id or new.public_token is distinct from old.public_token then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status
     and (old.status, new.status) not in (('draft', 'sent'), ('sent', 'draft')) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if old.status in ('accepted', 'declined', 'expired') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger quotes_05_guard
  before insert or update on public.quotes
  for each row execute function private.guard_quote();

create trigger quotes_20_touch
  before update on public.quotes
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Quote RPCs (public link)
-- ---------------------------------------------------------------------------

-- Quote for the client holding the link: no data about other clients, no draft.
create function public.get_quote_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', q.id,
           'title', q.title,
           'client_name', q.client_name,
           'items', q.items,
           'total_cents', q.total_cents,
           'valid_until', q.valid_until,
           'notes', q.notes,
           'status', case when q.status = 'sent' and q.valid_until < private.sp_date(now())
                          then 'expired'::public.quote_status else q.status end,
           'created_at', q.created_at,
           'provider', jsonb_build_object('display_name', p.display_name, 'slug', p.slug,
                                          'avatar_path', p.avatar_path,
                                          'page_public', p.status = 'approved')
         )
    from public.quotes q
    join public.providers p on p.id = q.provider_id
   where q.public_token = p_token and q.status <> 'draft';
$$;

create function public.respond_quote(p_token uuid, p_accept boolean)
returns public.quote_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_status public.quote_status := case when p_accept then 'accepted' else 'declined' end;
begin
  select * into v_quote from public.quotes where public_token = p_token and status <> 'draft' for update;
  if not found or p_accept is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_quote.status = 'expired'
     or (v_quote.status = 'sent' and v_quote.valid_until < private.sp_date(now())) then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  update public.quotes set status = v_status where id = v_quote.id;
  perform private.audit('quote.' || v_status::text, 'quote', v_quote.id::text, '{}'::jsonb);
  return v_status;
end;
$$;

revoke all on function public.get_quote_by_token(uuid) from public;
revoke all on function public.respond_quote(uuid, boolean) from public;
grant execute on function public.get_quote_by_token(uuid) to anon, authenticated;
grant execute on function public.respond_quote(uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Review rules
-- ---------------------------------------------------------------------------

-- Insert only by the booking's client, for a completed/released booking with an app
-- payment received/confirmed/released. Occupations without rating_ranking keep reviews
-- unpublished (visible to the provider and admins only).
create function private.check_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_ranking boolean;
begin
  select * into v_booking from public.bookings where id = new.booking_id;

  if tg_op = 'INSERT' then
    if not found
       or v_booking.client_id is null
       or new.client_id is distinct from v_booking.client_id
       or (private.is_client_context() and v_booking.client_id is distinct from auth.uid())
       or v_booking.status not in ('completed', 'released')
       or not exists (select 1 from public.payments p
                       where p.booking_id = v_booking.id and p.status in ('received', 'confirmed', 'released')) then
      raise exception 'review_not_allowed' using errcode = 'P0001';
    end if;
    new.provider_id := v_booking.provider_id;
  elsif new.booking_id is distinct from old.booking_id
        or new.client_id is distinct from old.client_id
        or new.provider_id is distinct from old.provider_id then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select op.rating_ranking into v_ranking
    from public.occupation_policies op where op.occupation_slug = v_booking.occupation_slug;
  if not coalesce(v_ranking, false) then
    new.published := false;
  end if;
  return new;
end;
$$;

create trigger reviews_check
  before insert or update on public.reviews
  for each row execute function private.check_review();

-- ---------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------

create policy quotes_select on public.quotes
  for select to authenticated
  using (provider_id = (select auth.uid()) or (select public.is_admin()));
create policy quotes_insert_own on public.quotes
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy quotes_update_own on public.quotes
  for update to authenticated
  using (provider_id = (select auth.uid())) with check (provider_id = (select auth.uid()));
create policy quotes_delete_own_draft on public.quotes
  for delete to authenticated using (provider_id = (select auth.uid()) and status = 'draft');

-- Published reviews reach the public through get_provider_page(); the table itself is
-- read by the author, the provider and admins.
create policy reviews_select on public.reviews
  for select to authenticated
  using (client_id = (select auth.uid()) or provider_id = (select auth.uid()) or (select public.is_admin()));
create policy reviews_insert_own on public.reviews
  for insert to authenticated with check (client_id = (select auth.uid()));
create policy reviews_update_own on public.reviews
  for update to authenticated
  using (client_id = (select auth.uid())) with check (client_id = (select auth.uid()));
create policy reviews_admin_update on public.reviews
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update on public.reviews to authenticated;

revoke all on all functions in schema private from public;
